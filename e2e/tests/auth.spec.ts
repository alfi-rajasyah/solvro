import { test, expect, loginViaUi, submitLoginForm, ADMIN_EMAIL, ADMIN_PASSWORD } from "../fixtures/test";
import { login } from "../fixtures/seed";

// The seeded QA stack has Google sign-in NOT configured (no clientId, no
// allowed domains — see backend/prisma/seed.ts). Login renders no Google
// section at all in that case: just the password form, expanded by default
// with no "Admin sign-in" accordion to click through (see frontend's
// pages/Login.tsx). These specs assert that reality.

test.describe("auth", () => {
  test("Google not configured: password form renders directly, no accordion", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByText(/Admin sign-in/i)).toHaveCount(0);
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test("password sign-in logs in", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

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

// A full page load right after sign-in used to bounce admin pages to
// Overview: the guard read the localStorage user before /auth/me answered,
// and that cached copy could be missing or stale. The guard now waits for
// the server's answer before it denies access.
test.describe("auth: admin guard on a fresh page load", () => {
  // page.route below must not be bypassed by the PWA service worker.
  test.use({ serviceWorkers: "block" });

  test("an admin page opened with no cached user stays on the admin page", async ({ page }) => {
    await loginViaUi(page);
    // Simulate the race deterministically: no cached user, and a slow /auth/me.
    await page.evaluate(() => localStorage.removeItem("solvro.user"));
    await page.route("**/auth/me", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.continue();
    });
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1, name: /admin/i })).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/admin/);
  });

  test("an admin page opened right after sign-in stays on the admin page", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes("login"), { timeout: 10_000 });
    // Sign-in stores the user next to the session token, so a full page load
    // from here already has both.
    const stored = await page.evaluate(() => ({
      token: localStorage.getItem("solvro.token"),
      user: localStorage.getItem("solvro.user"),
    }));
    expect(stored.token).not.toBeNull();
    expect(stored.user).not.toBeNull();
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1, name: /admin/i })).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/admin/);
  });

  // Sign-in starts an /auth/me call; leaving the page before it answers
  // aborts it, and that failure used to clear the stored token — the next
  // page then opened signed out. A slow /auth/me makes the abort certain.
  test("leaving the page while /auth/me is in flight keeps the session", async ({ page }) => {
    await page.route("**/auth/me", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      // The first call is aborted by the navigation below.
      await route.continue().catch(() => {});
    });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    const meRequest = page.waitForRequest("**/auth/me");
    await page.click('button[type="submit"]');
    await meRequest;
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1, name: /admin/i })).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/admin/);
  });
});

// docs/archive/plans/application-review-2026-10-22.md, F-08: signing out used to leave React Query's
// cache in place, so the next account to sign in on the same browser saw the
// previous account's project list (served from cache; the list query has a
// 30 s staleTime, so it was not even refetched).
test.describe("auth — sign-out clears the previous account's cached data", () => {
  test("a second account signed in on the same tab never sees the first account's projects", async ({
    page,
  }, testInfo) => {
    // The top-bar user menu is opened through its username/role label, which
    // the phone layout hides below `md:` — same desktop-only rule as the other
    // layout-dependent specs.
    test.skip(testInfo.project.name !== "desktop", "Top-bar user menu label asserted at desktop width");
    const base = new URL(testInfo.project.use.baseURL ?? "http://localhost:8080").origin;
    const stamp = Date.now();
    const admin = await login(base);
    const headers = { Authorization: `Bearer ${admin.token}`, "Content-Type": "application/json" };

    // A project only the admin can see, and a TAM with no projects at all.
    const customer = await (
      await fetch(`${base}/api/customers`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: `Cache Co ${stamp}`, description: "e2e cache-clear fixture" }),
      })
    ).json();
    const projectName = `Cache Project ${stamp}`;
    await fetch(`${base}/api/projects`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: projectName, customerId: customer.id }),
    });
    // The throwaway TAM reuses the fixture admin password (fixtures/seed.ts,
    // ignored by secret scanning) — the test is about cache isolation, not
    // credentials, and a second literal here would be flagged as a secret.
    const tamEmail = `cache-tam-${stamp}@solvro.test`;
    const tamPassword = ADMIN_PASSWORD;
    const tamUsername = `cachetam${stamp}`;
    await fetch(`${base}/api/admin/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email: tamEmail, username: tamUsername, password: tamPassword, role: "TAM" }),
    });

    // The first account is a throwaway ADMIN-role user, not the shared QA
    // admin: signing out revokes every token of the account
    // (docs/archive/plans/application-review-2026-10-22.md, N-01), and the
    // seeded specs share the QA admin's token.
    const firstEmail = `cache-admin-${stamp}@solvro.test`;
    const firstUsername = `cacheadmin${stamp}`;
    await fetch(`${base}/api/admin/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email: firstEmail, username: firstUsername, password: tamPassword, role: "ADMIN" }),
    });

    // The first account sees the project on the Projects page (fills the cache).
    await loginViaUi(page, firstEmail, tamPassword);
    await page.goto("/projects", { waitUntil: "networkidle" });
    await expect(page.getByText(projectName)).toBeVisible();

    // Sign out through the top-bar menu, then sign in as the TAM. The token is
    // captured first: signing out must revoke it on the server, not only clear
    // it from the browser.
    const signedOutToken = await page.evaluate(() => localStorage.getItem("solvro.token"));
    expect(signedOutToken).toBeTruthy();
    await page.locator("header button").filter({ hasText: /admin/i }).first().click();
    await page.getByRole("button", { name: /sign out/i }).click();
    await page.waitForURL(/login/i, { timeout: 10_000 });
    // The logout request is fire-and-forget in the app, so poll until it lands.
    await expect
      .poll(
        async () =>
          (await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${signedOutToken}` } })).status,
        { timeout: 10_000 },
      )
      .toBe(401);
    await submitLoginForm(page, tamEmail, tamPassword);
    await page.waitForURL(/overview|projects|\/$/i, { timeout: 10_000 });

    // Client-side navigation (not page.goto): a full page load would create
    // a fresh QueryClient and hide the bug — the leak lives in the in-memory
    // cache of the tab the first account used.
    await page.getByRole("link", { name: "Projects" }).first().click();
    await expect(page).toHaveURL(/\/projects$/);
    // Give a stale cache every chance to paint before asserting.
    await page.waitForTimeout(1000);
    await expect(page.getByText(projectName)).toHaveCount(0);
  });
});
