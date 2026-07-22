import {
  test,
  expect,
  loginViaUi,
  openKanban,
  gripFor,
  center,
  mouseDrag,
  touchDrag,
  apiBase,
} from "../fixtures/test";
import { getTasks, setWipLimits, type SeededTask } from "../fixtures/seed";

// Ported from the QA gate script qa-wave2.mjs. Mouse-drag cases only make
// sense on the desktop project (dnd-kit PointerSensor); touch cases only
// make sense on the mobile project (dnd-kit TouchSensor, 250ms hold).

function byTitle<T extends { title: string }>(tasks: T[], t: string) {
  return tasks.find((x) => x.title === t);
}

// `position` is now a single per-project global order for top-level tasks
// (unified-task-ordering) — a column is a filtered subsequence of it, not
// its own sibling list. Absolute `position` values are no longer meaningful
// per column, so reorder assertions compare relative order within a column
// instead of pinning a literal index.
function columnOrder(tasks: SeededTask[], status: string): string[] {
  return tasks
    .filter((t) => t.status === status && t.parentTaskId === null)
    .sort((a, b) => a.position - b.position || a.id - b.id)
    .map((t) => t.title);
}

test.describe("kanban drag & drop — desktop (mouse)", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "mouse drag cases run on the desktop project only");
    await loginViaUi(page);
  });

  test("reorder within column: Gamma onto Alpha -> Gamma before Alpha", async ({ page, seededProject }) => {
    await openKanban(page, seededProject.projectId);

    const grip = await gripFor(page, "Gamma", "Drag to reorder");
    const alpha = await page.getByText("Alpha", { exact: true }).first().boundingBox();
    expect(grip, "grip for Gamma not found").toBeTruthy();
    expect(alpha, "Alpha card not found").toBeTruthy();

    await mouseDrag(page, center(grip!), { x: alpha!.x + 60, y: alpha!.y + 8 });

    const tasks = await getTasks(apiBase(test.info()), seededProject.token, seededProject.projectId);
    const g = byTitle(tasks, "Gamma");
    expect(g?.status).toBe("TODO");
    const order = columnOrder(tasks, "TODO");
    expect(order.indexOf("Gamma")).toBeLessThan(order.indexOf("Alpha"));
  });

  test("cross-column drag: Beta -> In Progress column", async ({ page, seededProject }) => {
    await openKanban(page, seededProject.projectId);

    const grip = await gripFor(page, "Beta", "Drag to reorder");
    const col =
      (await page.locator("h3", { hasText: "In Progress" }).first().boundingBox()) ??
      (await page.getByText("In progress", { exact: true }).first().boundingBox());
    expect(grip, "grip for Beta not found").toBeTruthy();
    expect(col, "In Progress column not found").toBeTruthy();

    await mouseDrag(page, center(grip!), { x: col!.x + 60, y: col!.y + 150 });

    const tasks = await getTasks(apiBase(test.info()), seededProject.token, seededProject.projectId);
    const b = byTitle(tasks, "Beta");
    expect(b?.status).toBe("IN_PROGRESS");
    // Column-body drop = end of column (see computeCardDrop) — Beta must
    // land after every other IN_PROGRESS card, not just "somewhere in" it.
    const order = columnOrder(tasks, "IN_PROGRESS");
    expect(order).toContain("Beta");
    expect(order[order.length - 1]).toBe("Beta");
  });

  test("subtask reorder: Sub two onto Sub one -> Sub two pos 0", async ({ page, seededProject }) => {
    await openKanban(page, seededProject.projectId);

    const grip = await gripFor(page, "Sub two", "Drag subtask");
    const s1 = await page.getByText("Sub one", { exact: true }).first().boundingBox();
    expect(grip, "grip for Sub two not found").toBeTruthy();
    expect(s1, "Sub one not found").toBeTruthy();

    await mouseDrag(page, center(grip!), { x: s1!.x + 30, y: s1!.y + 2 });

    const tasks = await getTasks(apiBase(test.info()), seededProject.token, seededProject.projectId);
    const s = byTitle(tasks, "Sub two");
    expect(s?.position).toBe(0);
    expect(s?.parentTaskId).toBe(seededProject.alpha.id);
  });

  test("subtask re-parent: Sub one onto Delta card", async ({ page, seededProject }) => {
    await openKanban(page, seededProject.projectId);

    const grip = await gripFor(page, "Sub one", "Drag subtask");
    const delta = await page.getByText("Delta", { exact: true }).first().boundingBox();
    expect(grip, "grip for Sub one not found").toBeTruthy();
    expect(delta, "Delta card not found").toBeTruthy();

    await mouseDrag(page, center(grip!), { x: delta!.x + 60, y: delta!.y + 4 });

    const tasks = await getTasks(apiBase(test.info()), seededProject.token, seededProject.projectId);
    const s = byTitle(tasks, "Sub one");
    expect(s?.parentTaskId).toBe(seededProject.delta.id);
  });

  test("subtask promote: Sub two -> top-level DONE", async ({ page, seededProject }) => {
    const base = apiBase(test.info());
    // Snapshot the other top-level tasks' relative order BEFORE the drag —
    // prior cases in this describe block (worker-scoped seededProject,
    // sequential) already reordered them, so the original seed order
    // (Alpha, Beta, Gamma, Delta) is no longer necessarily current; fetch
    // it fresh instead of assuming it.
    const otherTitles = ["Alpha", "Beta", "Gamma", "Delta"];
    const before = await getTasks(base, seededProject.token, seededProject.projectId);
    const othersBefore = otherTitles
      .map((title) => byTitle(before, title))
      .filter((t): t is SeededTask => t !== undefined)
      .sort((a, b) => a.position - b.position || a.id - b.id)
      .map((t) => t.title);

    await openKanban(page, seededProject.projectId);

    const grip = await gripFor(page, "Sub two", "Drag subtask");
    const doneHdr = await page.locator("h3", { hasText: /done/i }).first().boundingBox();
    expect(grip, "grip for Sub two not found").toBeTruthy();
    expect(doneHdr, "Done column header not found").toBeTruthy();

    await mouseDrag(page, center(grip!), { x: doneHdr!.x + 90, y: doneHdr!.y + 160 });

    const tasks = await getTasks(base, seededProject.token, seededProject.projectId);
    const s = byTitle(tasks, "Sub two");
    expect(s?.parentTaskId).toBeNull();
    expect(s?.status).toBe("DONE");

    // Promotion targets end-of-column with GLOBAL math (unified-task-
    // ordering Task 4 follow-up). Two assertions below are kept for
    // documentation value but do NOT, on their own, pin the defect this
    // fix addresses (reviewer finding): DONE is empty at this point in the
    // worker sequence, so "last in doneOrder" is trivially true for the
    // only DONE card either way, and inserting one element never permutes
    // the RELATIVE order of the others regardless of where it lands — the
    // buggy `position: 0` and the fixed "append at global end" both leave
    // `othersAfter === othersBefore`. The assertion that actually
    // distinguishes them is the GLOBAL one below: the old
    // `groupedAll[status].length` math (0, for an empty column) sent a
    // *global* index of 0 under the new backend semantics, landing the
    // promoted task at the very FRONT of the project's order, not the end.
    const doneOrder = columnOrder(tasks, "DONE");
    expect(doneOrder[doneOrder.length - 1]).toBe("Sub two");

    const othersAfter = otherTitles
      .map((title) => byTitle(tasks, title))
      .filter((t): t is SeededTask => t !== undefined)
      .sort((a, b) => a.position - b.position || a.id - b.id)
      .map((t) => t.title);
    expect(othersAfter).toEqual(othersBefore);

    // This is the assertion that actually pins the fix: the promoted task
    // must be last in the GLOBAL top-level order, not merely last within
    // its (currently single-card) column.
    const globalTitles = tasks
      .filter((t) => t.parentTaskId === null)
      .sort((a, b) => a.position - b.position || a.id - b.id)
      .map((t) => t.title);
    expect(globalTitles[globalTitles.length - 1]).toBe("Sub two");
  });

  test("WIP badge shows over-limit count in TODO column", async ({ page, seededProject }) => {
    const base = apiBase(test.info());
    await setWipLimits(base, seededProject.token, seededProject.projectId, {
      TODO: 1,
      IN_PROGRESS: null,
      DONE: null,
    });
    await openKanban(page, seededProject.projectId);

    const tasks = await getTasks(base, seededProject.token, seededProject.projectId);
    const todoCount = tasks.filter((x) => x.status === "TODO" && x.parentTaskId === null).length;

    await expect(page.getByText(`${todoCount} / 1`).first()).toBeVisible();
  });

  test("no page errors during drag interactions", async ({ page, seededProject }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await openKanban(page, seededProject.projectId);
    const grip = await gripFor(page, "Gamma", "Drag to reorder");
    const alpha = await page.getByText("Alpha", { exact: true }).first().boundingBox();
    if (grip && alpha) {
      await mouseDrag(page, center(grip), { x: alpha.x + 60, y: alpha.y + 8 });
    }

    expect(errors, errors.join(" || ")).toHaveLength(0);
  });
});

