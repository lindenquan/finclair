import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { db } from "./admin.js";

export async function checkRateLimit(uid: string, maxPerMinute: number): Promise<void> {
  const ref = db.collection("rateLimits").doc(uid);
  const now = Date.now();
  const windowMs = 60_000;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() ?? { windowStart: 0, count: 0 };
    const windowStart = typeof data.windowStart === "number" ? data.windowStart : 0;
    const count = typeof data.count === "number" ? data.count : 0;

    if (now - windowStart > windowMs) {
      tx.set(ref, { windowStart: now, count: 1 });
    } else if (count >= maxPerMinute) {
      throw new HttpsError("resource-exhausted", "Rate limit exceeded. Try again in a minute.");
    } else {
      tx.update(ref, { count: FieldValue.increment(1) });
    }
  });
}
