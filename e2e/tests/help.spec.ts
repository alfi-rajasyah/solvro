import { test, expect, loginViaUi } from "../fixtures/test";

// The "How to use Solvro" page is reached from the TopBar's help button only
// (no sidebar or ⌘K entry). The seeded QA user is an admin, so every guide and
// topic — including the permission-gated Executive and Admin ones — renders.
// Layout: h1 page, h2 "Guides" / "Reference", h3 per guide or topic.

const h3 = (page: import("@playwright/test").Page, name: string) =>
  page.getByRole("heading", { level: 3, name, exact: true });

test("the TopBar help button opens How to use Solvro with Guides above Reference", async ({ page }) => {
  await loginViaUi(page);
  await page.getByRole("link", { name: "Help" }).click();
  await expect(page).toHaveURL(/\/help$/);
  await expect(page.getByRole("heading", { level: 1, name: "How to use Solvro" })).toBeVisible();

  const guides = page.getByRole("heading", { level: 2, name: "Guides", exact: true });
  const reference = page.getByRole("heading", { level: 2, name: "Reference", exact: true });
  await expect(guides).toBeVisible();
  await expect(reference).toBeVisible();
  const guidesY = (await guides.boundingBox())!.y;
  const referenceY = (await reference.boundingBox())!.y;
  expect(guidesY).toBeLessThan(referenceY);

  await expect(h3(page, "Run a project")).toBeVisible();
  await expect(h3(page, "Offboard a teammate")).toBeVisible();
  await expect(h3(page, "Getting started")).toBeVisible();
  await expect(h3(page, "Admin")).toBeVisible();
});

test("help search narrows guides and topics and shows an empty state", async ({ page }) => {
  await loginViaUi(page);
  await page.goto("/help");
  const search = page.getByRole("searchbox", { name: "Search help" });

  await search.fill("personal token");
  await expect(h3(page, "iTop tickets")).toBeVisible();
  await expect(h3(page, "Track hours and tickets")).toBeVisible();
  await expect(h3(page, "Weekly Sync")).toHaveCount(0);
  await expect(h3(page, "Prepare the Weekly Sync")).toHaveCount(0);

  await search.fill("zzz-no-match");
  await expect(page.getByText('No help topics match "zzz-no-match".')).toBeVisible();
});

test("searching hold finds the project and deal guides", async ({ page }) => {
  await loginViaUi(page);
  await page.goto("/help");
  await page.getByRole("searchbox", { name: "Search help" }).fill("hold");
  await expect(h3(page, "Run a project")).toBeVisible();
  await expect(h3(page, "Work a deal")).toBeVisible();
  await expect(h3(page, "Handle a risk")).toHaveCount(0);
});

test("the lifecycle guide quotes the dialog labels", async ({ page }) => {
  await loginViaUi(page);
  await page.goto("/help#guide-run-a-project");
  const guide = page.locator("#guide-run-a-project");
  await expect(guide).toContainText("Cancel project and its open tasks?");
  await expect(guide).toContainText("Update the timeline?");
  await expect(guide).toContainText("Shift open dates by N days");
  await expect(guide).toContainText("I'll update the timeline myself");
  await expect(guide).toContainText("Clear filters");
});

test("a guide's Read more link jumps to its reference topic", async ({ page }) => {
  await loginViaUi(page);
  await page.goto("/help#guide-run-a-project");
  await page.locator("#guide-run-a-project").getByRole("link", { name: "Projects", exact: true }).click();
  await expect(page).toHaveURL(/\/help#projects$/);
  await expect(h3(page, "Projects")).toBeInViewport();
});

test("a /help#<topic> link scrolls to that topic", async ({ page }) => {
  await loginViaUi(page);
  await page.goto("/help#itop");
  await expect(h3(page, "iTop tickets")).toBeInViewport();
  await expect(h3(page, "Getting started")).not.toBeInViewport();
});

test("Pipeline help is searchable and deep-linkable", async ({ page }) => {
  await loginViaUi(page);
  await page.goto("/help");
  await page.getByRole("searchbox", { name: "Search help" }).fill("Waiting Sales input");
  await expect(h3(page, "Pipeline")).toBeVisible();
  await expect(h3(page, "Opportunities")).toBeVisible();
  await expect(h3(page, "Weekly Sync")).toHaveCount(0);

  await page.goto("/help#pipeline");
  await expect(h3(page, "Pipeline")).toBeInViewport();
  await expect(h3(page, "Getting started")).not.toBeInViewport();
});

test("the topic list shows on desktop and hides on a phone", async ({ page }, testInfo) => {
  await loginViaUi(page);
  await page.goto("/help");
  const toc = page.getByRole("navigation", { name: "Help topics" });
  if (testInfo.project.name === "mobile") {
    await expect(toc).toBeHidden();
  } else {
    await expect(toc.getByText("Guides", { exact: true })).toBeVisible();
    await expect(toc.getByText("Reference", { exact: true })).toBeVisible();
    await toc.locator('a[href="#weekly-sync"]').click();
    await expect(page).toHaveURL(/\/help#weekly-sync$/);
    await expect(h3(page, "Weekly Sync")).toBeInViewport();
  }
});
