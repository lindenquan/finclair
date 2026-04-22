import { describe, expect, it, vi } from "vitest";

// Mock Firebase before importing the module under test
vi.mock("$lib/firebase", () => ({
  functions: null,
  isFirebaseConfigured: false,
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: vi.fn(),
}));

const { getQuota, scanReceipt, isFirebaseConfigured } = await import("$lib/services/receipt");

describe("getQuota", () => {
  it("returns zero quota when Firebase is not configured", async () => {
    const quota = await getQuota();
    expect(quota).toEqual({ remaining: 0, total: 0, used: 0 });
  });
});

describe("scanReceipt", () => {
  it("throws when Firebase is not configured", async () => {
    const file = new File(["data"], "receipt.jpg", { type: "image/jpeg" });
    await expect(scanReceipt(file)).rejects.toThrow("Firebase not configured");
  });
});

describe("isFirebaseConfigured", () => {
  it("is false when config is missing", () => {
    expect(isFirebaseConfigured).toBe(false);
  });
});
