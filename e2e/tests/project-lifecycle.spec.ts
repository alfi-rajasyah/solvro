import { type Page } from "@playwright/test";
import { apiBase, expect, loginViaUi, test } from "../fixtures/test";
import { isoDateOffset, login } from "../fixtures/seed";
import {
  api,
  createCustomer,
  createProject,
  createUser,
  daysBetween,
  listTasks,
  uniqueStamp,
  type ApiTask,
  type ThrowawayUser,
} from "../fixtures/lifecycle";

// Project lifecycle (spec F1 cancel cascade, F7 on-hold): every project and
// task is created here under a throwaway TAM, who is the only person that
// sees them, so the Overview counts are exact and no other spec is affected.

async function world(base: string) {
  const admin = await login(base);
  const s = uniqueStamp();
  const owner = await createUser(base, admin.token, "lc");
  const customer = await createCustomer(base, admin.token, `Lifecycle Co ${s}`, owner.id);
  async function project(label: string, status = "ACTIVE") {
    return createProject(base, admin.token, {
      name: `Lifecycle ${label} ${s}`,
      customerId: customer.id,
      tamId: owner.id,
      status,
    });
  }
  return { admin, owner, customer, project, stamp: s };
}

function task(base: string, owner: ThrowawayUser, projectId: number, body: Record<string, unknown>) {
  return api<ApiTask>(base, owner.token, "POST", `/projects/${projectId}/tasks`, body);
}

async function openEdit(page: Page, projectId: number) {
  await page.goto(`/projects/${projectId}`, { waitUntil: "networkidle" });
  // Edit is a header button from md up and a ⋯ menu item below it.
  if ((page.viewportSize()?.width ?? 0) >= 768) {
    await page.getByRole("button", { name: /^(edit )?Edit$/ }).click();
  } else {
    await page.getByRole("button", { name: "More project actions" }).click();
    await page.getByRole("menuitem", { name: "Edit project" }).click();
  }
  const form = page.getByRole("dialog", { name: "Edit project" });
  await expect(form).toBeVisible();
  return form;
}

async function setStatusAndSave(page: Page, projectId: number, label: string) {
  const form = await openEdit(page, projectId);
  await form.getByLabel("Status").selectOption({ label });
  await form.getByRole("button", { name: "Save changes" }).click();
  return form;
}

