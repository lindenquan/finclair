import { afterEach, describe, expect, it } from "vitest";
import { db } from "../src/admin.js";
import { creditScansOnce } from "../src/stripe.js";

afterEach(async () => {
  const [sessions, users] = await Promise.all([
    db.collection("processedSessions").get(),
    db.collection("users").get(),
  ]);
  await Promise.all([
    ...sessions.docs.map((d) => d.ref.delete()),
    ...users.docs.map((d) => d.ref.delete()),
  ]);
});

describe("creditScansOnce", () => {
  it("credits a user's scansPurchased on first call", async () => {
    const uid = "credit-user";
    const sessionId = "cs_test_first_call";
    await db.collection("users").doc(uid).set({ scansUsed: 0, scansPurchased: 0 });

    await creditScansOnce(sessionId, uid, 50);

    const userSnap = await db.collection("users").doc(uid).get();
    expect(userSnap.data()?.scansPurchased).toBe(50);

    const sessionSnap = await db.collection("processedSessions").doc(sessionId).get();
    expect(sessionSnap.exists).toBe(true);
    expect(sessionSnap.data()?.uid).toBe(uid);
    expect(sessionSnap.data()?.scans).toBe(50);
  });

  it("is idempotent: calling twice does not double-credit", async () => {
    const uid = "idempotent-user";
    const sessionId = "cs_test_idempotent";
    await db.collection("users").doc(uid).set({ scansUsed: 0, scansPurchased: 0 });

    await creditScansOnce(sessionId, uid, 50);
    // Simulate webhook + client-side fast path both firing
    await creditScansOnce(sessionId, uid, 50);

    const userSnap = await db.collection("users").doc(uid).get();
    expect(userSnap.data()?.scansPurchased).toBe(50); // not 100
  });

  it("is idempotent under concurrent calls", async () => {
    const uid = "concurrent-credit-user";
    const sessionId = "cs_test_concurrent";
    await db.collection("users").doc(uid).set({ scansUsed: 0, scansPurchased: 0 });

    // Simulate client fast-path and webhook arriving simultaneously
    await Promise.all([
      creditScansOnce(sessionId, uid, 200),
      creditScansOnce(sessionId, uid, 200),
      creditScansOnce(sessionId, uid, 200),
    ]);

    const userSnap = await db.collection("users").doc(uid).get();
    expect(userSnap.data()?.scansPurchased).toBe(200); // credited exactly once
  });
});
