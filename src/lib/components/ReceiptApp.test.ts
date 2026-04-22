import { render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import ReceiptApp from "$lib/components/ReceiptApp.svelte";

// getQuota is called in onMount — return a stable value
vi.mock("$lib/services/receipt", async (importOriginal) => {
  const actual = await importOriginal<typeof import("$lib/services/receipt")>();
  return {
    ...actual,
    isFirebaseConfigured: false,
    getQuota: vi.fn().mockResolvedValue({ remaining: 5, total: 10, used: 5 }),
    scanReceipt: vi.fn(),
  };
});

describe("ReceiptApp", () => {
  it("renders the app title", () => {
    render(ReceiptApp);
    expect(screen.getByRole("heading", { name: "Finclair" })).toBeInTheDocument();
  });

  it("shows offline warning when Firebase is not configured", () => {
    render(ReceiptApp);
    expect(screen.getByText(/Firebase not configured/i)).toBeInTheDocument();
  });
});
