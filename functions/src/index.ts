import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import Stripe from "stripe";
import { db } from "./admin.js";
import { consumeScan, getQuota } from "./quota.js";
import { checkRateLimit } from "./ratelimit.js";
import { parseReceipt } from "./receipt.js";
import { creditScansOnce } from "./stripe.js";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
const SCAN_RATE_LIMIT = 10; // requests per minute per user

const PLANS = {
  small: { priceId: "price_placeholder_small", scans: 50 },
  medium: { priceId: "price_placeholder_medium", scans: 200 },
  large: { priceId: "price_placeholder_large", scans: 1000 },
} as const;

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new HttpsError("internal", "Stripe not configured.");
  return new Stripe(key);
}

export const scanReceipt = onCall(
  {
    enforceAppCheck: true,
    minInstances: 0,
    maxInstances: 50,
    concurrency: 40,
    memory: "1GiB",
    cpu: 1,
    timeoutSeconds: 60,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }

    await checkRateLimit(request.auth.uid, SCAN_RATE_LIMIT);

    const { image, mimeType } = request.data as { image?: string; mimeType?: string };

    if (!image || !mimeType) {
      throw new HttpsError("invalid-argument", "image and mimeType are required.");
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
      throw new HttpsError("invalid-argument", "Unsupported image type.");
    }

    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(image)) {
      throw new HttpsError("invalid-argument", "Invalid base64 image.");
    }

    const sizeBytes = Math.ceil((image.length * 3) / 4);
    if (sizeBytes > MAX_IMAGE_SIZE) {
      throw new HttpsError("invalid-argument", "Image too large (max 10MB).");
    }

    const canScan = await consumeScan(request.auth.uid);
    if (!canScan) {
      throw new HttpsError("resource-exhausted", "No scans remaining. Purchase more credits.");
    }

    try {
      const data = await parseReceipt(image, mimeType);
      return { success: true, data };
    } catch (err) {
      console.error("scanReceipt failed", { uid: request.auth.uid, err });
      throw new HttpsError("internal", "Failed to parse receipt.");
    }
  },
);

export const getMyQuota = onCall(
  {
    enforceAppCheck: true,
    minInstances: 0,
    maxInstances: 20,
    concurrency: 80,
    memory: "256MiB",
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }
    return getQuota(request.auth.uid);
  },
);

export const createCheckoutSession = onCall(
  {
    enforceAppCheck: true,
    secrets: ["STRIPE_SECRET_KEY"],
    minInstances: 0,
    maxInstances: 10,
    concurrency: 40,
    memory: "256MiB",
    timeoutSeconds: 15,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");

    const { plan } = request.data as { plan?: keyof typeof PLANS };
    const chosen = plan ? PLANS[plan] : undefined;
    if (!chosen) throw new HttpsError("invalid-argument", "Unknown plan.");

    if (chosen.priceId.startsWith("price_placeholder_")) {
      throw new HttpsError("internal", "Stripe price IDs are not configured.");
    }

    const appUrl = process.env.APP_URL;
    if (!appUrl) throw new HttpsError("internal", "APP_URL is not configured.");

    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price: chosen.priceId, quantity: 1 }],
      metadata: {
        uid: request.auth.uid,
        scans: String(chosen.scans),
      },
      success_url: `${appUrl}/buy/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/buy/cancel`,
    });

    return { url: session.url };
  },
);

export const redeemPurchase = onCall(
  {
    enforceAppCheck: true,
    secrets: ["STRIPE_SECRET_KEY"],
    minInstances: 0,
    maxInstances: 20,
    concurrency: 40,
    memory: "256MiB",
    timeoutSeconds: 15,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");

    const { sessionId } = request.data as { sessionId?: string };
    if (!sessionId?.startsWith("cs_")) {
      throw new HttpsError("invalid-argument", "Invalid session.");
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      throw new HttpsError("failed-precondition", "Payment not completed.");
    }
    if (session.metadata?.uid !== request.auth.uid) {
      throw new HttpsError("permission-denied", "Session does not belong to you.");
    }

    const scans = Number(session.metadata.scans ?? 0);
    if (!scans) throw new HttpsError("internal", "Session missing scan count.");

    await creditScansOnce(sessionId, request.auth.uid, scans);
    return { ok: true, scans };
  },
);

export const stripeWebhook = onRequest(
  {
    secrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    minInstances: 0,
    maxInstances: 20,
    concurrency: 40,
    memory: "256MiB",
    timeoutSeconds: 15,
  },
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    if (typeof sig !== "string") {
      res.status(400).send("Missing signature");
      return;
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      res.status(500).send("Webhook secret not configured");
      return;
    }

    const stripe = getStripe();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      res.status(400).send("Bad signature");
      return;
    }

    try {
      await handleStripeEvent(stripe, event);
    } catch (err) {
      console.error("Webhook handler failed:", { type: event.type, err });
      res.status(500).send("Handler failed");
      return;
    }

    res.status(200).send("ok");
  },
);

async function handleStripeEvent(stripe: Stripe, event: Stripe.Event): Promise<void> {
  if (event.type === "checkout.session.completed") {
    await handleSessionCompleted(event.data.object);
  } else if (event.type === "charge.refunded") {
    await handleRefund(stripe, event.data.object);
  } else if (event.type === "charge.dispute.created") {
    const dispute = event.data.object;
    const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
    if (chargeId) {
      const charge = await stripe.charges.retrieve(chargeId);
      await handleRefund(stripe, charge);
    }
  }
}

async function handleSessionCompleted(s: Stripe.Checkout.Session): Promise<void> {
  const uid = s.metadata?.uid;
  const scans = Number(s.metadata?.scans ?? 0);
  if (s.payment_status === "paid" && uid && scans > 0) {
    await creditScansOnce(s.id, uid, scans);
  }
}

async function handleRefund(stripe: Stripe, charge: Stripe.Charge): Promise<void> {
  const paymentIntentId =
    typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;

  if (!paymentIntentId) return;

  const sessions = await stripe.checkout.sessions.list({
    payment_intent: paymentIntentId,
    limit: 1,
  });
  const s = sessions.data[0];
  const uid = s?.metadata?.uid;
  const scans = Number(s?.metadata?.scans ?? 0);

  if (uid && scans > 0) {
    // Clamp scansPurchased at 0 — read current value, subtract, floor at zero
    await db.runTransaction(async (tx) => {
      const ref = db.collection("users").doc(uid);
      const snap = await tx.get(ref);
      if (!snap.exists) return; // no user doc — nothing to claw back
      const data = snap.data();
      const current = typeof data?.scansPurchased === "number" ? data.scansPurchased : 0;
      const updated = Math.max(0, current - scans);
      tx.update(ref, { scansPurchased: updated });
    });
  }
}
