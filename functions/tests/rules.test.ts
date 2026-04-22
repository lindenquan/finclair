import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, afterEach, beforeAll, describe, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-finclair",
    firestore: {
      rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

// ── users/{uid} ───────────────────────────────────────────────────────────────

describe("users/{uid} rules", () => {
  it("allows an authenticated user to read their own document", async () => {
    const uid = "alice";
    // Seed via admin context (bypasses rules)
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("users").doc(uid).set({ scansUsed: 0, scansPurchased: 0 });
    });

    const alice = testEnv.authenticatedContext(uid);
    await assertSucceeds(alice.firestore().collection("users").doc(uid).get());
  });

  it("denies an authenticated user reading another user's document", async () => {
    const bob = testEnv.authenticatedContext("bob");
    await assertFails(bob.firestore().collection("users").doc("alice").get());
  });

  it("denies an unauthenticated read", async () => {
    const guest = testEnv.unauthenticatedContext();
    await assertFails(guest.firestore().collection("users").doc("alice").get());
  });

  it("denies any client write to users collection", async () => {
    const alice = testEnv.authenticatedContext("alice");
    await assertFails(
      alice.firestore().collection("users").doc("alice").set({ scansUsed: 0, scansPurchased: 999 }),
    );
  });
});

// ── processedSessions/{id} ────────────────────────────────────────────────────

describe("processedSessions/{id} rules", () => {
  it("denies any read by authenticated users", async () => {
    const alice = testEnv.authenticatedContext("alice");
    await assertFails(alice.firestore().collection("processedSessions").doc("cs_test").get());
  });

  it("denies any write by authenticated users", async () => {
    const alice = testEnv.authenticatedContext("alice");
    await assertFails(
      alice
        .firestore()
        .collection("processedSessions")
        .doc("cs_test")
        .set({ uid: "alice", scans: 50 }),
    );
  });

  it("denies unauthenticated access", async () => {
    const guest = testEnv.unauthenticatedContext();
    await assertFails(guest.firestore().collection("processedSessions").doc("cs_test").get());
  });
});

// ── rateLimits/{uid} ─────────────────────────────────────────────────────────

describe("rateLimits/{uid} rules", () => {
  it("denies any read by authenticated users", async () => {
    const alice = testEnv.authenticatedContext("alice");
    await assertFails(alice.firestore().collection("rateLimits").doc("alice").get());
  });

  it("denies any write by authenticated users", async () => {
    const alice = testEnv.authenticatedContext("alice");
    await assertFails(
      alice.firestore().collection("rateLimits").doc("alice").set({ windowStart: 0, count: 1 }),
    );
  });

  it("denies unauthenticated access", async () => {
    const guest = testEnv.unauthenticatedContext();
    await assertFails(guest.firestore().collection("rateLimits").doc("alice").get());
  });
});
