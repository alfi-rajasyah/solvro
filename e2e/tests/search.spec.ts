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

    await dialog.getByText(project.name, { exact: true }).click();
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

  // Addendum #4: the palette is `fixed inset-0` full-bleed on phone
  // viewports (no `md:` centered-card treatment) — confirm it doesn't
  // introduce horizontal scroll, and that the dialog's own box stays within
  // the viewport height, same recipe smoke.spec.ts uses for page overflow.
  test("mobile: palette fits the viewport with no horizontal overflow", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "viewport-fit check is mobile-viewport specific");
    await loginViaUi(page);
    await page.goto("/overview", { waitUntil: "networkidle" });

    await page.getByRole("button", { name: /open search/i }).click();
    const dialog = page.getByRole("dialog", { name: /global search/i });
    await expect(dialog).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `palette overflowed by ${overflow}px`).toBeLessThanOrEqual(1);

    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    if (box && viewport) {
      expect(
        box.height,
        `dialog height ${box.height} exceeds viewport height ${viewport.height}`,
      ).toBeLessThanOrEqual(viewport.height + 1);
    }
  });
});
