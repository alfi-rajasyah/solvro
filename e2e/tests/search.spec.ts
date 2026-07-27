import { test, expect, loginViaUi, apiBase } from "../fixtures/test";

// The palette is desktop-first (⌘K + top-bar box are md:-gated); the mobile
// entry point is the TopBar search icon. Desktop assertions skip the mobile
// project and vice versa, mirroring smoke.spec.ts's pattern.

async function createUniqueTask(
  base: string,
  token: string,
  projectId: number,
): Promise<{ id: number; title: string }> {
  const title = `SearchTarget ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const res = await fetch(`${base}/api/projects/${projectId}/tasks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`task seed failed: ${res.status}`);
  const body = (await res.json()) as { id: number };
  return { id: body.id, title };
}

/**
 * Local variant of `createUniqueTask`, used only by the mobile row-overflow
 * test below. Review round 2 measured (against the live palette, truncation
 * deliberately regressed) that a ~24-char title never produces horizontal
 * overflow at a 390px viewport regardless of where it's measured — 0px at
 * 24/40 chars, 7px at 60, 836px at 200 — so the short title from
 * `createUniqueTask` structurally cannot stress the row this test exists to
 * guard. Padded to ~100+ chars (well under the server's 200-char `title`
 * cap, `backend/src/routes/tasks.ts:22`) so a truncation regression has
 * something to actually overflow. Kept separate from `createUniqueTask`
 * rather than adding a parameter to it, since every other test in this file
 * relies on that helper producing a short, readable title.
 *
 * Returns a separate `query` (the unpadded prefix) alongside the full
 * `title`: `GET /search`'s own `q` param is capped at 100 chars
 * (`backend/src/routes/search.ts:12`, `z.string().min(2).max(100)`), so
 * filling the palette input with the full ~100+ char padded title fails
 * that validation outright (discovered by running this test — the search
 * request 400s and no rows render, timing out `toBeVisible()`). Searching
 * on the short `query` and asserting the full padded `title` renders keeps
 * both constraints satisfied: a request the server accepts, and a row long
 * enough to actually overflow.
 */
