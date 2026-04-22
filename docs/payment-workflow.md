# Payment Workflow

Stripe Checkout with a **dual-path credit** design: fast client verification for UX + webhook safety net for reliability. Both paths are idempotent via a shared Firestore transaction keyed by `sessionId`.

## Why dual-path

| Failure | Webhook-only | Client-only | Both |
|---|---|---|---|
| Webhook delayed 10s | ❌ balance lags | ✅ | ✅ |
| Webhook never arrives | ❌ balance never credits | ✅ | ✅ |
| User closes browser before redirect | ✅ | ❌ balance never credits | ✅ |
| User paid but redirect page fails to load | ✅ | ❌ | ✅ |
| Network drops between Stripe → your server | ❌ | ✅ | ✅ |

Webhook is the *source of truth* for durability. Client-side verify is the *UX optimisation* for immediate balance updates.

## Flow diagram

```
┌───────┐                ┌──────────────────┐               ┌─────────┐
│Client │                │  Cloud Functions │               │ Stripe  │
└───┬───┘                └────────┬─────────┘               └────┬────┘
    │                             │                              │
    │ createCheckoutSession(plan) │                              │
    ├────────────────────────────▶│                              │
    │                             │  sessions.create             │
    │                             ├─────────────────────────────▶│
    │                             │◀─────────{session.url}───────│
    │◀───────{url}────────────────│                              │
    │                             │                              │
    │ window.location = url       │                              │
    ├─────────────────────────────────────────────────────────▶  │
    │                             │                              │
    │                             │   user pays on Stripe        │
    │                             │                              │
    │◀───redirect ?session_id=cs_xxx ────────────────────────────│
    │                             │                              │
    │                             │                              │
    │  ┌── FAST PATH ──┐           │                              │
    │ redeemPurchase(sessionId)   │                              │
    ├────────────────────────────▶│                              │
    │                             │  sessions.retrieve(id)       │
    │                             ├─────────────────────────────▶│
    │                             │◀──{payment_status:"paid"}────│
    │                             │                              │
    │                             │  txn: creditScansOnce(...)   │
    │                             │                              │
    │◀────────{ok}────────────────│                              │
    │                             │                              │
    │  ┌── SAFETY NET ──┐          │                              │
    │                             │◀──webhook: checkout.session.completed
    │                             │                              │
    │                             │  verify signature            │
    │                             │  txn: creditScansOnce(...)   │
    │                             │  → no-op (already credited)  │
    │                             │─200 OK ─────────────────────▶│
```

## The idempotency invariant

Both paths call the **same** shared function:

```ts
// functions/src/stripe.ts
async function creditScansOnce(
  sessionId: string,
  uid: string,
  scans: number,
): Promise<void> {
  await db.runTransaction(async (tx) => {
    const ref = db.collection("processedSessions").doc(sessionId);
    const snap = await tx.get(ref);
    if (snap.exists) return; // already credited — no-op

    tx.set(ref, { uid, scans, at: FieldValue.serverTimestamp() });
    tx.update(db.collection("users").doc(uid), {
      scansPurchased: FieldValue.increment(scans),
    });
  });
}
```

**Why a transaction:** without it, the two paths race. Client hits `redeemPurchase` at T+500ms, webhook arrives at T+600ms, both read "not yet processed", both credit → user gets 2× scans. Transaction serialises the read+write so exactly one wins.

**Why the session ID as key:** Stripe guarantees Checkout Session IDs are globally unique and never reused. Using it as the Firestore doc ID gives natural replay protection with zero extra code.

## 1. Create checkout session

```ts
// functions/src/index.ts
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const createCheckoutSession = onCall(
  { secrets: ["STRIPE_SECRET_KEY"] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");

    const { plan } = request.data as { plan: "small" | "medium" | "large" };
    const plans = {
      small:  { priceId: "price_xxx_small",  scans: 50 },
      medium: { priceId: "price_xxx_medium", scans: 200 },
      large:  { priceId: "price_xxx_large",  scans: 1000 },
    };
    const chosen = plans[plan];
    if (!chosen) throw new HttpsError("invalid-argument", "Unknown plan.");

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"], // synchronous confirmation only
      line_items: [{ price: chosen.priceId, quantity: 1 }],
      metadata: {
        uid: request.auth.uid,
        scans: String(chosen.scans),
      },
      success_url: "https://<github-pages-domain>/buy/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url:  "https://<github-pages-domain>/buy/cancel",
    });

    return { url: session.url };
  },
);
```

**Critical fields:**

- `payment_method_types: ["card"]` — guarantees synchronous confirmation. `payment_status` is always `paid` on redirect. No processing/pending states to handle.
- `metadata.uid` — links the session back to the Firebase user. Both credit paths verify `session.metadata.uid === request.auth.uid` (client) or use it directly (webhook).
- `metadata.scans` — how many scans to credit. Server sets this from the known plan, never trusts the client.
- `{CHECKOUT_SESSION_ID}` template — Stripe substitutes the real ID in the redirect URL.

## 2. Fast path — client-side verification

```ts
// functions/src/index.ts
export const redeemPurchase = onCall(
  { secrets: ["STRIPE_SECRET_KEY"] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");

    const { sessionId } = request.data as { sessionId: string };
    if (!sessionId?.startsWith("cs_")) {
      throw new HttpsError("invalid-argument", "Invalid session.");
    }

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
```

