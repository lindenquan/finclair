import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin.js";

const FREE_SCANS = 10;

export interface QuotaInfo {
  remaining: number;
  total: number;
  used: number;
}

export async function getQuota(uid: string): Promise<QuotaInfo> {
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();

  if (!snap.exists) {
    await ref.set({ scansUsed: 0, scansPurchased: 0 });
    return { remaining: FREE_SCANS, total: FREE_SCANS, used: 0 };
  }

  const data = snap.data() ?? {};
  const used = typeof data.scansUsed === "number" ? data.scansUsed : 0;
  const purchased = typeof data.scansPurchased === "number" ? data.scansPurchased : 0;
  const total = FREE_SCANS + purchased;
  return { remaining: Math.max(0, total - used), total, used };
}

export async function consumeScan(uid: string): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const ref = db.collection("users").doc(uid);
    const snap = await tx.get(ref);

    if (!snap.exists) {
      tx.set(ref, { scansUsed: 1, scansPurchased: 0 });
      return true;
    }

    const data = snap.data() ?? {};
    const used = typeof data.scansUsed === "number" ? data.scansUsed : 0;
    const purchased = typeof data.scansPurchased === "number" ? data.scansPurchased : 0;
    if (used >= FREE_SCANS + purchased) return false;

    tx.update(ref, { scansUsed: FieldValue.increment(1) });
    return true;
  });
}

export async function addPurchasedScans(uid: string, count: number): Promise<void> {
  await db
    .collection("users")
    .doc(uid)
    .set({ scansPurchased: FieldValue.increment(count) }, { merge: true });
}
