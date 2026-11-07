import { test, expect, loginViaUi } from "../fixtures/test";

// docs/archive/plans/application-review-2026-10-22.md, QA-01: a task created
// while the browser is offline used to sit on a disabled "Saving…" button
// indefinitely (React Query paused the mutation) and was sent by itself
// once the network returned. The write must fail fast with a visible
// message, keep the draft, and succeed on an explicit retry.
test.describe("writes while offline — desktop", () => {
  test.beforeEach(async () => {
    test.skip(test.info().project.name !== "desktop", "Kanban add-task flow is exercised on desktop");
  });

  test("creating a task offline shows an error at once; retrying online succeeds", async ({
    page,
    seededProject,
  }) => {
    const { projectId } = seededProject;
    const title = `Offline draft ${Date.now().toString(36)}`;
    await loginViaUi(page);
    await page.goto(`/projects/${projectId}/kanban`, { waitUntil: "networkidle" });

    await page.locator("main").getByRole("button", { name: /task/i }).first().click();
    const drawer = page.getByRole("dialog", { name: "New task" });
    await expect(drawer).toBeVisible();
    await page.getByPlaceholder("Task title").fill(title);
    await expect(page.getByPlaceholder("Task title")).toHaveValue(title);

    await page.context().setOffline(true);
    await drawer.getByRole("button", { name: "Create task" }).click();

    // Prompt feedback — well under the 30 s request timeout.
    await expect(drawer.getByRole("alert")).toBeVisible({ timeout: 10_000 });
    await expect(drawer.getByRole("alert")).toHaveText(/offline|could not reach/i);
    await expect(drawer.getByRole("button", { name: "Create task" })).toBeEnabled();
    await expect(page.getByPlaceholder("Task title")).toHaveValue(title);

    await page.context().setOffline(false);
    await drawer.getByRole("button", { name: "Create task" }).click();
    // The drawer slides out on success; wait for it to go before counting
    // cards, or its heading still carries the title for a moment.
    await expect(drawer).toBeHidden({ timeout: 10_000 });
    const cards = page.locator("main").getByText(title);
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    // Exactly one task — the offline attempt was not queued and replayed.
    await expect(cards).toHaveCount(1);
  });
});