**Three required checks:**

1. `payment_status === "paid"` — Stripe confirms money was received.
2. `metadata.uid === request.auth.uid` — blocks user A replaying user B's session ID (e.g. guessed or leaked).
3. Idempotency inside the transaction — blocks double-credit when both paths run.

## 3. Safety net — webhook

Stripe requires raw body access for signature verification, so this must be an HTTP function (`onRequest`), not `onCall`:

```ts
// functions/src/webhook.ts
import { onRequest } from "firebase-functions/v2/https";

export const stripeWebhook = onRequest(
  { secrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] },
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    if (typeof sig !== "string") {
      res.status(400).send("Missing signature");
      return;
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody, // firebase-functions provides this
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!,
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      res.status(400).send("Bad signature");
      return;
    }

    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      const uid = s.metadata?.uid;
      const scans = Number(s.metadata?.scans ?? 0);

      if (s.payment_status === "paid" && uid && scans > 0) {
        try {
          await creditScansOnce(s.id, uid, scans);
        } catch (err) {
          console.error("Credit failed:", err);
          // Return 500 so Stripe retries — transaction is idempotent, safe
          res.status(500).send("Credit failed");
          return;
        }
      }
    }

    res.status(200).send("ok");
  },
);
```

**Key points:**

- `req.rawBody` is the unparsed body Stripe signed. Do not use `req.body` — it's already JSON-parsed and the signature won't match.
- Return 200 on handled and on skipped event types. Returning 5xx causes Stripe to retry for up to 3 days.
- On credit failure, return 500 so Stripe retries. The transaction is idempotent so retries are safe.
- Ignore any event you don't care about (return 200 and skip). Stripe sends many event types (`payment_intent.succeeded`, `charge.succeeded`, etc.); only `checkout.session.completed` should credit.

## 4. Client integration

```ts
// src/lib/services/purchase.ts
import { getFunctions, httpsCallable } from "firebase/functions";

export async function startCheckout(plan: "small" | "medium" | "large") {
  const fn = httpsCallable<{ plan: string }, { url: string }>(
    getFunctions(),
    "createCheckoutSession",
  );
  const { data } = await fn({ plan });
  window.location.href = data.url;
}

export async function redeemSession(sessionId: string) {
  const fn = httpsCallable<{ sessionId: string }, { ok: boolean; scans: number }>(
    getFunctions(),
    "redeemPurchase",
  );
  const { data } = await fn({ sessionId });
  return data;
}
```

**Success page component** (`src/routes/buy/success/+page.svelte`):
```svelte
<script lang="ts">
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { redeemSession } from "$lib/services/purchase";

  let status = $state<"pending" | "ok" | "err">("pending");

  onMount(async () => {
    const sessionId = page.url.searchParams.get("session_id");
    if (!sessionId) { status = "err"; return; }
    try {
      await redeemSession(sessionId);
      status = "ok";
    } catch {
      // Webhook will credit as safety net — show friendly message
      status = "pending";
    }
  });
</script>

{#if status === "ok"}
  Thanks! Your scans have been added.
{:else if status === "pending"}
  Payment received. Balance will update shortly.
{:else}
  Something went wrong. Contact support if your balance doesn't update in a minute.
{/if}
```

## Configuring Stripe (one-time)

See [manual-setup.md](manual-setup.md) for the full checklist. Summary:

1. Create products + prices in Stripe Dashboard.
2. `Settings → Payment methods` — disable anything async (SEPA, ACH, OXXO, Boleto, Konbini, Multibanco). Keep card, Apple Pay, Google Pay, Link.
3. `Developers → Webhooks` — add endpoint pointing to your deployed `stripeWebhook` URL. Subscribe to `checkout.session.completed`. Copy signing secret.
4. Store secrets in Firebase:
   ```bash
   firebase functions:secrets:set STRIPE_SECRET_KEY
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
   ```

## Edge cases

| Scenario | Behaviour |
|---|---|
| User pays, redirect lands, fast path succeeds | Balance credits in ~500 ms. Webhook arrives later, no-op. |
| User pays, closes browser before redirect | Webhook credits within seconds. User sees credited balance on next visit. |
| User refreshes success page or shares URL | Fast path re-runs, `processedSessions` already has the doc → no-op. Response: `{ ok: true }`. |
| Attacker passes someone else's session ID | `metadata.uid` mismatch → `permission-denied`. |
| Attacker passes a fake session ID | `sessions.retrieve` returns 404 → Stripe SDK throws → client sees error. |
| Stripe webhook retries (same event twice) | Transaction is idempotent. Second attempt no-ops. Return 200 both times. |
| Stripe sends unrelated event types | Handler checks `event.type === "checkout.session.completed"`. Others return 200 and skip. |
| User disputes charge / refunds | Currently not handled. See [issues-and-improvements.md](issues-and-improvements.md) — add `charge.refunded` handler to deduct scans. |

## Testing

- **Unit**: mock Stripe SDK, assert `creditScansOnce` is called with correct args. Test the idempotency path by calling it twice.
- **Integration**: Firestore emulator + Stripe test-mode session → actually run a fake purchase.
- **Manual**: Use Stripe CLI to forward webhooks locally:
  ```bash
  stripe listen --forward-to http://localhost:5001/<project>/us-central1/stripeWebhook
  stripe trigger checkout.session.completed
  ```
