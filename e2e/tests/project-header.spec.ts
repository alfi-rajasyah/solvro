import { test, expect, loginViaUi, apiBase } from "../fixtures/test";

// Project header (pages/ProjectDetail.tsx + components/ProjectHeaderFacts.tsx):
// the facts row shows the customer and a progress figure, and Delete is
// reachable only through the ⋯ menu, where it opens a confirmation dialog.
// The dialog is cancelled — the seeded project is shared by the whole file.

test.describe("Project header", () => {
  test("facts row shows the customer and progress", async ({ page, seededProject }) => {
    await loginViaUi(page);
    await page.goto(`/projects/${seededProject.projectId}`, { waitUntil: "networkidle" });

    const facts = page.getByRole("group", { name: "Project facts" });
    await expect(facts).toBeVisible();
    await expect(facts.getByText(seededProject.customerName, { exact: true })).toBeVisible();
    await expect(facts.getByText(/\d+% · \d+ of \d+/)).toBeVisible();
  });

  // Risks tab (views/ProjectRisks.tsx): the Mitigated status control takes its
  // colours from the theme-aware chip tokens, not the light-only amber palette.
  test("Mitigated risk status uses the theme amber token in dark mode", async ({
    page,
    seededProject,
  }, testInfo) => {
    // The status select lives in the desktop data grid; phones render RiskCard.
    test.skip(testInfo.project.name !== "desktop", "risk status select is desktop-only");
    const description = `Chip token risk ${Date.now()}`;
    const res = await fetch(`${apiBase(testInfo)}/api/projects/${seededProject.projectId}/risks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${seededProject.token}`,
      },
      body: JSON.stringify({ description, status: "MITIGATED" }),
    });
    expect(res.ok).toBe(true);

    await page.addInitScript(() => localStorage.setItem("solvro.theme", "dark"));
    await loginViaUi(page);
    await page.goto(`/projects/${seededProject.projectId}/risks`, { waitUntil: "networkidle" });
    await expect(page.locator("html")).toHaveClass(/dark/);

    const status = page.getByLabel(`Status of risk: ${description}`);
    await expect(status).toBeVisible();
    // The editable status is a native select: it carries its tone as text
    // colour on the standard input surface, from the theme token, never a raw
    // palette class.
    await expect(status).toHaveClass(/text-chip-amber-text/);
    await expect(status).not.toHaveClass(/(bg|text)-amber-\d/);
  });

  test("Delete project is reachable only through the more-actions menu", async ({
    page,
    seededProject,
  }) => {
    await loginViaUi(page);
    await page.goto(`/projects/${seededProject.projectId}`, { waitUntil: "networkidle" });

    // Not a top-level button any more.
    await expect(page.getByRole("button", { name: "Delete project" })).toHaveCount(0);

    await page.getByRole("button", { name: "More project actions" }).click();
    await page.getByRole("menuitem", { name: "Delete project" }).click();

    const dialog = page.getByRole("dialog", { name: "Delete project" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  // Below md the top bar keeps only the current crumb (the project name) and
  // the facts row collapses to status + customer + progress; every action
  // lives in the ⋯ menu.
  test("mobile: project name is visible and clear of the search button", async (
    { page, seededProject },
    testInfo,
  ) => {
    test.skip(testInfo.project.name !== "mobile", "375px layout check is mobile-only");
    const res = await fetch(`${apiBase(testInfo)}/api/projects/${seededProject.projectId}`, {
      headers: { Authorization: `Bearer ${seededProject.token}` },
    });
    const { name } = (await res.json()) as { name: string };

    await loginViaUi(page);
    await page.goto(`/projects/${seededProject.projectId}`, { waitUntil: "networkidle" });

    const title = page.getByRole("banner").locator('[aria-current="page"]');
    await expect(title).toHaveText(name);
    await expect(title).toBeVisible();

    const titleBox = await title.boundingBox();
    const searchBox = await page
      .getByRole("banner")
      .getByRole("button", { name: "Open search" })
      .locator("visible=true")
      .first()
      .boundingBox();
    expect(titleBox).not.toBeNull();
    expect(searchBox).not.toBeNull();
    expect(titleBox!.x + titleBox!.width).toBeLessThanOrEqual(searchBox!.x + 1);

    // Actions collapse into the ⋯ menu: no standalone Edit or Context button.
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /project context/i })).toHaveCount(0);
    await page.getByRole("button", { name: "More project actions" }).click();
    await expect(page.getByRole("menuitem", { name: "Show project context" })).toBeVisible();
  });
});
