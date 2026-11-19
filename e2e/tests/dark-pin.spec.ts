import type { Page } from "@playwright/test";
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

/** Relative luminance (0..1) of the element's resolved background colour. */
async function backgroundLuminance(page: Page, selector: string): Promise<number> {
  return page.locator(selector).first().evaluate((el) => {
    // Rasterise through a canvas so any CSS colour syntax (rgb, lab, oklch)
    // collapses to plain sRGB bytes.
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.fillStyle = "#000";
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = getComputedStyle(el).backgroundColor;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    const lin = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  });
}

const DARK_MAX = 0.05;
const LIGHT_MIN = 0.5;

test.describe("always-dark pin in the light theme", () => {
  test("the login page root stays dark", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
    await expect(page.locator("main.dark")).toBeVisible();
    expect(await backgroundLuminance(page, "main.dark")).toBeLessThan(DARK_MAX);
  });

  test("the sidebar rail stays dark while the page is light", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/overview", { waitUntil: "networkidle" });
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
    expect(await backgroundLuminance(page, "body")).toBeGreaterThan(LIGHT_MIN);

    // Below md the rail is an overlay drawer, closed until opened.
    const open = page.getByRole("button", { name: "Open navigation" });
    if (await open.isVisible().catch(() => false)) await open.click();

    const rail = page
      .locator("aside.dark")
      .filter({ has: page.getByRole("link", { name: "Overview" }) });
    await expect(rail).toBeVisible();
    expect(await backgroundLuminance(page, "aside.dark")).toBeLessThan(DARK_MAX);
  });
});
