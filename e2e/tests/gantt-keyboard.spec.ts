import { test, expect, loginViaUi, apiBase } from "../fixtures/test";
import { createTask, getTasks, isoDateOffset } from "../fixtures/seed";
import type { Locator, Page } from "@playwright/test";

// Keyboard move/resize of Gantt bars (SolvroGantt.tsx + useGanttKeyboardNudge.ts).
// Arrow keys on a focused bar preview the change; the write goes out through
// the same commit a pointer drop uses ~600 ms after the last key, on Enter,
// or on blur. Escape cancels a pending preview.
// docs/archive/plans/application-review-2026-10-22.md, F-36.

function stamp(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function gotoGantt(page: Page, projectId: number): Promise<void> {
  await page.goto(`/projects/${projectId}/gantt`, { waitUntil: "networkidle" });
  await expect(page.locator('[data-slot="gantt-tree-pane"] [data-gantt-row-id]').first()).toBeVisible();
}

/** The bar's wrapper button, located from Solvro's content span inside it. */
function barButton(page: Page, taskId: number): Locator {
  return page
    .locator(`[data-task-id="${taskId}"]`)
    .locator('xpath=ancestor::*[@data-slot="gantt-bar"]');
}

async function datesOf(
  base: string,
  token: string,
  projectId: number,
  taskId: number,
): Promise<{ start: string; due: string }> {
  const t = (await getTasks(base, token, projectId)).find((x) => x.id === taskId);
  expect(t, `task ${taskId} missing from API`).toBeTruthy();
  return {
    start: (t!.startDate as string).slice(0, 10),
    due: (t!.dueDate as string).slice(0, 10),
  };
}

test.describe("gantt keyboard — arrow-key move and resize (desktop)", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "Gantt is desktop-only (hidden md:block)");
    await loginViaUi(page);
  });

  test("a bar is focusable and named with its task and dates", async ({ page, seededProject }) => {
    const { token, projectId } = seededProject;
    const base = apiBase(test.info());
    const title = `KbName ${stamp()}`;
    const task = await createTask(base, token, projectId, {
      title,
      status: "TODO",
      startDate: isoDateOffset(0),
      dueDate: isoDateOffset(3),
    });
    await gotoGantt(page, projectId);

    const bar = barButton(page, task.id);
    await bar.focus();
    await expect(bar).toBeFocused();
    await expect(bar).toHaveAttribute("aria-label", new RegExp(`^${title},`));
  });

  test("Right arrow twice moves the bar +2 days, persists after reload; focus survives the remount", async ({
    page,
    seededProject,
  }) => {
    const { token, projectId } = seededProject;
    const base = apiBase(test.info());
    const task = await createTask(base, token, projectId, {
      title: `KbMove ${stamp()}`,
      status: "TODO",
      startDate: isoDateOffset(0),
      dueDate: isoDateOffset(3),
    });
    await gotoGantt(page, projectId);

    await barButton(page, task.id).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    // Focus must still be on the task's bar for the second press to have landed.
    await expect(barButton(page, task.id)).toBeFocused();

    await expect
      .poll(() => datesOf(base, token, projectId, task.id), { timeout: 10_000 })
      .toEqual({ start: isoDateOffset(2), due: isoDateOffset(5) });

    await gotoGantt(page, projectId);
    expect(await datesOf(base, token, projectId, task.id)).toEqual({
      start: isoDateOffset(2),
      due: isoDateOffset(5),
    });
  });

  test("Shift+Left moves a week earlier", async ({ page, seededProject }) => {
    const { token, projectId } = seededProject;
    const base = apiBase(test.info());
    const task = await createTask(base, token, projectId, {
      title: `KbWeek ${stamp()}`,
      status: "TODO",
      startDate: isoDateOffset(1),
      dueDate: isoDateOffset(3),
    });
    await gotoGantt(page, projectId);

    await barButton(page, task.id).focus();
    await page.keyboard.press("Shift+ArrowLeft");
    await expect
      .poll(() => datesOf(base, token, projectId, task.id), { timeout: 10_000 })
      .toEqual({ start: isoDateOffset(-6), due: isoDateOffset(-4) });
  });

  test("Alt+Right resizes the end only; Alt+Left never passes the start", async ({ page, seededProject }) => {
    const { token, projectId } = seededProject;
    const base = apiBase(test.info());
    const task = await createTask(base, token, projectId, {
      title: `KbResize ${stamp()}`,
      status: "TODO",
      startDate: isoDateOffset(0),
      dueDate: isoDateOffset(2),
    });
    await gotoGantt(page, projectId);

    const bar = barButton(page, task.id);
    await bar.focus();
    await page.keyboard.press("Alt+ArrowRight");
    await expect
      .poll(() => datesOf(base, token, projectId, task.id), { timeout: 10_000 })
      .toEqual({ start: isoDateOffset(0), due: isoDateOffset(3) });

    // A full week back would cross the start: the end clamps to the start day.
    await bar.focus();
    await page.keyboard.press("Alt+Shift+ArrowLeft");
    await expect
      .poll(() => datesOf(base, token, projectId, task.id), { timeout: 10_000 })
      .toEqual({ start: isoDateOffset(0), due: isoDateOffset(0) });
  });

  test("Enter commits at once instead of opening the task panel", async ({ page, seededProject }) => {
    const { token, projectId } = seededProject;
    const base = apiBase(test.info());
    const task = await createTask(base, token, projectId, {
      title: `KbEnter ${stamp()}`,
      status: "TODO",
      startDate: isoDateOffset(0),
      dueDate: isoDateOffset(2),
    });
    await gotoGantt(page, projectId);

    await barButton(page, task.id).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect
      .poll(() => datesOf(base, token, projectId, task.id), { timeout: 10_000 })
      .toEqual({ start: isoDateOffset(1), due: isoDateOffset(3) });
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("Escape cancels a pending preview: nothing is written, the bar returns", async ({
    page,
    seededProject,
  }) => {
    const { token, projectId } = seededProject;
    const base = apiBase(test.info());
    const task = await createTask(base, token, projectId, {
      title: `KbEscape ${stamp()}`,
      status: "TODO",
      startDate: isoDateOffset(0),
      dueDate: isoDateOffset(2),
    });
    await gotoGantt(page, projectId);

    const bar = barButton(page, task.id);
    const labelBefore = await bar.getAttribute("aria-label");
    await bar.focus();
    await page.keyboard.press("ArrowRight");
    await expect(barButton(page, task.id)).not.toHaveAttribute("aria-label", labelBefore!);
    await page.keyboard.press("Escape");
    await expect(barButton(page, task.id)).toHaveAttribute("aria-label", labelBefore!);

    // Well past the 600 ms commit delay: still the original dates. Negative
    // assertion, so the elapsed window is the check — no DOM signal exists.
    await page.waitForTimeout(1500);
    expect(await datesOf(base, token, projectId, task.id)).toEqual({
      start: isoDateOffset(0),
      due: isoDateOffset(2),
    });
  });

  test("a milestone moves but does not resize, and Alt+Arrow never navigates Back", async ({
    page,
    seededProject,
  }) => {
    const { token, projectId } = seededProject;
    const base = apiBase(test.info());
    const task = await createTask(base, token, projectId, {
      title: `KbMilestone ${stamp()}`,
      status: "TODO",
      startDate: isoDateOffset(1),
      dueDate: isoDateOffset(1),
      isMilestone: true,
    });
    // Visit another page first so a browser Back would have somewhere to go.
    await page.goto(`/projects/${projectId}/list`, { waitUntil: "networkidle" });
    await gotoGantt(page, projectId);
    const ganttUrl = page.url();
    expect(ganttUrl).toContain("/gantt");

    await barButton(page, task.id).focus();
    await page.keyboard.press("Alt+ArrowLeft"); // refused for a milestone, but must not go Back
    // Negative assertion: a wrongly-fired history Back has no DOM signal to await.
    await page.waitForTimeout(500);
    expect(page.url()).toBe(ganttUrl);
    await expect(barButton(page, task.id)).toBeFocused();

    await page.keyboard.press("Alt+ArrowRight"); // no-op for a milestone
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => datesOf(base, token, projectId, task.id), { timeout: 10_000 })
      .toEqual({ start: isoDateOffset(2), due: isoDateOffset(2) });
  });

  test("a pointer drop right after an arrow key wins over the unsent keyboard preview", async ({
    page,
    seededProject,
  }) => {
    const { token, projectId } = seededProject;
    const base = apiBase(test.info());
    const task = await createTask(base, token, projectId, {
      title: `KbPointer ${stamp()}`,
      status: "TODO",
      startDate: isoDateOffset(0),
      dueDate: isoDateOffset(2),
    });
    await gotoGantt(page, projectId);

    await barButton(page, task.id).focus();
    await page.keyboard.press("ArrowRight"); // preview: +1 day, 600 ms from being sent
    const box = await barButton(page, task.id).boundingBox();
    expect(box, "bar not found after the key press").toBeTruthy();
    const from = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
    // Fast, un-paced drag so the drop lands inside the 600 ms window.
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 4; i++) await page.mouse.move(from.x + (Math.max(200, box!.width) * i) / 4, from.y);
    await page.mouse.up();

    // Must outlast the 600 ms keyboard commit delay: the check is that the
    // superseded keyboard commit never lands after the drag's, which has no
    // DOM signal to await.
    await page.waitForTimeout(1800);
    const after = await datesOf(base, token, projectId, task.id);
    // The keyboard-only result would be start = +1; the drag moved further.
    expect(after.start > isoDateOffset(1)).toBe(true);
  });
});