test.describe("kanban drag & drop — mobile (touch)", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(test.info().project.name !== "mobile", "touch drag cases run on the mobile project only");
    await loginViaUi(page);
  });

  test("touch reorder within TODO: drag Alpha to column background below all cards -> appended to end", async ({
    page,
    seededProject,
  }) => {
    // Mobile swipeable-columns layout: columns are horizontal pages below
    // `md`, and the TODO column (index 0) is visible by default, so no swipe
    // is needed to reach it. Deterministic drop target per dnd-kit's
    // arrayMove semantics: dropping on the column's empty background (below
    // every card) always resolves to "append to end" — same behavior as a
    // card-drop resolving to `isColumnId(overId)` in computeCardDrop. Picking
    // a between-cards drop target (e.g. onto "Beta") is comparatively
    // brittle since the exact landing index depends on collision-detection
    // internals; appending to the end is the one outcome dnd-kit guarantees.
    await openKanban(page, seededProject.projectId);

    const grip = await gripFor(page, "Alpha", "Drag to reorder");
    const gamma = await page.getByText("Gamma", { exact: true }).first().boundingBox();
    expect(grip, "grip for Alpha not found").toBeTruthy();
    expect(gamma, "Gamma card not found").toBeTruthy();

    const from = center(grip!);
    // Drop well below the last card (Gamma) in the TODO column, onto the
    // column's empty background area.
    const to = { x: gamma!.x + 40, y: gamma!.y + gamma!.height + 80 };
    await touchDrag(page, from, to);

    const tasks = await getTasks(apiBase(test.info()), seededProject.token, seededProject.projectId);
    const a = byTitle(tasks, "Alpha");
    expect(a?.status).toBe("TODO");
    // Model-correct assertion: Alpha must be last within the TODO column's
    // order, not merely at some absolute index.
    const order = columnOrder(tasks, "TODO");
    expect(order[order.length - 1]).toBe("Alpha");
    // `position` is a GLOBAL index (unified-task-ordering), not a per-column
    // count, so this only holds because this fixture's TODO block happens
    // to sit globally contiguous before the lone IN_PROGRESS task (Delta) —
    // kept as a secondary check, not the model-correct one above.
    const todoTasks = tasks.filter((t) => t.status === "TODO" && t.parentTaskId === null);
    expect(a?.position).toBe(todoTasks.length - 1);
  });

  test("mobile action sheet: card menu moves card to Done", async ({ page, seededProject }) => {
    await openKanban(page, seededProject.projectId);

    const gamma = page.getByText("Gamma", { exact: true }).first();
    const gb = await gamma.boundingBox();
    const menus = page.locator('[aria-label="Card options"]');
    const n = await menus.count();

    let opened = false;
    for (let i = 0; i < n && gb; i++) {
      const mb = await menus.nth(i).boundingBox();
      if (mb && Math.abs(mb.y - gb.y) < 40) {
        await menus.nth(i).click();
        opened = true;
        break;
      }
    }
    if (!opened && n > 0) {
      await menus.first().click();
      opened = true;
    }
    expect(opened, "no card options menu found").toBe(true);

    const sheet = page.getByText("Move to", { exact: false }).first();
    await expect(sheet).toBeVisible({ timeout: 3000 });

    await page.getByText("Done", { exact: true }).last().click();
    await page.waitForTimeout(1000);

    const tasks = await getTasks(apiBase(test.info()), seededProject.token, seededProject.projectId);
    const moved = tasks.some(
      (x) => x.parentTaskId === null && x.status === "DONE" && ["Gamma", "Alpha"].includes(x.title),
    );
    expect(moved).toBe(true);
  });

  test("no page errors during mobile drag/action-sheet interactions", async ({ page, seededProject }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await openKanban(page, seededProject.projectId);
    const grip = await gripFor(page, "Alpha", "Drag to reorder");
    const beta = await page.getByText("Beta", { exact: true }).first().boundingBox();
    if (grip && beta) {
      await touchDrag(page, center(grip), { x: beta.x + 40, y: beta.y + 20 });
    }

    expect(errors, errors.join(" || ")).toHaveLength(0);
  });
});
