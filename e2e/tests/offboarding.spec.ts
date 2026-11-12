import { type Page } from "@playwright/test";
import { apiBase, expect, loginViaUi, test } from "../fixtures/test";
import { isoDateOffset, login } from "../fixtures/seed";
import {
  api,
  authHeaders,
  createCustomer,
  createProject,
  createUser,
  listTasks,
  uniqueStamp,
} from "../fixtures/lifecycle";

// Offboarding handover (spec F5, Admin > Users). The admin fixture user only
// signs in and clicks; every leaver, receiver, customer and project is a
// throwaway created here.

interface AdminUserRow {
  id: number;
  username: string;
  active: boolean;
}

async function userActive(base: string, adminToken: string, id: number): Promise<boolean> {
  const users = await api<AdminUserRow[]>(base, adminToken, "GET", "/admin/users");
  return users.find((u) => u.id === id)!.active;
}

async function deactivateButton(page: Page, username: string) {
  await page.goto("/admin", { waitUntil: "networkidle" });
  const row = page.getByRole("row").filter({ hasText: username });
  await expect(row).toBeVisible();
  return row.getByRole("button", { name: "Deactivate" });
}

const NOTE = "Leaving: please keep the weekly call.";

test.describe("Offboarding handover", () => {
  test("deactivating a user who holds nothing works as before", async ({ page }, testInfo) => {
    const base = apiBase(testInfo);
    const admin = await login(base);
    const leaver = await createUser(base, admin.token, "ob-empty");

    await loginViaUi(page);
    await (await deactivateButton(page, leaver.username)).click();
    await expect(page.getByTestId("handover-modal")).toHaveCount(0);
    await expect.poll(() => userActive(base, admin.token, leaver.id)).toBe(false);
    await expect(page.getByRole("row").filter({ hasText: leaver.username })).toContainText("Inactive");
  });

  test("the API refuses a plain deactivate while work is held (409 handover_required)", async ({}, testInfo) => {
    const base = apiBase(testInfo);
    const admin = await login(base);
    const s = uniqueStamp();
    const leaver = await createUser(base, admin.token, "ob-409");
    const customer = await createCustomer(base, admin.token, `Offboard 409 Co ${s}`);
    const project = await createProject(base, admin.token, {
      name: `Offboard 409 ${s}`,
      customerId: customer.id,
      tamId: leaver.id,
    });
    expect(project.id).toBeGreaterThan(0);

    const res = await fetch(`${base}/api/admin/users/${leaver.id}/deactivate`, {
      method: "PATCH",
      headers: authHeaders(admin.token),
      body: JSON.stringify({ active: false }),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code?: string }).code).toBe("handover_required");
    expect(await userActive(base, admin.token, leaver.id)).toBe(true);
  });

  test("a TAM with open tasks is handed over: TAM required, PENDING not offered, then deactivated", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const base = apiBase(testInfo);
    const admin = await login(base);
    const s = uniqueStamp();
    const leaver = await createUser(base, admin.token, "ob-leaver");
    const receiver = await createUser(base, admin.token, "ob-recv");
    const pending = await createUser(base, admin.token, "ob-pend", "PENDING");

    const customer = await createCustomer(base, admin.token, `Offboard Co ${s}`, leaver.id);
    const project = await createProject(base, admin.token, {
      name: `Offboard ${s}`,
      customerId: customer.id,
      tamId: leaver.id,
    });
    const mk = (title: string, body: Record<string, unknown>) =>
      api<{ id: number }>(base, admin.token, "POST", `/projects/${project.id}/tasks`, {
        title,
        dueDate: isoDateOffset(5),
        ...body,
      });
    const t1 = await mk("Hand one", { status: "TODO", assignedToId: leaver.id });
    const t2 = await mk("Hand two", { status: "IN_PROGRESS", assignedToId: leaver.id });
    const done = await mk("Already done", { status: "DONE", assignedToId: leaver.id });

    await loginViaUi(page);
    await (await deactivateButton(page, leaver.username)).click();

    const modal = page.getByTestId("handover-modal");
    await expect(modal).toBeVisible();
    await expect(page.getByRole("dialog", { name: `Hand over ${leaver.username}'s work` })).toBeVisible();
    const row = page.getByTestId(`handover-project-${project.id}`);
    await expect(row).toContainText(`Offboard ${s}`);
    await expect(row).toContainText("2 open tasks");
    await expect(row).toContainText(`${leaver.username} is TAM`);
    await expect(page.getByTestId(`handover-customer-${customer.id}`)).toBeVisible();

    // Submit is disabled until the TAM is chosen.
    const submit = page.getByTestId("handover-submit");
    await expect(submit).toBeDisabled();

    // A PENDING account is not offered; an active one is; the leaver is not.
    const tam = page.getByTestId(`handover-tam-${project.id}`);
    await expect(tam.locator("option", { hasText: receiver.username })).toHaveCount(1);
    await expect(tam.locator("option", { hasText: pending.username })).toHaveCount(0);
    await expect(tam.locator("option", { hasText: leaver.username })).toHaveCount(0);

    await tam.selectOption({ label: receiver.username });
    // Still disabled: every owned customer needs a new owner too.
    await expect(submit).toBeDisabled();
    await page.getByTestId(`handover-owner-${customer.id}`).selectOption({ label: receiver.username });
    await expect(submit).toBeEnabled();
    await page.getByTestId("handover-apply-all").selectOption({ label: receiver.username });
    await expect(page.getByTestId(`handover-assignee-${project.id}`)).toHaveValue(String(receiver.id));
    await page.getByTestId(`handover-note-${project.id}`).fill(NOTE);

    await submit.click();
    await expect(modal).toBeHidden();

    await expect.poll(() => userActive(base, admin.token, leaver.id)).toBe(false);
    const proj = await api<{ tamId: number }>(base, admin.token, "GET", `/projects/${project.id}`);
    expect(proj.tamId).toBe(receiver.id);
    const tasks = await listTasks(base, admin.token, project.id);
    const by = (id: number) => tasks.find((t) => t.id === id)!;
    expect(by(t1.id).assignedToId).toBe(receiver.id);
    expect(by(t2.id).assignedToId).toBe(receiver.id);
    expect(by(t1.id).status).toBe("TODO");
    expect(by(t2.id).status).toBe("IN_PROGRESS");
    // Closed work is history: it stays with the leaver.
    expect(by(done.id).assignedToId).toBe(leaver.id);
    const cust = await api<{ tamId: number | null }>(base, admin.token, "GET", `/customers/${customer.id}`);
    expect(cust.tamId).toBe(receiver.id);

    // The handover note is saved on the project.
    const notes = await api<{ body: string }[]>(
      base,
      admin.token,
      "GET",
      `/projects/${project.id}/notes`,
    );
    const saved = notes.filter((n) => n.body === NOTE);
    expect(saved).toHaveLength(1);

    await expect(page.getByRole("row").filter({ hasText: leaver.username })).toContainText("Inactive");
  });

  test("Cancel in the handover dialog leaves the user active and untouched", async ({ page }, testInfo) => {
    const base = apiBase(testInfo);
    const admin = await login(base);
    const s = uniqueStamp();
    const leaver = await createUser(base, admin.token, "ob-cancel");
    const customer = await createCustomer(base, admin.token, `Offboard Cancel Co ${s}`);
    const project = await createProject(base, admin.token, {
      name: `Offboard Cancel ${s}`,
      customerId: customer.id,
      tamId: leaver.id,
    });

    await loginViaUi(page);
    await (await deactivateButton(page, leaver.username)).click();
    await expect(page.getByTestId(`handover-project-${project.id}`)).toBeVisible();
    // Cancel lives in the dialog footer, outside the handover-modal body div.
    await page
      .getByRole("dialog", { name: `Hand over ${leaver.username}'s work` })
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await expect(page.getByTestId("handover-modal")).toBeHidden();
    expect(await userActive(base, admin.token, leaver.id)).toBe(true);
    const proj = await api<{ tamId: number }>(base, admin.token, "GET", `/projects/${project.id}`);
    expect(proj.tamId).toBe(leaver.id);
  });
});