test.describe("gantt keyboard — read-only user (desktop)", () => {
  test("a user without task:write cannot nudge a bar", async ({ page, seededProject }) => {
    test.skip(test.info().project.name !== "desktop", "Gantt is desktop-only (hidden md:block)");
    const { token, projectId } = seededProject;
    const base = apiBase(test.info());
    const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const suffix = stamp();
    const roleName = `E2E_GANTT_READONLY_${suffix.toUpperCase()}`;
    const email = `e2e-gantt-ro-${suffix}@solvro.test`;
    const password = "QaReadOnly1234!";
    let roleId: number | null = null;
    let userId: number | null = null;
    try {
      const role = (await (
        await fetch(`${base}/api/admin/roles`, {
          method: "POST",
          headers: H,
          body: JSON.stringify({ roleName, permissions: ["project:view-all", "project:read", "task:read"] }),
        })
      ).json()) as { id: number };
      expect(role.id, "read-only role was not created").toBeTruthy();
      roleId = role.id;
      const user = (await (
        await fetch(`${base}/api/admin/users`, {
          method: "POST",
          headers: H,
          body: JSON.stringify({ email, username: `e2e-gantt-ro-${suffix}`, password, role: roleName }),
        })
      ).json()) as { id: number };
      expect(user.id, "read-only user was not created").toBeTruthy();
      userId = user.id;

      const task = await createTask(base, token, projectId, {
        title: `KbReadOnly ${suffix}`,
        status: "TODO",
        startDate: isoDateOffset(0),
        dueDate: isoDateOffset(2),
      });

      await loginViaUi(page, email, password);
      await gotoGantt(page, projectId);
      const bar = barButton(page, task.id);
      await expect(bar).toBeVisible();
      const label = await bar.getAttribute("aria-label");
      await bar.focus();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Alt+ArrowRight");
      // Negative assertion: waits out the commit delay to prove nothing was sent.
      await page.waitForTimeout(1500);
      await expect(bar).toHaveAttribute("aria-label", label!);
      expect(await datesOf(base, token, projectId, task.id)).toEqual({
        start: isoDateOffset(0),
        due: isoDateOffset(2),
      });
    } finally {
      if (userId !== null) {
        await fetch(`${base}/api/admin/users/${userId}`, { method: "DELETE", headers: H }).catch(() => {});
      }
      if (roleId !== null) {
        await fetch(`${base}/api/admin/roles/${roleId}`, { method: "DELETE", headers: H }).catch(() => {});
      }
    }
  });
});
