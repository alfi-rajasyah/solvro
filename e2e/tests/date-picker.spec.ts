import { test, expect, loginViaUi, apiBase, captureTaskRequests } from "../fixtures/test";
import { getTasks, type SeededTask } from "../fixtures/seed";
import type { Locator, Page } from "@playwright/test";

// DateField swap plan, Task 5 — e2e coverage for the ReUI-calendar date
// pickers that replaced every native `<input type="date">` in this app:
// DateField.tsx (single, direct-commit), DateRangeField.tsx (two-field
// between-style range picker, draft-until-Apply), InlineDateRangeEditor.tsx
// (a DateRangeField wrapper mounted `defaultOpen`, used by TaskPanel's DATES
// row and Gantt's TreeCells), and ProjectList's DueDateEditor (a bare
// DateField with a fmt-labeled trigger). Guards the specific regressions
// each component's own module docs call out: the due-only/inverted-pair
// wipe class DateRangeField.tsx and dateField.ts document at length, and the
// milestone re-click deselect-signal guard.
//
// Every test seeds its own dedicated task(s) via the API (same convention as
// gantt-parity.spec.ts/search.spec.ts) rather than mutating the shared
// seededProject's alpha/beta/gamma/delta, so tests stay order-independent
// within the one shared per-worker project (fixtures/test.ts).

function stamp(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// SeededTask's startDate/dueDate fall under its `[key: string]: unknown`
// index signature — same cast-at-the-read-site convention gantt-parity.spec.ts
// uses for the identical reason (a non-null assertion on `unknown` narrows to
// `{}`, which has no `.slice`).
function dateOf(task: SeededTask, field: "startDate" | "dueDate"): string | null {
  return task[field] as string | null;
}

/**
 * `yyyy-MM-dd` for day-of-month `day` in the month `monthsAhead` calendar
 * months from now (0 = this month). Deliberately NOT `isoDateOffset`
 * (fixtures/seed.ts) — that helper adds raw calendar days to "now" and can
 * silently cross a month boundary depending on which day-of-month the suite
 * happens to run on. Every test below needs at least two dates guaranteed to
 * land in the SAME single-month grid (DateField) or the SAME first month of
 * the two-month grid (DateRangeField, current + next) regardless of what day
 * today actually is — anchoring on a fixed, safely mid-month day-of-month
 * (10-25, never near a month boundary) removes that source of flake
 * entirely. Built from local Y/M/D getters only (no `.toISOString()`
 * UTC round-trip), so it can't walk a day backward/forward the way
 * `dateField.ts`'s own module doc warns `.toISOString()` on a local Date can.
 */
function isoDay(monthsAhead: number, day: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + monthsAhead, day);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Local midnight for a `yyyy-MM-dd` day string — the same parse
 *  `dateField.ts`'s `dayToDate` uses, so it lines up with whatever Date
 *  object the calendar itself renders a given day string as. */
function localMidnight(day: string): Date {
  return new Date(`${day}T00:00:00`);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function ordinal(n: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]}`;
}

/**
 * Hand-rolled equivalent of date-fns' `format(date, "PPPP")` — react-day-picker's
 * `labelDayButton` (node_modules/react-day-picker/dist/esm/labels/labelDayButton.js)
 * builds each day button's aria-label from exactly this format, via its own
 * bundled `enUS` locale, which is independent of the host/browser's Intl
 * locale (unlike `fmtShort`/`fmt`'s `toLocaleDateString(undefined, ...)`
 * elsewhere in this app). Reimplemented here instead of depending on
 * `date-fns` directly — it isn't a dependency of the e2e package, and adding
 * one is out of this task's scope. Verified byte-for-byte against
 * `date-fns`'s own output for every day-of-month 1-31 across several months
 * during authoring.
 */
function pppp(d: Date): string {
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${ordinal(d.getDate())}, ${d.getFullYear()}`;
}

