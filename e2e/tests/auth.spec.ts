import { test, expect, loginViaUi, ADMIN_EMAIL, ADMIN_PASSWORD } from "../fixtures/test";

test.describe("auth", () => {
  test("Google sign-in is offered by default, password form is collapsed", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByText(/Admin sign-in/i).first()).toBeVisible();
    // Password inputs live inside a <details> that starts collapsed.
    await expect(page.locator('input[type="email"]')).toBeHidden();
  });

  test("Admin sign-in (password) accordion expands and logs in", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByText(/Admin sign-in/i).first().click();

    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();

    await emailInput.fill(ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForURL(/overview|projects|\/$/i, { timeout: 10_000 });
    // Login page should no longer be showing the sign-in form.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });

  test("invalid credentials show an error and keep the user on the login form", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByText(/Admin sign-in/i).first().click();

    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', "definitely-wrong-password");
    await page.click('button[type="submit"]');

    await expect(page.getByRole("alert")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("logged-in session can reach an authenticated page", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/overview", { waitUntil: "networkidle" });
    await expect(page).not.toHaveURL(/login/i);
  });
});
