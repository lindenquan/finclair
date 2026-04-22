import { afterEach, describe, expect, it } from "vitest";
import { db } from "../src/admin.js";
import { consumeScan, getQuota } from "../src/quota.js";

afterEach(async () => {
  // Clean up users collection between tests
  const snaps = await db.collection("users").get();
  await Promise.all(snaps.docs.map((d) => d.ref.delete()));
});

describe("getQuota", () => {
  it("returns FREE_SCANS for a new user and creates the document", async () => {
    const uid = "new-user-quota";
    const quota = await getQuota(uid);

    expect(quota.remaining).toBe(10);
    expect(quota.total).toBe(10);
    expect(quota.used).toBe(0);

    const snap = await db.collection("users").doc(uid).get();
    expect(snap.exists).toBe(true);
  });

  it("returns correct balance for an existing user", async () => {
    const uid = "existing-user-quota";
    await db.collection("users").doc(uid).set({ scansUsed: 4, scansPurchased: 5 });

    const quota = await getQuota(uid);

    expect(quota.used).toBe(4);
    expect(quota.total).toBe(15); // 10 free + 5 purchased
    expect(quota.remaining).toBe(11);
  });

  it("clamps remaining to 0 when overdrawn", async () => {
    const uid = "overdrawn-user";
    await db.collection("users").doc(uid).set({ scansUsed: 12, scansPurchased: 0 });

    const quota = await getQuota(uid);
    expect(quota.remaining).toBe(0);
  });
});

describe("consumeScan", () => {
  it("allows a scan for a new user and counts it", async () => {
    const uid = "consume-new-user";
    const ok = await consumeScan(uid);

    expect(ok).toBe(true);
    const snap = await db.collection("users").doc(uid).get();
    expect(snap.data()?.scansUsed).toBe(1);
  });

  it("returns false when quota is exhausted", async () => {
    const uid = "exhausted-user";
    await db.collection("users").doc(uid).set({ scansUsed: 10, scansPurchased: 0 });

    const ok = await consumeScan(uid);
    expect(ok).toBe(false);

    // Document must not have been incremented
    const snap = await db.collection("users").doc(uid).get();
    expect(snap.data()?.scansUsed).toBe(10);
  });

  it("prevents race condition: only the correct number of concurrent scans succeed", async () => {
    const uid = "race-condition-user";
    // 1 scan remaining (9 used, 0 purchased → 10 free - 9 = 1)
    await db.collection("users").doc(uid).set({ scansUsed: 9, scansPurchased: 0 });

    // Fire 5 concurrent calls — exactly 1 should succeed
    const results = await Promise.all(Array.from({ length: 5 }, () => consumeScan(uid)));

    expect(results.filter(Boolean)).toHaveLength(1);

    const snap = await db.collection("users").doc(uid).get();
    expect(snap.data()?.scansUsed).toBe(10);
  });
});