/**
 * The `.slice(0, 10)` day-part a FRESHLY-picked calendar day actually
 * persists as, once it goes through `dateField.ts`'s `commitDraft` ->
 * `isoFromDay` (`new Date(`${day}T00:00:00`).toISOString()` — local midnight
 * of the picked day, serialized to UTC). East of UTC (positive offset) this
 * walks the date-part back one calendar day, and that is DOCUMENTED,
 * verified, accepted behavior, not a gap this suite should paper over or
 * flag as a regression: CHANGELOG.md's 2026-07-28 "ProjectList's inline
 * due-date editor swapped to DateField" entry records manually reproducing
 * this exact conversion against a live `Asia/Jakarta` (UTC+7) Playwright
 * context — picking "Aug 3" persisted `dueDate: 2026-08-02T17:00:00.000Z`
 * — and calls it "byte-identical to what the pre-swap ... conversion would
 * have produced." `InlineDateRangeEditor` (TaskPanel DATES, Gantt
 * `TreeCells`) and `ProjectList`'s `DueDateEditor` both commit through this
 * exact path for a freshly-picked (not untouched-passthrough) date, so
 * asserting the picked day-string equals the readback day-part would be a
 * TZ-naive assumption that spuriously fails on any host east of UTC —
 * mirroring the real conversion here keeps the assertion meaningful (a
 * genuine regression in `isoFromDay` would still be caught) without being
 * sandbox-timezone-dependent. `TaskFormModal`'s separate `passthroughDate`
 * is NOT affected (`new Date(day).toISOString()` on a bare date-only
 * string parses as UTC per the ECMAScript date-string grammar, not local
 * time), so that call site's assertions compare the literal picked day
 * directly.
 */
function persistedDayPart(pickedDay: string): string {
  return new Date(`${pickedDay}T00:00:00`).toISOString().slice(0, 10);
}

/**
 * A day button's accessible name, regardless of the "Today, " prefix or
 * ", selected" suffix `labelDayButton` adds on top of the base `PPPP` string
 * (see that module's source) — matched as a substring so this works whether
 * the target day happens to be today, already selected, or neither.
 */
function dayButtonName(day: string): RegExp {
  return new RegExp(escapeRegExp(pppp(localMidnight(day))));
}

/** `dd/MM/yyyy` — `dateField.ts`'s `formatDisplay` format, no Intl/locale
 *  dependency (unlike `fmt`/`fmtShort`), so this can be reproduced exactly
 *  regardless of host locale. */
