import { test as base, type Page, type TestInfo } from "@playwright/test";
import { seedFixture, type SeededFixture } from "./seed";

// Worker-scoped fixture: one seeded project per worker (effectively per test
// file, since playwright.config.ts pins workers: 1 and each spec file below
// only needs a single fresh project). Avoids reseeding per-test while still
// guaranteeing specs never depend on pre-existing data beyond the admin user.
interface WorkerFixtures {
  seededProject: SeededFixture;
}

export const test = base.extend<{}, WorkerFixtures>({
  seededProject: [
    async ({}, use, workerInfo) => {
      const base = workerInfo.project.use.baseURL ?? "http://localhost:8080";
      const fixture = await seedFixture(base);
      await use(fixture);
    },
    { scope: "worker" },
  ],
});

export { expect } from "@playwright/test";

/** The configured baseURL for the running project (desktop/mobile), origin only. */
export function apiBase(testInfo: TestInfo): string {
  return new URL(testInfo.project.use.baseURL ?? "http://localhost:8080").origin;
}

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "qa@solvro.test";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "QaTest1234!";

/**
 * Logs in through the UI. When Google sign-in is configured, the password
 * form lives behind the "Admin sign-in (password)" accordion and must be
 * expanded first; when Google sign-in is NOT configured (the default for
 * the seeded QA stack — no clientId/allowed domains), Login renders the
 * password form directly with no accordion, so there's nothing to click.
 */
export async function loginViaUi(
  page: Page,
  email = ADMIN_EMAIL,
  password = ADMIN_PASSWORD,
): Promise<void> {
  await page.goto("/", { waitUntil: "networkidle" });
  const accordion = page.getByText(/Admin sign-in/i).first();
  if (await accordion.isVisible().catch(() => false)) {
    await accordion.click();
  }
  const emailInput = page.locator('input[type="email"]');
  await emailInput.waitFor({ state: "visible" });
  await emailInput.fill(email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/overview|projects|\/$/i, { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

export async function openKanban(page: Page, projectId: number): Promise<void> {
  await page.goto(`/projects/${projectId}/kanban`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
}

/** Locates the drag grip belonging to the element containing `text`: the grip
 * whose center is nearest (and left of / above) the text's center. Ported
 * verbatim from the QA gate script's `gripFor` heuristic. */
export async function gripFor(page: Page, text: string, gripLabel: string) {
  const target = page.getByText(text, { exact: true }).first();
  const tb = await target.boundingBox();
  if (!tb) return null;
  const grips = page.locator(`[aria-label="${gripLabel}"]`);
  const n = await grips.count();
  let best: { x: number; y: number; width: number; height: number } | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < n; i++) {
    const gb = await grips.nth(i).boundingBox();
    if (!gb) continue;
    const d = Math.abs(gb.y + gb.height / 2 - (tb.y + tb.height / 2)) + Math.abs(gb.x - tb.x) / 10;
    if (d < bestDist) {
      bestDist = d;
      best = gb;
    }
  }
  return best;
}

export function center(box: { x: number; y: number; width: number; height: number }) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Mouse-based drag with interpolated moves (desktop / dnd-kit PointerSensor). */
export async function mouseDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 14; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 14, from.y + ((to.y - from.y) * i) / 14);
    await page.waitForTimeout(35);
  }
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(1400);
}

/** Touch-based drag via CDP, respecting dnd-kit's TouchSensor 250ms activation
 * delay — the QA smoke script's touch-drag test predates this and is stale;
 * this is the corrected version reused across kanban-dnd + smoke specs. */
export async function touchDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const client = await page.context().newCDPSession(page);
  const dispatch = (type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) =>
    client.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }],
    });

  await dispatch("touchStart", from.x, from.y);
  await page.waitForTimeout(400); // TouchSensor activation delay is 250ms
  for (let i = 1; i <= 12; i++) {
    await dispatch("touchMove", from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12);
    await page.waitForTimeout(50);
  }
  await dispatch("touchEnd", 0, 0);
  await page.waitForTimeout(1500);
}
