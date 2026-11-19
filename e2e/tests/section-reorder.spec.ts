import { test, expect, loginViaUi, apiBase } from "../fixtures/test";
import { createSection, type SeededSection } from "../fixtures/seed";

// ISS-155: the Reorder sections modal had no drag coverage. The spec seeds
// its own uniquely named sections and reads the order back through the API,
// so it depends on no other spec file's data. Keyboard drag (focus the handle,
// Space to lift, ArrowDown, Space to drop) works on both projects.

async function listSections(base: string, token: string, projectId: number): Promise<SeededSection[]> {
  const res = await fetch(`${base}/api/projects/${projectId}/sections`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`sections ${res.status}`);
  const rows = (await res.json()) as SeededSection[];
  return rows.sort((a, b) => a.position - b.position || a.id - b.id);
}

test.describe("Reorder sections modal", () => {
  test("a keyboard drag moves a section and the new order persists", async ({
    page,
    seededProject,
  }, testInfo) => {
    const base = apiBase(testInfo);
    const { token, projectId } = seededProject;
    const tag = Date.now().toString(36);
    const names = [`Reorder A ${tag}`, `Reorder B ${tag}`, `Reorder C ${tag}`];
    for (const [i, name] of names.entries()) {
      await createSection(base, token, projectId, { name, position: i });
    }
    const before = (await listSections(base, token, projectId)).map((s) => s.name);
    expect(before.filter((n) => names.includes(n))).toEqual(names);

    await loginViaUi(page);
    await page.goto(`/projects/${projectId}/list`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Reorder sections" }).click();
    const dialog = page.getByRole("dialog", { name: "Reorder sections" });
    await expect(dialog).toBeVisible();

    const handles = dialog.getByRole("button", { name: "Reorder section" });
    const firstIndex = before.indexOf(names[0]);
    const handle = handles.nth(firstIndex);
    await handle.focus();
    await expect(handle).toBeFocused();
    // Wait for the sensor to attach before moving: dnd-kit's live region turns
    // non-empty on pick-up (same pacing as kanban-dnd.spec.ts).
    const status = page.locator('[id^="DndLiveRegion"]').last();
    await page.keyboard.press("Space");
    await expect(status).toContainText("moved over droppable area");
    const pickedId = /item (\S+)/.exec((await status.textContent()) ?? "")?.[1] ?? "";
    // The sensor can miss a key sent right after pick-up, so press until the
    // announcement names a different droppable than the dragged item itself.
    await expect(async () => {
      await page.keyboard.press("ArrowDown");
      await expect(status).toHaveText(
        new RegExp(`moved over droppable area (?!${pickedId}\\b)\\S+`),
        { timeout: 1500 },
      );
    }).toPass({ timeout: 10_000 });
    await page.keyboard.press("Space");

    // One PATCH per drop; wait for the order to land on the server.
    await expect
      .poll(async () => {
        const order = (await listSections(base, token, projectId)).map((s) => s.name);
        return order.filter((n) => names.includes(n));
      })
      .toEqual([names[1], names[0], names[2]]);

    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
  });
});
