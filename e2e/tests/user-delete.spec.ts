import { type Page } from "@playwright/test";
import { apiBase, expect, loginViaUi, test } from "../fixtures/test";
import { login } from "../fixtures/seed";
import { api, authHeaders, createCustomer, createUser, uniqueStamp } from "../fixtures/lifecycle";

// Admin > Users > Delete: a user who owns customers is deleted only together
// with a new owner for each of them (docs/archive/plans/user-delete-customer-owner.md).
// Every user and customer here is a throwaway created by this spec.

interface AdminUserRow {
  id: number;
}

async function userExists(base: string, adminToken: string, id: number): Promise<boolean> {
  const users = await api<AdminUserRow[]>(base, adminToken, "GET", "/admin/users");
  return users.some((u) => u.id === id);
}

async function openDelete(page: Page, username: string) {
  await page.goto("/admin", { waitUntil: "networkidle" });
  const row = page.getByRole("row").filter({ hasText: username });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("delete-user-modal")).toBeVisible();
}

test.describe("Delete user", () => {
  test("a user who owns no customers is deleted after a plain confirm", async ({ page }, testInfo) => {
    const base = apiBase(testInfo);
    const admin = await login(base);
    const target = await createUser(base, admin.token, "del-plain");

    await loginViaUi(page);
    await openDelete(page, target.username);
    await expect(page.getByTestId("delete-user-modal")).not.toContainText("Customers");
    await page.getByTestId("delete-user-confirm").click();
    await expect(page.getByTestId("delete-user-modal")).toHaveCount(0);
    await expect.poll(() => userExists(base, admin.token, target.id)).toBe(false);
  });

  test("the dialog asks for a new owner for each owned customer, then moves them", async ({ page }, testInfo) => {
    const base = apiBase(testInfo);
    const admin = await login(base);
    const s = uniqueStamp();
    const leaver = await createUser(base, admin.token, "del-owner");
    const receiver = await createUser(base, admin.token, "del-recv");
    const c1 = await createCustomer(base, admin.token, `Delete Owner A ${s}`, leaver.id);
    const c2 = await createCustomer(base, admin.token, `Delete Owner B ${s}`, leaver.id);

    await loginViaUi(page);
    await openDelete(page, leaver.username);
    const confirm = page.getByTestId("delete-user-confirm");
    await expect(confirm).toHaveText("Move customers and delete");
    await expect(confirm).toBeDisabled();

    await page.getByTestId(`delete-user-owner-${c1.id}`).selectOption({ label: receiver.username });
    await expect(confirm).toBeDisabled();
    await page.getByTestId(`delete-user-owner-${c2.id}`).selectOption({ label: receiver.username });
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page.getByTestId("delete-user-modal")).toHaveCount(0);
    await expect.poll(() => userExists(base, admin.token, leaver.id)).toBe(false);
    for (const c of [c1, c2]) {
      const cust = await api<{ tamId: number | null }>(base, admin.token, "GET", `/customers/${c.id}`);
      expect(cust.tamId).toBe(receiver.id);
    }
  });

  test("the API refuses a delete that leaves an owned customer without an owner", async ({}, testInfo) => {
    const base = apiBase(testInfo);
    const admin = await login(base);
    const leaver = await createUser(base, admin.token, "del-409");
    const customer = await createCustomer(base, admin.token, `Delete 409 Co ${uniqueStamp()}`, leaver.id);

    const res = await fetch(`${base}/api/admin/users/${leaver.id}`, {
      method: "DELETE",
      headers: authHeaders(admin.token),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string; details: { customers: { id: number }[] } };
    expect(body.code).toBe("customer_owner_required");
    expect(body.details.customers.map((c) => c.id)).toEqual([customer.id]);
    expect(await userExists(base, admin.token, leaver.id)).toBe(true);
  });
});
