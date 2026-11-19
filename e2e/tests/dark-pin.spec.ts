import type { Locator } from "@playwright/test";
import { test, expect, loginViaUi } from "../fixtures/test";

// Login's root wrapper and the Sidebar rail pin `.dark` on themselves so they
// stay dark when the app is in the light theme (DESIGN.md: fixed brand
// elements). The pin once regressed silently after a @theme change; this spec
// forces the light theme and asserts the computed backgrounds are dark while
// the page body is light.

test.use({ colorScheme: "light" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("solvro.theme", "light");
  });
});

/** Relative luminance (0..1) of a computed CSS property, resolved to sRGB bytes. */
async function luminanceOf(
  locator: Locator,
  property: "backgroundColor" | "color",
): Promise<number> {
  return locator.evaluate((el, prop) => {
    // Rasterise through a canvas so any CSS colour syntax (rgb, lab, oklch)
    // collapses to plain sRGB bytes.
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.fillStyle = getComputedStyle(el)[prop];
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    // A transparent background would read as black and pass a dark check.
    if (a < 255) throw new Error(`${prop} is not opaque (alpha ${a})`);
    const lin = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }, property);
}

const DARK_MAX = 0.05;
const LIGHT_MIN = 0.5;
// Rail text is token-routed (text-on-surface-variant), so it flips with the
// theme: #b0ada8 under .dark, #4a4a47 under light. The rail background is a
// literal hex that never flips, so it cannot prove the pin on its own.
const LIGHT_TEXT_MIN = 0.3;

test.describe("always-dark pin in the light theme", () => {
  test("the login page root stays dark", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
    await expect(page.locator("main.dark")).toBeVisible();
    expect(await luminanceOf(page.locator("main.dark"), "backgroundColor")).toBeLessThan(DARK_MAX);
  });

  test("the sidebar rail stays dark while the page is light", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/overview", { waitUntil: "networkidle" });
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
    expect(await luminanceOf(page.locator("body"), "backgroundColor")).toBeGreaterThan(LIGHT_MIN);

    // Below md the rail is an overlay drawer, closed until opened.
    const open = page.getByRole("button", { name: "Open navigation" });
    if (await open.isVisible().catch(() => false)) await open.click();

    const rail = page
      .locator("aside")
      .filter({ has: page.getByRole("link", { name: "Overview" }) });
    await expect(rail).toBeVisible();
    expect(await luminanceOf(rail, "backgroundColor")).toBeLessThan(DARK_MAX);
    expect(await luminanceOf(rail, "color")).toBeGreaterThan(LIGHT_TEXT_MIN);
  });
});