function ddmmyyyy(day: string): string {
  const d = localMidnight(day);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

interface CreateTaskInput {
  title: string;
  status?: string;
  startDate?: string | null;
  dueDate?: string | null;
  isMilestone?: boolean;
}

async function createTask(
  base: string,
  token: string,
  projectId: number,
  input: CreateTaskInput,
): Promise<SeededTask> {
  const res = await fetch(`${base}/api/projects/${projectId}/tasks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await res.text();
  expect(res.ok, `createTask(${input.title}) failed: ${res.status} ${body}`).toBe(true);
  return JSON.parse(body) as SeededTask;
}

async function openTaskPanel(page: Page, projectId: number, taskId: number): Promise<Locator> {
  await page.goto(`/projects/${projectId}/list?task=${taskId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const panel = page.getByRole("dialog", { name: "Task details" });
  await expect(panel).toBeVisible();
  return panel;
}

/**
 * The DATES row's value trigger inside `TaskPanel` — before the user starts
 * editing this is a plain `<button>` with NO aria-label (just
 * `fmtShort(start) – fmtShort(due)` text, locale-dependent and not worth
 * reproducing here), so it's located structurally: the "DATES" label span's
 * next sibling `<div>` (TaskPanel.tsx's meta grid), same ancestor/sibling
 * xpath idiom `gantt-parity.spec.ts`'s `barButton` already uses in this repo.
 * Works both before AND after editing starts/ends, since that div always
 * contains exactly one interactive trigger (the plain button, or — once
 * `editingDates` flips true — `InlineDateRangeEditor`'s own popover trigger).
 */
function panelDatesTrigger(panel: Locator): Locator {
  return panel
    .getByText("Dates", { exact: true })
    .locator("xpath=following-sibling::div[1]")
    .getByRole("button");
}

test.describe("date pickers — DateField / DateRangeField", () => {
  // TZ-agreement guard (fix round, NIT 1): every day-string helper above
  // (isoDay/persistedDayPart/dayButtonName) is only correct because the
  // Playwright-launched browser and the Node process running this file
  // resolve `Intl.DateTimeFormat().resolvedOptions().timeZone` to the SAME
  // IANA zone — `persistedDayPart` runs in Node, `isoFromDay` (dateField.ts,
  // inside the app under test) runs in the browser, and they agree only
  // because both inherit the host OS's timezone. Playwright's browser
  // contexts default to the OS zone (no `timezoneId` override in
  // playwright.config.ts — deliberately left alone here), so that holds
  // today, but a runner that sets `TZ=` for only the Node process (or only
  // the browser) would silently break every TZ-dependent assertion in this
  // file with no indication why. This fails loud instead, with a message
  // telling the runner not to do that, rather than requiring a
  // playwright.config.ts change.
  test.beforeEach(async ({ page }) => {
    const nodeTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const browserTz = await page.evaluate(
      () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    expect(
      browserTz,
      `Node (${nodeTz}) and the browser (${browserTz}) disagree on IANA ` +
        "timezone. This suite's day-string helpers assume both share one " +
        "zone — don't set TZ= for only one of the two processes when " +
        "running tests/date-picker.spec.ts; leave both on the host's " +
        "system timezone.",
    ).toBe(nodeTz);
  });

  test("TaskPanel range flow: open DATES, pick start+end, Apply persists both and survives reload", async ({
    page,
    seededProject,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "TaskPanel layout asserted at desktop width");
    const { token, projectId } = seededProject;
    const base = apiBase(testInfo);
    const s = stamp();
    const task = await createTask(base, token, projectId, {
      title: `DateRangeFlow ${s}`,
      status: "TODO",
      startDate: isoDay(0, 10),
      dueDate: isoDay(0, 25),
    });

    await loginViaUi(page);
    const panel = await openTaskPanel(page, projectId, task.id);

    // Click the DATES value — InlineDateRangeEditor mounts `defaultOpen`, so
    // the range calendar must already be open (Apply visible) with no second
    // click.
    await panelDatesTrigger(panel).click();
    const applyBtn = page.getByRole("button", { name: "Apply", exact: true });
    await expect(applyBtn).toBeVisible();

    // Clear first, then click a start day and a later end day. Clicking two
    // days directly on top of an ALREADY-full range doesn't do what it looks
    // like it should — react-day-picker's `addToRange` (the mechanism behind
    // both `DateField`/`DateRangeField`) only ever moves the "to" side when
    // the clicked day is after the current "from", regardless of the
    // existing "to" — so a raw two-click sequence over the seeded range
    // silently drags "to" around while "from" stays pinned. Clearing first
    // (DateRangeField.tsx's own documented "Capability trade-off": a first
    // click into an EMPTY selection sets BOTH from/to to that day) resets to
    // empty, so the very next two clicks land exactly as a fresh
    // start-then-end pick, per the same addToRange mechanics.
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    const startDay = isoDay(0, 15);
    const endDay = isoDay(0, 20);
    await page.getByRole("button", { name: dayButtonName(startDay) }).click();
    await page.getByRole("button", { name: dayButtonName(endDay) }).click();

    const [patchRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes(`/api/tasks/${task.id}`) && r.request().method() === "PATCH",
      ),
      applyBtn.click(),
    ]);
    expect(patchRes.ok()).toBe(true);

    const afterMutation = (await getTasks(base, token, projectId)).find((t) => t.id === task.id)!;
    // Local-midnight ISO convention (InlineDateRangeEditor -> commitDraft ->
    // isoFromDay) — assert via day-part, not exact instant, to stay
    // TZ-agnostic across CI/local (dateOf/isoDateOffset's own convention).
    // Compared against `persistedDayPart` (mirroring `isoFromDay`'s own
    // conversion), not the picked day-string directly — see that helper's
    // doc for why a direct comparison would be TZ-naive.
    expect(dateOf(afterMutation, "startDate")!.slice(0, 10)).toBe(persistedDayPart(startDay));
    expect(dateOf(afterMutation, "dueDate")!.slice(0, 10)).toBe(persistedDayPart(endDay));

    // Editing ends (setEditingDates(false) on save) — the plain trigger
    // re-renders with the new fmtShort text. Capture it, then prove it
    // survives a reload rather than just a live cache update.
    const textAfterApply = await panelDatesTrigger(panel).textContent();
    expect(textAfterApply).toBeTruthy();

    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const panelAfterReload = page.getByRole("dialog", { name: "Task details" });
    await expect(panelAfterReload).toBeVisible();
    await expect(panelDatesTrigger(panelAfterReload)).toHaveText(textAfterApply!);
  });

  test("due-only passthrough guard: Apply with zero interaction leaves a due-only task byte-identical", async ({
    page,
    seededProject,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "TaskPanel layout asserted at desktop width");
    const { token, projectId } = seededProject;
    const base = apiBase(testInfo);
    const s = stamp();
    const task = await createTask(base, token, projectId, {
      title: `DueOnly ${s}`,
      status: "TODO",
      startDate: null,
      dueDate: isoDay(0, 12),
    });
    const seededDueIso = dateOf(task, "dueDate");
    expect(task.startDate).toBeNull();
    expect(seededDueIso).toBeTruthy();

    await loginViaUi(page);
    const panel = await openTaskPanel(page, projectId, task.id);

    await panelDatesTrigger(panel).click();
    const applyBtn = page.getByRole("button", { name: "Apply", exact: true });
    await expect(applyBtn).toBeVisible();

    // Zero calendar interaction — Apply immediately on the seeded, untouched
    // draft. This is the regression the wipe-class fix guards: without the
    // untouched-passthrough (commitDraft/normalizePair), a due-only task's
    // one-sided draft round-trips through react-day-picker's range shape and
    // silently emits (null, null) here, wiping the due date.
    const [patchRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes(`/api/tasks/${task.id}`) && r.request().method() === "PATCH",
      ),
      applyBtn.click(),
    ]);
    expect(patchRes.ok()).toBe(true);

    const after = (await getTasks(base, token, projectId)).find((t) => t.id === task.id)!;
    expect(dateOf(after, "startDate")).toBeNull();
    expect(dateOf(after, "dueDate")).toBe(seededDueIso); // byte-identical, not just same day
  });

  test("milestone re-click guard: clicking the single highlighted day then Apply is a no-op", async ({
    page,
    seededProject,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "TaskPanel layout asserted at desktop width");
    const { token, projectId } = seededProject;
    const base = apiBase(testInfo);
    const s = stamp();
    // isMilestone + dueDate only (no startDate) — the backend lockstep
    // (projects.ts's createTaskSchema handler) derives startDate = dueDate.
    const task = await createTask(base, token, projectId, {
      title: `MilestoneGuard ${s}`,
      status: "TODO",
      dueDate: isoDay(0, 18),
      isMilestone: true,
    });
    expect(task.isMilestone).toBe(true);
    const seededStartIso = dateOf(task, "startDate");
    const seededDueIso = dateOf(task, "dueDate");
    expect(seededStartIso).toBe(seededDueIso);
    expect(seededStartIso).toBeTruthy();

    await loginViaUi(page);
    const panel = await openTaskPanel(page, projectId, task.id);

    await panelDatesTrigger(panel).click();
    const applyBtn = page.getByRole("button", { name: "Apply", exact: true });
    await expect(applyBtn).toBeVisible();

    // The milestone's single day is both start AND end of the fabricated
    // one-day "range" (dateField.ts's rangeFromPair) — clicking it is an
    // entirely ordinary interaction that fires react-day-picker's re-click
    // deselect signal, which `nextDraftFromSelection` (dateField.ts)
    // explicitly ignores rather than treating as "clear the draft".
    const theDay = seededDueIso!.slice(0, 10);
    await page.getByRole("button", { name: dayButtonName(theDay) }).click();

    const [patchRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes(`/api/tasks/${task.id}`) && r.request().method() === "PATCH",
      ),
      applyBtn.click(),
    ]);
    // NOT the regression guard by itself (fix round, SHOULD-FIX B): the
    // backend's isMilestone+null-dueDate 400 refine (backend/src/routes/
    // tasks.ts's `.refine((b) => !(b.isMilestone === true && b.dueDate ===
    // null), ...)`) only fires when `isMilestone` is ITSELF present in the
    // PATCH body — and `TaskPanel`'s dates-apply handler
    // (`TaskPanel.tsx`'s `onSave={(s, e) => patch({ startDate: s, dueDate:
    // e })}`) never sends `isMilestone`. So if the wipe-class bug this test
    // guards against reappeared, this PATCH would still 200 (silently
    // persisting `{ startDate: null, dueDate: null }`), not 400 — this
    // assert would stay green either way. The readback assertions below are
    // the actual guard: they're what would turn red on a reintroduced wipe.
    expect(patchRes.ok()).toBe(true);

    const after = (await getTasks(base, token, projectId)).find((t) => t.id === task.id)!;
    expect(dateOf(after, "startDate")).toBe(seededStartIso); // byte-identical — no wipe
    expect(dateOf(after, "dueDate")).toBe(seededDueIso);
    expect(after.isMilestone).toBe(true);
  });

  test("TaskFormModal drawer flow: Dates calendar opens above the drawer, doesn't close it, and Save persists the picked days", async ({
    page,
    seededProject,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Drawer layout asserted at desktop width");
    const { token, projectId } = seededProject;
    const base = apiBase(testInfo);
    const s = stamp();
    const task = await createTask(base, token, projectId, {
      title: `DrawerFlow ${s}`,
      status: "TODO",
      startDate: isoDay(0, 10),
      dueDate: isoDay(0, 25),
    });

    await loginViaUi(page);
    // ProjectTimeline is the launch point for TaskFormModal's EDIT mode used
    // here (Tasks.tsx's cross-project /tasks list is deliberately avoided —
    // fixtures/seed.ts's own comment documents that an unscoped GET /tasks
    // window can leave a freshly seeded row outside its `take: 200`).
    await page.goto(`/projects/${projectId}/timeline`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: task.title, exact: true }).click();

    const drawer = page.getByRole("dialog", { name: "Edit task" });
    await expect(drawer).toBeVisible();

    const datesTrigger = drawer.getByRole("button", { name: /^Date range/ });
    await datesTrigger.scrollIntoViewIfNeeded();
    await datesTrigger.click();
    const applyBtn = page.getByRole("button", { name: "Apply", exact: true });
    await expect(applyBtn).toBeVisible();

    await page.getByRole("button", { name: "Clear", exact: true }).click();
    const startDay = isoDay(0, 14);
    const endDay = isoDay(0, 21);
    await page.getByRole("button", { name: dayButtonName(startDay) }).click();
    await page.getByRole("button", { name: dayButtonName(endDay) }).click();

    // The calendar renders ABOVE the drawer (z-101 popover positioner vs.
    // the drawer's z-100, Popover.tsx / Drawer.tsx) — proven here by the
    // clicks above actually landing on the day buttons (a covered element
    // fails Playwright's actionability check) — and clicking inside it must
    // NOT close the drawer underneath (Drawer.tsx's backdrop-mousedown
    // close is stopped by its own inner dialog div before it ever reaches
    // the popover's React-portalled content).
    await expect(drawer).toBeVisible();

    await applyBtn.click();
    await expect(datesTrigger).toHaveText(
      new RegExp(`${escapeRegExp(ddmmyyyy(startDay))}.+${escapeRegExp(ddmmyyyy(endDay))}`),
    );

    const [patchRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes(`/api/tasks/${task.id}`) && r.request().method() === "PATCH",
      ),
      page.getByRole("button", { name: "Save", exact: true }).click(),
    ]);
    expect(patchRes.ok()).toBe(true);

    const after = (await getTasks(base, token, projectId)).find((t) => t.id === task.id)!;
    // UTC-midnight convention at this site (TaskFormModal's own
    // `passthroughDate`, `new Date(day).toISOString()`) — still asserted via
    // day-part for consistency with the other cases.
    expect(dateOf(after, "startDate")!.slice(0, 10)).toBe(startDay);
    expect(dateOf(after, "dueDate")!.slice(0, 10)).toBe(endDay);
    // Untouched fields survive the round-trip unchanged.
    expect(after.title).toBe(task.title);
    expect(after.status).toBe(task.status);
    expect(after.priority).toBe(task.priority);
  });

  test("ProjectList direct commit: picking a new due date persists immediately; re-clicking the same day is a no-op", async ({
    page,
    seededProject,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "List grid asserted at desktop width");
    const { token, projectId } = seededProject;
    const base = apiBase(testInfo);
    const s = stamp();
    const task = await createTask(base, token, projectId, {
      title: `DirectCommit ${s}`,
      status: "TODO",
      dueDate: isoDay(0, 10),
    });

    await loginViaUi(page);
    await page.goto(`/projects/${projectId}/list`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    // Desktop row: the `grid-cols-[...]` arbitrary-value token is unique to
    // the column-header row + every desktop task row (list-dnd.spec.ts's
    // `desktopRow` convention) — `hasText` narrows to this task's own row.
    const row = page.locator('div[class*="grid-cols-"]', { hasText: task.title });
    const dueTrigger = row.getByRole("button", { name: /^Due date/ });
    const textBefore = await dueTrigger.textContent();

    const pickedDay = isoDay(0, 20);
    await dueTrigger.click();
    const [patchRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes(`/api/tasks/${task.id}`) && r.request().method() === "PATCH",
      ),
      page.getByRole("button", { name: dayButtonName(pickedDay) }).click(),
    ]);
    expect(patchRes.ok()).toBe(true);

    const afterPick = (await getTasks(base, token, projectId)).find((t) => t.id === task.id)!;
    expect(dateOf(afterPick, "dueDate")!.slice(0, 10)).toBe(persistedDayPart(pickedDay));
    const pickedDueIso = dateOf(afterPick, "dueDate");

    // Cell text updates (self-referential — Intl-locale formatting isn't
    // worth reproducing here, just proving it changed from the seed).
    // Retrying assertion (fix round, NIT 2) instead of a bare
    // waitForTimeout + non-retrying textContent() snapshot — toHaveText
    // polls until the mutation's cache update actually lands, rather than
    // assuming 800ms was always enough.
    await expect(row.getByRole("button", { name: /^Due date/ })).not.toHaveText(textBefore!);

    // Re-open and re-click the day DateField ITSELF currently shows as
    // selected — fix round, BLOCKER. `DueDateEditor`'s `value` prop is
    // `dayFromIso(dueISO)` (dateField.ts): a bare `.slice(0, 10)` of the
    // PERSISTED ISO, not `pickedDay` re-derived through any local-TZ math.
    // `isoFromDay`'s local-midnight-to-UTC walk-back (this file's
    // `persistedDayPart` mirrors it, see its own doc) means that persisted
    // day-part is `pickedDay` MINUS one calendar day on any host east of
    // UTC — so re-clicking `pickedDay` literally would not be a re-click of
    // the calendar's highlighted day there at all, it would be an ordinary
    // NEW selection (a different day than what's shown selected), which
    // fires a real `onChange`, not react-day-picker's re-click-to-deselect
    // signal. `pickedDueIso!.slice(0, 10)` — the actual API readback above
    // — is exactly what `dayFromIso` recomputes and what the calendar
    // therefore highlights, in every timezone, so clicking THAT day-part is
    // a genuine re-click everywhere. It fires `onSelect(undefined)`, which
    // `DateField.handleSelect` (components/DateField.tsx) treats as
    // close-only (never a wipe) — no `onChange` call, so no request at all.
    //
    // That guard is DateField's alone. Because `onChange` never fires here,
    // `ProjectList.tsx`'s SEPARATE `setDates` unchanged-value guard
    // (~:240-242, `if (startDate === task.startDate && dueDate ===
    // task.dueDate) return;`) isn't exercised by this re-click — on a host
    // where `isoFromDay` doesn't walk the day back (UTC or west), `onChange`
    // never even reaches `setDates` for THIS click either, since
    // `DateField`'s own guard already stopped it upstream. The follow-up
    // block below closes that gap: picking a genuinely different day
    // asserts exactly one PATCH fires, pinning `setDates`'s "else" branch
    // and proving the zero-request assert above isn't vacuous — i.e., a
    // request-emitting path through this exact UI does exist, and
    // `captureTaskRequests` does see it.
    const requests = await captureTaskRequests(page, async () => {
      await row.getByRole("button", { name: /^Due date/ }).click();
      await page
        .getByRole("button", { name: dayButtonName(pickedDueIso!.slice(0, 10)) })
        .click();
    });
    expect(requests).toHaveLength(0);

    const afterReclick = (await getTasks(base, token, projectId)).find((t) => t.id === task.id)!;
    expect(dateOf(afterReclick, "dueDate")).toBe(pickedDueIso); // byte-identical

    // Pin setDates's inverse branch (fix round, BLOCKER continued): pick an
    // actually different day — still 10-25, so it stays in-grid regardless
    // of which side of the walk-back `pickedDueIso`'s day-part landed on —
    // and assert exactly one PATCH fires.
    const changedDay = isoDay(0, 15);
    const changeRequests = await captureTaskRequests(page, async () => {
      await row.getByRole("button", { name: /^Due date/ }).click();
      await page.getByRole("button", { name: dayButtonName(changedDay) }).click();
    });
    expect(changeRequests).toHaveLength(1);
    expect(changeRequests[0].method).toBe("PATCH");

    const afterChange = (await getTasks(base, token, projectId)).find((t) => t.id === task.id)!;
    expect(dateOf(afterChange, "dueDate")!.slice(0, 10)).toBe(persistedDayPart(changedDay));
  });

  // Fix round, SHOULD-FIX A: this suite's own header comment (top of file)
  // has named Gantt's TreeCells.tsx among the call sites InlineDateRangeEditor
  // covers since this file was first authored, but no case actually opened
  // it there — the only prior InlineDateRangeEditor coverage was TaskPanel's.
  // This closes that gap, and guards a hand-fixed regression with zero prior
  // automated coverage: DateRangeField.tsx's popover-content wrapper
  // (`<div onClick={(e) => e.stopPropagation()}>`) exists ONLY because
  // Base-UI's Popover portals its content to `document.body`, so a click
  // inside the popover still bubbles through the REACT component tree (not
  // the DOM tree) up to the Gantt tree row's own onClick — which opens the
  // "Edit task" TaskFormModal drawer for that same task (SolvroGantt.tsx's
  // `onResourceClick` → `onEditTask`). Without that stopPropagation, clicking
  // anywhere inside the calendar popover — even blank padding, not just a
  // day button — would both fire the row click AND leave the popover's own
  // Apply/Cancel flow half-engaged underneath the newly opened drawer.
  test("Gantt tree Dates cell: clicking the calendar popover's own padding doesn't bubble to the row click", async ({
    page,
    seededProject,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Gantt is desktop-only (hidden md:block)");
    const { token, projectId } = seededProject;
    const base = apiBase(testInfo);
    const s = stamp();
    const task = await createTask(base, token, projectId, {
      title: `GanttDatesCell ${s}`,
      status: "TODO",
      startDate: isoDay(0, 10),
      dueDate: isoDay(0, 20),
    });

    await loginViaUi(page);
    await page.goto(`/projects/${projectId}/gantt`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    // Tree-pane row for this task (gantt-parity.spec.ts's
    // `[data-gantt-row-id="task-<id>"]` convention), scoped under the tree
    // pane specifically since the same `data-gantt-row-id` value is also
    // used chart-pane-side.
    const row = page.locator(`[data-slot="gantt-tree-pane"] [data-gantt-row-id="task-${task.id}"]`);
    await row.scrollIntoViewIfNeeded();
    // TaskDatesCell's trigger (gantt-v2/TreeCells.tsx) has no aria-label —
    // only a `title` — so it's located by that instead of role/name.
    await row.getByTitle("Click to edit dates").click();

    const applyBtn = page.getByRole("button", { name: "Apply", exact: true });
    await expect(applyBtn).toBeVisible();

    // Click the calendar's own root padding (ui/calendar.tsx's
    // `data-slot="calendar"`, which carries the `p-3` padding — the "p-3
    // root area" this case targets), at a corner well inside that 12px
    // padding and clear of any day button/caption/footer control. This is a
    // direct child of DateRangeField.tsx's stopPropagation wrapper div, so
    // it's the click that div exists to catch.
    const calendarRoot = page
      .locator('[data-slot="popover-content"] [data-slot="calendar"]')
      .first();
    await calendarRoot.click({ position: { x: 4, y: 4 } });

    // Two observable effects of a regressed stopPropagation: the popover
    // would collapse (Base-UI's outside-interaction dismiss, or the
    // underlying row's own state churn) and/or the row's OWN click handler
    // would open the "Edit task" drawer for this same task. (Gantt's edit
    // drawer is `ProjectGantt.tsx`'s local `editTask` component state, not
    // the `?task=` URL deep-link the List/Kanban `TaskPanel` uses — see
    // `ProjectDetail.tsx`'s own comment on that param — so drawer visibility
    // is the meaningful assertion here, not the URL.)
    await expect(applyBtn).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Edit task" })).toHaveCount(0);
  });

  test("mobile: TaskFormModal's Dates popover renders one month grid and fits the viewport", async ({
    page,
    seededProject,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "single-month/viewport-fit check is mobile-viewport specific");
    // Fix round, NIT 3: the mobile project's device profile (iPhone 13,
    // playwright.config.ts) defaults to a 390px viewport, but this repo's
    // mobile-responsiveness contract (CLAUDE.md) is usability down to
    // 375px — set explicitly so the "fits the viewport" assertion below
    // exercises the narrowest width this app commits to, not just whatever
    // width the device profile happens to default to.
    await page.setViewportSize({ width: 375, height: 812 });
    const { token, projectId } = seededProject;
    const base = apiBase(testInfo);
    const s = stamp();
    const task = await createTask(base, token, projectId, {
      title: `MobileFit ${s}`,
      status: "TODO",
      startDate: isoDay(0, 10),
      dueDate: isoDay(0, 20),
    });

    await loginViaUi(page);
    await page.goto(`/projects/${projectId}/timeline`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: task.title, exact: true }).click();

    const drawer = page.getByRole("dialog", { name: "Edit task" });
    await expect(drawer).toBeVisible();

    const datesTrigger = drawer.getByRole("button", { name: /^Date range/ });
    await datesTrigger.scrollIntoViewIfNeeded();
    // Touch tap — the mobile project runs Chromium with touch emulation, so
    // a plain `.click()` is a real tap (fixtures/test.ts's device profile).
    await datesTrigger.click();

    const popup = page.locator('[data-slot="popover-content"]');
    await expect(popup).toBeVisible();

    // isDesktop (DateRangeField.tsx's matchMedia("(min-width: 768px)") hook)
    // is false at this viewport, so numberOfMonths=1 — exactly one month
    // grid, not two.
    await expect(page.locator(".rdp-month")).toHaveCount(1);

    const box = await popup.boundingBox();
    expect(box, "popover box not found").toBeTruthy();
    const viewportWidth = page.viewportSize()!.width;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth);
  });
});
