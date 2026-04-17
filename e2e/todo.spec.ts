import { expect, test } from "@playwright/test";

test.describe("Login Page", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
	});

	test("shows app title", async ({ page }) => {
		await expect(page.getByRole("heading", { name: "Finclair" })).toBeVisible();
	});

	test("shows sign-in button", async ({ page }) => {
		await expect(page.getByRole("button", { name: /sign in with google/i })).toBeVisible();
	});

	test("shows app description", async ({ page }) => {
		await expect(page.getByText("Your personal financial clarity.")).toBeVisible();
	});
});
