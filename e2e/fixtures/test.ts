import { test as base, expect, type Page, type Request, type TestInfo } from "@playwright/test";
import { seedFixture, type SeededFixture } from "./seed";

// One seeded project per spec file. Tests in one file share it (several
// files build on what their own earlier tests did), but no file ever sees
// another file's tasks. A worker runs many files in a row (workers: 1), so a
// worker-scoped project would carry every earlier file's rows into the next:
// List sections, Gantt rows and Kanban cards that push targets off screen or
// change the order a test expects. The cache lives in the worker; the key is
// the file plus the --repeat-each index, so each repeat also starts clean.
// The fixture is test-scoped, so a beforeAll/afterAll hook cannot use it;
// a hook that needs the API signs in with `login()` from ./seed.
interface WorkerFixtures {
  seedCache: Map<string, Promise<SeededFixture>>;
}
interface TestFixtures {
  seededProject: SeededFixture;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  seedCache: [
    async ({}, use) => {
      await use(new Map());
    },
    { scope: "worker" },
  ],
  seededProject: async ({ seedCache }, use, testInfo) => {
    const key = `${testInfo.file}#${testInfo.repeatEachIndex}`;
    let seeded = seedCache.get(key);
    if (!seeded) {
      seeded = seedFixture(apiBase(testInfo));
      seedCache.set(key, seeded);
      seeded.catch(() => seedCache.delete(key));
    }
    await use(await seeded);
  },
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
  await submitLoginForm(page, email, password);
  await page.waitForURL(/overview|projects|\/$/i, { timeout: 10_000 }).catch(() => {});
  // The shell's search trigger exists on every authenticated page (desktop
  // box or mobile icon), so it marks the end of sign-in.
  await expect(page.locator('button[aria-label="Open search"]:visible').first()).toBeVisible();
}

/**
 * Fills and submits the login form on the page that is already showing it
 * (expanding the "Admin sign-in" accordion first when Google sign-in is
 * configured). Use when the test itself navigated to /login — e.g. via the
 * auth guard's redirect — and needs to assert where sign-in lands.
 */
export async function submitLoginForm(
  page: Page,
  email = ADMIN_EMAIL,
  password = ADMIN_PASSWORD,
): Promise<void> {
  const accordion = page.getByText(/Admin sign-in/i).first();
  if (await accordion.isVisible().catch(() => false)) {
    await accordion.click();
  }
  const emailInput = page.locator('input[type="email"]');
  await emailInput.waitFor({ state: "visible" });
  await emailInput.fill(email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
}

/**
 * Route segment for the Kanban board under test — the ReUI-engine board,
 * cut over to the real `/kanban` route at
 * `docs/archive/plans/kanban-reui-swap/plan.md` T11. Single source of truth so specs
 * don't hardcode the segment.
 */
export const KANBAN_ROUTE = "kanban";

export async function openKanban(page: Page, projectId: number): Promise<void> {
  await page.goto(`/projects/${projectId}/${KANBAN_ROUTE}`, { waitUntil: "networkidle" });
  const grips = page.locator('[aria-label="Drag to reorder"]:visible');
  await expect(grips.first()).toBeVisible();
  // The board keeps laying out after the first grip paints (columns fill and
  // dnd-kit measures). Drag specs read card boxes next, so wait until the
  // grip count and the last grip's box hold still across two 100 ms samples.
  let prev: string | null = null;
  await expect
    .poll(
      async () => {
        const n = await grips.count();
        const box = n ? await grips.nth(n - 1).boundingBox() : null;
        const cur = box ? `${n}:${JSON.stringify(box)}` : null;
        const stable = cur !== null && cur === prev;
        prev = cur;
        return stable;
      },
      { intervals: [100] },
    )
    .toBe(true);
}

export interface CapturedTaskRequest {
  method: string;
  url: string;
  body: Record<string, unknown> | null;
}

/**
 * Captures every PATCH/POST request to `/api/tasks*` fired while `fn` runs —
 * the shared request-absence AND body-capture tool (scenarios.md's G3-G6,
 * G9c: no-op guards need to assert zero requests; empty-column/filtered
 * appends need to inspect the actual body, since API-readback alone can't
 * distinguish "no `position` key sent" from "a `position` was sent and
 * happened to compute the same value"). The listener is attached BEFORE
 * `fn` runs and detached after a short settle window (mutations fire
 * async, after the gesture's mouse/touch events resolve), so callers can
 * assert either `.length === 0` or inspect `.body` on what was captured.
 */
export async function captureTaskRequests(
  page: Page,
  fn: () => Promise<void>,
): Promise<CapturedTaskRequest[]> {
  const requests: CapturedTaskRequest[] = [];
  const onRequest = (req: Request) => {
    const method = req.method();
    if (method !== "PATCH" && method !== "POST") return;
    const url = req.url();
    if (!url.includes("/api/tasks")) return;
    let body: Record<string, unknown> | null = null;
    try {
      body = req.postDataJSON() as Record<string, unknown>;
    } catch {
      body = null;
    }
    requests.push({ method, url, body });
  };
  page.on("request", onRequest);
  try {
    await fn();
    // Collects outgoing requests: a stray request has no DOM signal to await,
    // so the window itself is the check.
    await page.waitForTimeout(800);
  } finally {
    page.off("request", onRequest);
  }
  return requests;
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

/** Resolves when the drop's task write response arrives, or after 1.5 s. A drop
 * that changes nothing sends no request, and "no request" has no DOM signal,
 * so the timeout is the negative window for those cases. */
function waitForTaskWrite(page: Page): Promise<unknown> {
  return page
    .waitForResponse(
      (r) => r.url().includes("/api/tasks") && ["PATCH", "POST"].includes(r.request().method()),
      { timeout: 1500 },
    )
    .catch(() => null);
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
    await page.waitForTimeout(35); // gesture pacing: the sensor needs intermediate positions
  }
  await page.waitForTimeout(150); // gesture pacing: let the last move register before release
  const saved = waitForTaskWrite(page);
  await page.mouse.up();
  await saved;
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
  await page.waitForTimeout(400); // gesture pacing: TouchSensor activation delay is 250ms
  for (let i = 1; i <= 12; i++) {
    await dispatch("touchMove", from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12);
    await page.waitForTimeout(50); // gesture pacing between touch moves
  }
  const saved = waitForTaskWrite(page);
  await dispatch("touchEnd", 0, 0);
  await saved;
}
