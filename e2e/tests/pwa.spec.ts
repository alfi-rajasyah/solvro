import { test, expect, loginViaUi } from "../fixtures/test";

// PWA support (manifest, service worker registration) is being built on
// feat/pwa-mobile, which is still in flight. These specs are wired up now so
// they're ready to enable the moment that branch merges — for now the
// assertions are marked fixme so CI doesn't fail on a feature that doesn't
// exist yet.

test.describe("pwa", () => {
  test("manifest link is present", async ({ page }) => {
    // enable after feat/pwa-mobile merges
    test.fixme();
    await page.goto("/", { waitUntil: "networkidle" });
    const manifestHref = await page
      .locator('link[rel="manifest"]')
      .first()
      .getAttribute("href");
    expect(manifestHref).toBeTruthy();
  });

  test("service worker registers", async ({ page }) => {
    // enable after feat/pwa-mobile merges
    test.fixme();
    await loginViaUi(page);
    const registrations = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return "unsupported";
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.length;
    });
    expect(registrations).not.toBe("unsupported");
    expect(registrations as number).toBeGreaterThan(0);
  });

  test("theme-color meta tag is set", async ({ page }) => {
    // enable after feat/pwa-mobile merges
    test.fixme();
    await page.goto("/", { waitUntil: "networkidle" });
    const themeColor = await page
      .locator('meta[name="theme-color"]')
      .first()
      .getAttribute("content");
    expect(themeColor).toBeTruthy();
  });
});
