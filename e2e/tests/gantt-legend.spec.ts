import { test, expect, loginViaUi, apiBase } from "../fixtures/test";
import type { Page } from "@playwright/test";

// Regression coverage for the sustained Color-by legend
// (docs/plans/optional-sa-and-gantt-color-legend-plan.md, Task 3): the
// toolbar must expose a labeled "Color by" select, and the legend must be
// present in ALL three modes — Section mode previously rendered no legend
// at all. Assertions are scoped to the legend container because section
// names also appear as rows in the gantt list pane.

async function openGantt(page: Page, projectId: number): Promise<void> {
  await page.goto(`/projects/${projectId}/gantt`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
}

test.describe("gantt color-by legend — desktop", () => {
  test.beforeEach(async () => {
    test.skip(
      test.info().project.name !== "desktop",
      "Gantt is desktop-only (hidden md:block)",
    );
  });

  test("legend persists across all three color modes", async ({ page, seededProject }) => {
    const { token, projectId } = seededProject;
    const base = apiBase(test.info());

    // Stamp the section names so a Playwright retry (playwright.config.ts
    // sets retries: 1) re-running this seeding loop against the same
    // worker-cached seededProject creates fresh, uniquely-named sections
    // instead of duplicates — matches the stamp convention already used in
    // e2e/fixtures/seed.ts.
    const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const phaseAlpha = `Phase Alpha ${stamp}`;
    const phaseBeta = `Phase Beta ${stamp}`;

    // Seed two sections so Section mode has legend content.
    for (const name of [phaseAlpha, phaseBeta]) {
      const res = await fetch(`${base}/api/projects/${projectId}/sections`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      expect(res.ok).toBe(true);
    }

    await loginViaUi(page);
    await openGantt(page, projectId);

    const select = page.getByLabel(/color by/i);
    await expect(select).toBeVisible();
    // Default colorBy is "section" (GanttFrame.tsx: decided 2026-07-20,
    // unrelated to this task) — Section mode is therefore the FIRST legend
    // shown, which is also the mode that previously had no legend at all.
    await expect(select).toHaveValue("section");

    const legend = page.getByTestId("gantt-legend");
    await expect(legend.getByText(phaseAlpha, { exact: true })).toBeVisible();
    await expect(legend.getByText(phaseBeta, { exact: true })).toBeVisible();

    await select.selectOption("status");
    await expect(legend.getByText("In Progress", { exact: true })).toBeVisible();

    await select.selectOption("priority");
    await expect(legend.getByText("Urgent", { exact: true })).toBeVisible();

    // Back to section — sustained, not one-shot.
    await select.selectOption("section");
    await expect(legend.getByText(phaseAlpha, { exact: true })).toBeVisible();
  });
});