async function createLongUniqueTask(
  base: string,
  token: string,
  projectId: number,
): Promise<{ id: number; title: string; query: string }> {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const query = `SearchTarget ${stamp}`;
  const title = `${query} ${"x".repeat(80)}`;
  const res = await fetch(`${base}/api/projects/${projectId}/tasks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`task seed failed: ${res.status}`);
  const body = (await res.json()) as { id: number };
  return { id: body.id, title, query };
}

test.describe("global search palette", () => {
  test("⌘K opens the palette and a task hit deep-links into List with the panel param", async ({ page, seededProject }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "⌘K entry point is desktop-only");
    const target = await createUniqueTask(
      apiBase(testInfo),
      seededProject.token,
      seededProject.projectId,
    );

    await loginViaUi(page);
    await page.goto("/overview", { waitUntil: "networkidle" });
    await page.keyboard.press("ControlOrMeta+k");

    const dialog = page.getByRole("dialog", { name: /global search/i });
    await expect(dialog).toBeVisible();

    await dialog.getByPlaceholder(/search projects/i).fill(target.title);
    const hit = dialog.getByText(target.title, { exact: true });
    await expect(hit).toBeVisible();
    await hit.click();

    await page.waitForURL(
      new RegExp(`/projects/${seededProject.projectId}/list\\?task=${target.id}`),
      { timeout: 10_000 },
    );
  });

  test("a project hit navigates to the project and grouping headers render", async ({ page, seededProject }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "⌘K entry point is desktop-only");
    // The fixture project's name ("Gate <stamp>") is unique per worker; fetch it.
    const res = await fetch(`${apiBase(testInfo)}/api/projects/${seededProject.projectId}`, {
      headers: { Authorization: `Bearer ${seededProject.token}` },
    });
    const project = (await res.json()) as { name: string };

    await loginViaUi(page);
    await page.goto("/overview", { waitUntil: "networkidle" });
    await page.keyboard.press("ControlOrMeta+k");

    const dialog = page.getByRole("dialog", { name: /global search/i });
    await dialog.getByPlaceholder(/search projects/i).fill(project.name);
    await expect(dialog.getByText("Projects", { exact: true })).toBeVisible();
    await expect(dialog.getByText(project.name, { exact: true })).toBeVisible();

    // Enter-key selection: autoHighlight keeps the sole matching row active,
    // and a "Gate <stamp>" query matches no Pages item, so Enter lands on
    // the project row (verified by the final reviewer against Base UI's
    // ComboboxInput source, which calls the active item's click handler).
    await dialog.getByPlaceholder(/search projects/i).press("Enter");
    await page.waitForURL(new RegExp(`/projects/${seededProject.projectId}(/overview)?$`), {
      timeout: 10_000,
    });
  });

  // Addendum (2026-07-27, mandated by Task 4 review), assertions 1 + 2:
  // Escape must close the palette via the REAL keyboard path — dispatched
  // from the palette's own focused input, not just `page.keyboard.press`
  // against whatever the document happens to have focused at the time — and
  // the input must carry focus the instant the palette opens (`autoFocus`
  // on AutocompleteInput, CommandPalette.tsx). The plain brief version of
  // this test only asserted the close; it never pinned down where focus was
  // when Escape fired, which is exactly what review flagged as unverified
  // (Base UI's `inline` Autocomplete could in principle intercept/stop the
  // keydown before it reaches CommandPalette's own `document`-level
  // listener). `input.press("Escape")` ties the dispatch to that element
  // specifically, rather than relying on whatever currently has focus.
  // Both assertions live in one test since #2 is a precondition for #1.
  test("⌘K autofocuses the input, and Escape from the focused input closes the palette", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "⌘K entry point is desktop-only");
    await loginViaUi(page);
    await page.goto("/overview", { waitUntil: "networkidle" });
    await page.keyboard.press("ControlOrMeta+k");

    const dialog = page.getByRole("dialog", { name: /global search/i });
    await expect(dialog).toBeVisible();

    const input = dialog.getByPlaceholder(/search projects/i);
    await expect(input).toBeFocused(); // Addendum #2: autofocus

    await input.press("Escape"); // Addendum #1: dispatched from the focused input itself
    await expect(dialog).toHaveCount(0);
  });

  // Addendum #3 (B1 regression guard): the fix-round-1 CHANGELOG entry
  // ("Stale search hits below the 2-char gate / across reopen") gated the
  // palette's remote items on `hasQuery` precisely so a reopen can never
  // show a previous session's rows again. Prove it end-to-end: search
  // successfully, close, reopen, and confirm the previous hit is gone and
  // only the Pages group (rendered unconditionally for an empty query)
  // remains. Group headers are targeted via `data-slot="autocomplete-group-
  // label"` rather than getByText("Pages"/"Projects"/...) — with an empty
  // query, filterNavCommands returns every permitted page (including one
  // literally labeled "Projects"), so a plain text query for a group name
  // would ambiguously match a Pages *item* alongside any real group header.
  test("no stale rows survive closing and reopening the palette (B1 regression guard)", async ({ page, seededProject }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "⌘K entry point is desktop-only");
    const target = await createUniqueTask(
      apiBase(testInfo),
      seededProject.token,
      seededProject.projectId,
    );

    await loginViaUi(page);
    await page.goto("/overview", { waitUntil: "networkidle" });
    await page.keyboard.press("ControlOrMeta+k");

    let dialog = page.getByRole("dialog", { name: /global search/i });
    await dialog.getByPlaceholder(/search projects/i).fill(target.title);
    await expect(dialog.getByText(target.title, { exact: true })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    await page.keyboard.press("ControlOrMeta+k");
    dialog = page.getByRole("dialog", { name: /global search/i });
    await expect(dialog).toBeVisible();

    // Auto-retrying: absorbs the ≤200ms debounce residual called out in the
    // addendum, though the `hasQuery` gate means this should already be
    // empty the instant the fresh instance mounts with query="".
    await expect(dialog.getByText(target.title, { exact: true })).toHaveCount(0);
    const groupLabels = dialog.locator('[data-slot="autocomplete-group-label"]');
    await expect(groupLabels).toHaveText(["Pages"]);
  });

  test("mobile: TopBar search icon opens the palette", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "icon entry point is the mobile affordance");
    await loginViaUi(page);
    await page.goto("/overview", { waitUntil: "networkidle" });

    await page.getByRole("button", { name: /open search/i }).click();
    await expect(page.getByRole("dialog", { name: /global search/i })).toBeVisible();
  });

  // Addendum #4 (S1, review rounds 1-2 on this test).
  //
  // Round 1 fix measured `document.documentElement.scrollWidth/clientWidth`
  // — toothless, since the palette is `position: fixed; inset: 0` and a
  // child overflowing inside a fixed overlay never bubbles into
  // `documentElement`'s own scroll metrics.
  //
  // Round 2 re-review (measured against the live palette, not inferred):
  // moving the poll onto the dialog itself was *still* wrong, because the
  // dialog isn't the element that absorbs row overflow either. The DOM
  // chain is `div[role=dialog]` (no `overflow` set) → the flex column →
  // `ScrollArea.Root` → `[data-slot="scroll-area-viewport"]` (computed
  // `overflow-x: scroll`, `ui/scroll-area.tsx`) → `AutocompleteList` → the
  // result rows. The viewport is a scroll container sitting *between* the
  // dialog and every row, so row overflow terminates there and never
  // reaches the dialog — measured 0 on `dialog` under a simulated
  // truncation regression that produced 784px of real overflow on the
  // viewport. `ui/scroll-area.tsx` only renders a *vertical* ScrollBar, so
  // a horizontally overflowing row is silently swipe-scrollable with no
  // visible affordance — exactly the mobile defect this test guards.
  // Separately, the seeded title was too short (~24 chars) to overflow a
  // 390px row even when measured correctly — `createLongUniqueTask` above
  // pads it to ~100+ chars for that reason.
  //
  // The boundingBox() x/height assertions from round 1 are dropped: the
  // dialog is `w-full` inside `fixed inset-0 flex items-stretch
  // justify-center`, so `{x: 0, y: 0, height: <viewport height>}` is
  // structurally guaranteed regardless of content — they added no coverage.
  test("mobile: a long result row doesn't overflow the palette's scroll viewport horizontally", async ({ page, seededProject }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "viewport-fit check is mobile-viewport specific");
    const target = await createLongUniqueTask(
      apiBase(testInfo),
      seededProject.token,
      seededProject.projectId,
    );

    await loginViaUi(page);
    await page.goto("/overview", { waitUntil: "networkidle" });

    await page.getByRole("button", { name: /open search/i }).click();
    const dialog = page.getByRole("dialog", { name: /global search/i });
    await expect(dialog).toBeVisible();

    await dialog.getByPlaceholder(/search projects/i).fill(target.query);
    await expect(dialog.getByText(target.title, { exact: true })).toBeVisible();

    const viewport = dialog.locator('[data-slot="scroll-area-viewport"]');
    await expect
      .poll(() => viewport.evaluate((el) => el.scrollWidth - el.clientWidth))
      .toBeLessThanOrEqual(1);
  });
});
