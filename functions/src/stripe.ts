import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin.js";

export async function creditScansOnce(
  sessionId: string,
  uid: string,
  scans: number,
): Promise<void> {
  await db.runTransaction(async (tx) => {
    const ref = db.collection("processedSessions").doc(sessionId);
    const snap = await tx.get(ref);
    if (snap.exists) return; // already credited — no-op

    tx.set(ref, { uid, scans, at: FieldValue.serverTimestamp() });
    tx.set(
      db.collection("users").doc(uid),
      { scansPurchased: FieldValue.increment(scans) },
      { merge: true },
    );
  });
}