test.describe("Project lifecycle", () => {
  test("cancelling a project asks first; Keep project changes nothing", async ({ page }, testInfo) => {
    const base = apiBase(testInfo);
    const w = await world(base);
    const p = await w.project("keep");
    await task(base, w.owner, p.id, { title: "Open one", status: "TODO" });
    await task(base, w.owner, p.id, { title: "Open two", status: "IN_PROGRESS" });

    await loginViaUi(page, w.owner.email, w.owner.password);
    await setStatusAndSave(page, p.id, "Cancelled");

    const confirm = page.getByRole("dialog", { name: "Cancel project and its open tasks?" });
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText("2 open tasks will be marked Cancelled.");
    await expect(confirm).toContainText("0 completed tasks stay as they are.");
    await confirm.getByRole("button", { name: "Keep project" }).click();
    await expect(confirm).toBeHidden();

    const after = await api<{ status: string }>(base, w.owner.token, "GET", `/projects/${p.id}`);
    expect(after.status).toBe("ACTIVE");
    const tasks = await listTasks(base, w.owner.token, p.id);
    expect(tasks.map((t) => t.status).sort()).toEqual(["IN_PROGRESS", "TODO"]);
  });

  test("Cancel project cancels open tasks (subtasks too), keeps Done ones; reactivating reopens nothing", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const base = apiBase(testInfo);
    const w = await world(base);
    const p = await w.project("cancel");
    const parent = await task(base, w.owner, p.id, { title: "Parent", status: "TODO" });
    await task(base, w.owner, p.id, { title: "Child", parentTaskId: parent.id, status: "IN_PROGRESS" });
    await task(base, w.owner, p.id, { title: "Second", status: "TODO" });
    const done = await task(base, w.owner, p.id, { title: "Finished", status: "DONE" });

    await loginViaUi(page, w.owner.email, w.owner.password);
    await setStatusAndSave(page, p.id, "Cancelled");

    const confirm = page.getByRole("dialog", { name: "Cancel project and its open tasks?" });
    await expect(confirm).toContainText("3 open tasks will be marked Cancelled.");
    await expect(confirm).toContainText("1 completed task stays as it is.");
    await expect(confirm).toContainText("Reactivating the project later will not reopen them.");
    await confirm.getByRole("button", { name: "Cancel project" }).click();
    await expect(page.getByRole("dialog", { name: "Edit project" })).toBeHidden();

    await expect
      .poll(async () => (await api<{ status: string }>(base, w.owner.token, "GET", `/projects/${p.id}`)).status)
      .toBe("CANCELLED");
    let tasks = await listTasks(base, w.owner.token, p.id);
    for (const t of tasks) {
      expect(t.status, t.title).toBe(t.id === done.id ? "DONE" : "CANCELLED");
    }

    // Cancelling the project must not nudge "mark the project Completed?".
    const notes = await api<{ notifications: { reason: string }[] }>(base, w.owner.token, "GET", "/notifications");
    expect(notes.notifications.filter((n) => n.reason === "all_tasks_closed")).toHaveLength(0);

    // Reactivate: no dialog (nothing was on hold), tasks stay Cancelled.
    await setStatusAndSave(page, p.id, "Active");
    await expect(page.getByRole("dialog", { name: "Edit project" })).toBeHidden();
    await expect
      .poll(async () => (await api<{ status: string }>(base, w.owner.token, "GET", `/projects/${p.id}`)).status)
      .toBe("ACTIVE");
    tasks = await listTasks(base, w.owner.token, p.id);
    for (const t of tasks) expect(t.status, t.title).toBe(t.id === done.id ? "DONE" : "CANCELLED");
  });

  test("cancelling a project with no open tasks saves without a dialog", async ({ page }, testInfo) => {
    const base = apiBase(testInfo);
    const w = await world(base);
    const p = await w.project("empty");
    await task(base, w.owner, p.id, { title: "Already done", status: "DONE" });

    await loginViaUi(page, w.owner.email, w.owner.password);
    await setStatusAndSave(page, p.id, "Cancelled");
    await expect(page.getByRole("dialog", { name: "Edit project" })).toBeHidden();
    await expect(page.getByRole("dialog", { name: "Cancel project and its open tasks?" })).toHaveCount(0);
    await expect
      .poll(async () => (await api<{ status: string }>(base, w.owner.token, "GET", `/projects/${p.id}`)).status)
      .toBe("CANCELLED");
    const tasks = await listTasks(base, w.owner.token, p.id);
    expect(tasks[0]!.status).toBe("DONE");
  });

  test("an on-hold project's past-due tasks are not overdue anywhere", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const base = apiBase(testInfo);
    const w = await world(base);
    const p = await w.project("hold");
    const late = await task(base, w.owner, p.id, {
      title: "Late task",
      status: "TODO",
      startDate: isoDateOffset(-14),
      dueDate: isoDateOffset(-10),
    });
    // A past-due subtask: the Overview hint counts top-level tasks only, and the
    // list's default "Top-level only" filter must leave this row out too.
    const lateSub = await task(base, w.owner, p.id, {
      title: "Late subtask",
      status: "TODO",
      parentTaskId: late.id,
      startDate: isoDateOffset(-14),
      dueDate: isoDateOffset(-10),
    });

    await loginViaUi(page, w.owner.email, w.owner.password);

    // Control: while Active the task is overdue and painted so.
    await page.goto("/overview", { waitUntil: "networkidle" });
    await expect(page.getByRole("link", { name: "Overdue: 1 task" })).toBeVisible();
    await page.goto(`/tasks?customerId=${w.customer.id}`, { waitUntil: "networkidle" });
    const row = page.getByRole("row").filter({ hasText: late.title });
    await expect(row).toContainText("10d late");

    // Put the project on hold (no dialog for this transition).
    await setStatusAndSave(page, p.id, "On hold");
    await expect(page.getByRole("dialog", { name: "Edit project" })).toBeHidden();
    await expect
      .poll(async () => (await api<{ status: string }>(base, w.owner.token, "GET", `/projects/${p.id}`)).status)
      .toBe("ON_HOLD");

    await page.goto("/overview", { waitUntil: "networkidle" });
    await expect(page.getByRole("link", { name: "Overdue: 0 tasks" })).toBeVisible();
    await expect(page.getByText("1 in on-hold projects not counted")).toBeVisible();

    // The "On hold, past due" link lists the task the Overdue tile leaves out.
    const heldLink = page.getByRole("link", { name: "1 past-due task on hold" });
    await expect(heldLink).toHaveAttribute("href", "/tasks?view=on-hold-past-due");
    await heldLink.click();
    await expect(page).toHaveURL(/\/tasks\?view=on-hold-past-due/);
    await expect(page.getByRole("row").filter({ hasText: late.title })).toBeVisible();
    // The list row count equals the Overview link count (1), subtask excluded.
    await expect(page.getByRole("row").filter({ hasText: lateSub.title })).toHaveCount(0);
    await expect(page.getByRole("row").filter({ hasText: /Late (sub)?task/ })).toHaveCount(1);

    await page.goto(`/tasks?customerId=${w.customer.id}`, { waitUntil: "networkidle" });
    const heldRow = page.getByRole("row").filter({ hasText: late.title });
    await expect(heldRow).toBeVisible();
    await expect(heldRow).not.toContainText(/\dd late/i);

    await page.goto("/tasks?view=overdue", { waitUntil: "networkidle" });
    await expect(page.getByRole("row").filter({ hasText: late.title })).toHaveCount(0);

    // The project's Needs attention panel keeps the task, marked "On hold".
    await page.goto(`/projects/${p.id}/overview`, { waitUntil: "networkidle" });
    const attention = page.locator("section").filter({ hasText: "Needs attention" });
    const heldItem = attention.getByRole("link", { name: new RegExp(late.title) });
    await expect(heldItem).toBeVisible();
    await expect(heldItem).toContainText("On hold");
    await expect(heldItem).not.toContainText(/\dd overdue/);
  });

  test("reactivating with past-due tasks offers a shift: validation, Cancel, and shifting N days", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const base = apiBase(testInfo);
    const w = await world(base);
    const p = await w.project("shift", "ON_HOLD");
    const open = await task(base, w.owner, p.id, {
      title: "Open late",
      status: "TODO",
      startDate: isoDateOffset(-12),
      dueDate: isoDateOffset(-10),
    });
    const done = await task(base, w.owner, p.id, {
      title: "Done late",
      status: "DONE",
      startDate: isoDateOffset(-12),
      dueDate: isoDateOffset(-9),
    });

    await loginViaUi(page, w.owner.email, w.owner.password);
    await setStatusAndSave(page, p.id, "Active");

    const dialog = page.getByRole("dialog", { name: "Update the timeline?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("This project was on hold for");
    await expect(dialog).toContainText("1 open task is now past due.");

    const input = dialog.getByLabel("Days to shift open dates");
    // Prefilled with the hold length (minimum 1).
    await expect(input).toHaveValue("1");
    await input.fill("0");
    await expect(dialog.getByText("Enter a whole number from 1 to 3650.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^Shift open dates by/ })).toBeDisabled();
    await input.fill("3651");
    await expect(dialog.getByText("Enter a whole number from 1 to 3650.")).toBeVisible();

    // Cancel leaves the project on hold.
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeHidden();
    const held = await api<{ status: string }>(base, w.owner.token, "GET", `/projects/${p.id}`);
    expect(held.status).toBe("ON_HOLD");

    // Shift by 5.
    await page.getByRole("dialog", { name: "Edit project" }).getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Days to shift open dates").fill("5");
    await dialog.getByRole("button", { name: "Shift open dates by 5 days" }).click();
    await expect(page.getByRole("dialog", { name: "Edit project" })).toBeHidden();

    await expect
      .poll(async () => (await api<{ status: string }>(base, w.owner.token, "GET", `/projects/${p.id}`)).status)
      .toBe("ACTIVE");
    const tasks = await listTasks(base, w.owner.token, p.id);
    const o = tasks.find((t) => t.id === open.id)!;
    const d = tasks.find((t) => t.id === done.id)!;
    expect(daysBetween(open.startDate, o.startDate)).toBe(5);
    expect(daysBetween(open.dueDate, o.dueDate)).toBe(5);
    expect(daysBetween(done.startDate, d.startDate)).toBe(0);
    expect(daysBetween(done.dueDate, d.dueDate)).toBe(0);
    const proj = await api<{ onHoldSince: string | null }>(base, w.owner.token, "GET", `/projects/${p.id}`);
    expect(proj.onHoldSince).toBeNull();
  });

  test("'I'll update the timeline myself' saves the status and opens the timeline without shifting", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const base = apiBase(testInfo);
    const w = await world(base);
    const p = await w.project("self", "ON_HOLD");
    const open = await task(base, w.owner, p.id, {
      title: "Open late",
      status: "IN_PROGRESS",
      startDate: isoDateOffset(-12),
      dueDate: isoDateOffset(-10),
    });

    await loginViaUi(page, w.owner.email, w.owner.password);
    await setStatusAndSave(page, p.id, "Planning");
    const dialog = page.getByRole("dialog", { name: "Update the timeline?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "I'll update the timeline myself" }).click();

    // Gantt on desktop, List below 768px where the Gantt is unavailable.
    const mobile = testInfo.project.name === "mobile";
    await expect(page).toHaveURL(new RegExp(`/projects/${p.id}/${mobile ? "list" : "gantt"}$`));

    const proj = await api<{ status: string }>(base, w.owner.token, "GET", `/projects/${p.id}`);
    expect(proj.status).toBe("PLANNING");
    const tasks = await listTasks(base, w.owner.token, p.id);
    const o = tasks.find((t) => t.id === open.id)!;
    expect(daysBetween(open.startDate, o.startDate)).toBe(0);
    expect(daysBetween(open.dueDate, o.dueDate)).toBe(0);
  });

  test("reactivating with nothing past due saves without a dialog", async ({ page }, testInfo) => {
    const base = apiBase(testInfo);
    const w = await world(base);
    const p = await w.project("nodue", "ON_HOLD");
    await task(base, w.owner, p.id, { title: "Future", status: "TODO", dueDate: isoDateOffset(10) });

    await loginViaUi(page, w.owner.email, w.owner.password);
    await setStatusAndSave(page, p.id, "Active");
    await expect(page.getByRole("dialog", { name: "Edit project" })).toBeHidden();
    await expect(page.getByRole("dialog", { name: "Update the timeline?" })).toHaveCount(0);
    await expect
      .poll(async () => (await api<{ status: string }>(base, w.owner.token, "GET", `/projects/${p.id}`)).status)
      .toBe("ACTIVE");
  });
});
