import { test, expect, loginViaUi } from "../fixtures/test";

// An unknown URL inside the app shows a real 404 panel (sidebar/top bar stay)
// instead of silently redirecting to Overview, and the tab title follows the
// route. Signed-out visits are still sent to sign-in by AuthGuard.

test("an unknown URL shows Page not found with the attempted path and a way home", async ({ page }) => {
  await loginViaUi(page);
  await page.goto("/no-such-page", { waitUntil: "networkidle" });

  await expect(page).toHaveURL(/\/no-such-page$/);
  await expect(page.getByText("Page not found")).toBeVisible();
  await expect(page.getByText("/no-such-page")).toBeVisible();
  await expect(page).toHaveTitle("Not found · Solvro");
  // Still inside the shell: the top bar's current-page crumb reads "Not found".
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Not found");

  await page.getByRole("link", { name: "Go to Overview" }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page).toHaveTitle("Overview · Solvro");
});

test("a mistyped project view is a 404, not a silent redirect", async ({ page, seededProject }) => {
  await loginViaUi(page);
  await page.goto(`/projects/${seededProject.projectId}/board`, { waitUntil: "networkidle" });
  await expect(page.getByText("Page not found")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/projects/${seededProject.projectId}/board$`));
});

test("the tab title follows the page", async ({ page }) => {
  await loginViaUi(page);
  await page.goto("/projects", { waitUntil: "networkidle" });
  await expect(page).toHaveTitle("Projects · Solvro");
});

test("signed out, an unknown URL still goes to sign-in", async ({ page }) => {
  await page.goto("/no-such-page", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/login/);
});
