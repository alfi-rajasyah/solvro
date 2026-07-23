import { test, expect, loginViaUi, apiBase } from "../fixtures/test";

// Regression for GH #58: label placement is decided by measured text fit —
// inside iff the full name fits the bar — instead of the old 90px bar-width
// threshold that split typical week-zoom charts arbitrarily.

test.describe("gantt bar labels — desktop", () => {
  test.beforeEach(async () => {
    test.skip(
      test.info().project.name !== "desktop",
      "Gantt is desktop-only (hidden md:block)",
    );
  });

  test("short name inside a wide bar; long name floats outside a narrow bar", async ({
    page,
    seededProject,
  }) => {
    const { token, projectId, alpha } = seededProject;
    const base = apiBase(test.info());
    const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    // 1-day bar (~20px at default Week zoom) with a name that can never fit.
    const longName = `Unfittably long task name for the label rule ${stamp}`;
    const res = await fetch(`${base}/api/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: longName,
        status: "TODO",
        startDate: "2026-07-06",
        dueDate: "2026-07-06",
      }),
    });
    expect(res.ok).toBe(true);
    const narrow = (await res.json()) as { id: number };

    await loginViaUi(page);
    await page.goto(`/projects/${projectId}/gantt`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    // Alpha: 5-day bar (~100px) vs "Alpha" (~27px @10px font) → INSIDE:
    // the name renders as a child of the bar element, and no floated
    // outside label exists for it.
    await expect(
      page.locator(`[data-task-id="${alpha.id}"]`).getByText("Alpha", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(`[data-label-for="${alpha.id}"]`)).toHaveCount(0);

    // The 1-day task → OUTSIDE: floated label present, nothing inside the bar.
    await expect(page.locator(`[data-label-for="${narrow.id}"]`)).toBeVisible();
    await expect(
      page.locator(`[data-task-id="${narrow.id}"]`).getByText(longName),
    ).toHaveCount(0);
  });
});
