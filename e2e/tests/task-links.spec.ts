import { test, expect, loginViaUi, apiBase } from "../fixtures/test";
import { createTask } from "../fixtures/seed";

// Document links on a task (docs/archive/plans/task-links.md): the task
// panel reuses the shared LinksSection. Each test seeds its own task so it
// never depends on data from another spec file.

function stamp(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

test("adds, edits and deletes a document link in the task panel", async ({ page, seededProject }) => {
  const { token, projectId } = seededProject;
  const task = await createTask(apiBase(test.info()), token, projectId, { title: `LinkTask ${stamp()}` });

  await loginViaUi(page);
  await page.goto(`/projects/${projectId}/list?task=${task.id}`, { waitUntil: "networkidle" });
  const panel = page.getByRole("dialog", { name: "Task details" });
  await expect(panel).toBeVisible();

  await panel.getByRole("button", { name: "Add link" }).click();
  await panel.getByRole("textbox", { name: "Link label" }).fill("Runbook");
  await panel.getByRole("textbox", { name: "Link URL" }).fill("https://example.com/runbook");
  await panel.getByRole("button", { name: "Save", exact: true }).click();

  const link = panel.getByRole("link", { name: "Runbook" });
  await expect(link).toHaveAttribute("href", "https://example.com/runbook");
  await expect(link).toHaveAttribute("target", "_blank");

  await panel.getByRole("button", { name: "Edit link" }).click();
  await panel.getByRole("textbox", { name: "Link label" }).fill("Runbook v2");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel.getByRole("link", { name: "Runbook v2" })).toBeVisible();

  await panel.getByRole("button", { name: "Delete link" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(panel.getByRole("link", { name: "Runbook v2" })).toHaveCount(0);
});
