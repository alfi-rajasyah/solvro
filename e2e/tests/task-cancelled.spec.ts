import type { Page } from "@playwright/test";
import { test, expect, loginViaUi, apiBase } from "../fixtures/test";
import { getTasks, seedFixture } from "../fixtures/seed";

// Cancelled task status: setting a task to Cancelled from the List status
// dropdown removes it from the project's totals, so the header's
// "N% · X of Y" figure recomputes with one task fewer. Uses its own freshly
// seeded project — the cancelled task would otherwise leak into the shared
// worker fixture other specs count on.

const PROGRESS = /(\d+)% · (\d+) of (\d+)/;

async function readProgress(page: Page): Promise<{ pct: number; done: number; total: number }> {
  const facts = page.getByRole("group", { name: "Project facts" });
  const text = (await facts.getByText(PROGRESS).textContent()) ?? "";
  const m = PROGRESS.exec(text);
  expect(m, `progress text "${text}"`).not.toBeNull();
  return { pct: Number(m![1]), done: Number(m![2]), total: Number(m![3]) };
}

test.describe("Cancelled task status", () => {
  test("cancelling a task from the List dropdown recalculates header progress", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "List row dropdown is the desktop grid row");
    const base = apiBase(testInfo);
    const fx = await seedFixture(base);

    await loginViaUi(page);
    await page.goto(`/projects/${fx.projectId}/list`, { waitUntil: "networkidle" });

    const facts = page.getByRole("group", { name: "Project facts" });
    await expect(facts.getByText(PROGRESS)).toBeVisible();
    const before = await readProgress(page);

    // Beta starts To do. The chip is a button in the row; its dropdown lists
    // every status as a sibling button.
    const row = page.locator('div[class*="grid-cols-"]', { hasText: "Beta" });
    await row.locator("button").filter({ hasText: "To do" }).click();
    await row.locator("button").filter({ hasText: "Cancelled" }).click();

    await expect
      .poll(async () => (await getTasks(base, fx.token, fx.projectId)).find((t) => t.id === fx.beta.id)?.status, {
        message: "waiting for Beta's status PATCH to land",
        timeout: 10_000,
      })
      .toBe("CANCELLED");

    // The row stays in place, now showing the Cancelled chip.
    await expect(row.locator("button").filter({ hasText: "Cancelled" })).toBeVisible();

    // One task left the total; nothing else changed.
    await expect
      .poll(async () => (await readProgress(page)).total, { timeout: 10_000 })
      .toBe(before.total - 1);
    const after = await readProgress(page);
    expect(after.done).toBe(before.done);
    expect(Number.isNaN(after.pct)).toBe(false);
  });
});
