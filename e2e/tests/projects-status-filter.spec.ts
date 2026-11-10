import { type Page } from "@playwright/test";
import { apiBase, expect, loginViaUi, test } from "../fixtures/test";
import { login } from "../fixtures/seed";
import { createCustomer, createProject, uniqueStamp } from "../fixtures/lifecycle";

// Projects page Status filter (spec F2). One throwaway customer holds an
// Active, an On hold and a Completed project; ?customerId= scopes the page to
// them so the (shared) dev database does not matter. Each test seeds its own
// customer and projects.

interface Seed {
  customerId: number;
  customerName: string;
  active: number;
  hold: number;
  done: number;
}

async function seed(base: string): Promise<Seed> {
  const admin = await login(base);
  const s = uniqueStamp();
  const customerName = `Status Filter Co ${s}`;
  const customer = await createCustomer(base, admin.token, customerName);
  const mk = (label: string, status: string) =>
    createProject(base, admin.token, { name: `SF ${label} ${s}`, customerId: customer.id, status });
  const [active, hold, done] = await Promise.all([
    mk("active", "ACTIVE"),
    mk("hold", "ON_HOLD"),
    mk("done", "COMPLETED"),
  ]);
  return { customerId: customer.id, customerName, active: active.id, hold: hold.id, done: done.id };
}

const card = (page: Page, id: number) => page.locator(`a[href="/projects/${id}"]`);

test.describe("Projects status filter", () => {
  test("?status= narrows the list, combines with the customer, and survives a reload", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const s = await seed(apiBase(testInfo));
    await loginViaUi(page);

    await page.goto(`/projects?customerId=${s.customerId}`, { waitUntil: "networkidle" });
    for (const id of [s.active, s.hold, s.done]) await expect(card(page, id)).toBeVisible();

    await page.goto(`/projects?customerId=${s.customerId}&status=ACTIVE,ON_HOLD`, { waitUntil: "networkidle" });
    await expect(card(page, s.active)).toBeVisible();
    await expect(card(page, s.hold)).toBeVisible();
    await expect(card(page, s.done)).toHaveCount(0);
    await expect(page.getByText("2 projects", { exact: true })).toBeVisible();

    await page.reload({ waitUntil: "networkidle" });
    await expect(page).toHaveURL(/status=ACTIVE(,|%2C)ON_HOLD/);
    await expect(card(page, s.hold)).toBeVisible();
    await expect(card(page, s.done)).toHaveCount(0);

    // Unknown values are dropped silently.
    await page.goto(`/projects?customerId=${s.customerId}&status=BOGUS,COMPLETED`, { waitUntil: "networkidle" });
    await expect(card(page, s.done)).toBeVisible();
    await expect(card(page, s.active)).toHaveCount(0);
  });

  test("empty state names the filters and Clear filters restores the list", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const s = await seed(apiBase(testInfo));
    await loginViaUi(page);

    await page.goto(`/projects?customerId=${s.customerId}&status=CANCELLED`, { waitUntil: "networkidle" });
    await expect(
      page.getByText(`No projects match customer ${s.customerName} and status Cancelled.`),
    ).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).not.toHaveURL(/status=/);
    await expect(page).not.toHaveURL(/customerId=/);
    await expect(page.getByText(/No projects match/)).toHaveCount(0);

    // Several statuses are joined with "or" in the empty-state wording.
    await page.goto(`/projects?customerId=${s.customerId}&status=PLANNING,CANCELLED`, { waitUntil: "networkidle" });
    await expect(page.getByText(/No projects match customer .* and status Planning or Cancelled\./)).toBeVisible();
  });

  test("the Status chip picks several statuses and writes them to the URL", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const s = await seed(apiBase(testInfo));
    await loginViaUi(page);
    await page.goto(`/projects?customerId=${s.customerId}`, { waitUntil: "networkidle" });

    await page.getByRole("button", { name: "Filter", exact: true }).click();
    await page.getByRole("option", { name: "Status", exact: true }).click();
    await page.getByRole("option", { name: "Active", exact: true }).click();
    await expect(page).toHaveURL(/status=ACTIVE$/);
    // The first pick closes the menu and leaves a chip; its value button reopens the choices.
    await page.getByRole("button", { name: "Active", exact: true }).click();
    await page.getByRole("option", { name: "On hold", exact: true }).click();
    await page.keyboard.press("Escape");

    await expect(page).toHaveURL(/status=ACTIVE(,|%2C)ON_HOLD/);
    await expect(card(page, s.active)).toBeVisible();
    await expect(card(page, s.hold)).toBeVisible();
    await expect(card(page, s.done)).toHaveCount(0);

    // The filter is URL state: a reload keeps it.
    await page.reload({ waitUntil: "networkidle" });
    await expect(card(page, s.hold)).toBeVisible();
    await expect(card(page, s.done)).toHaveCount(0);
  });
});
