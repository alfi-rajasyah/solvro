import { Prisma, type ProjectStatus } from "@prisma/client";
import { permissionsOf } from "../http/auth.js";
import { HttpError } from "../http/errors.js";
import { logger } from "../logger.js";
import { recordActivity, shortLabel, type ActivityChanges } from "./activity.js";
import { utcMidnightOf } from "./dateBoundary.js";
import { canUserSeePipeline, notifyForEvent } from "./notifications.js";
import { recordOpportunityChange } from "./opportunityActivity.js";
import { ALL_PIPELINE_STAGES, lockStages } from "./pipelineStageLock.js";
import { lockProject } from "./positionRepack.js";
import { ensureAssigneeIsMember } from "./projectMembers.js";
import { diffProjectSeats, projectSeatsSelect, recordSeatChangeNotes } from "./projectSeats.js";
import { OPEN_TASK_STATUS_FILTER } from "./taskStatus.js";
import { assertActiveUser } from "./users.js";

// Offboarding handover (docs/archive/plans/feedback-round-lifecycle-spec.md,
// F5): everything a leaving user holds is moved to chosen receivers inside one
// transaction before the account is deactivated.

type Tx = Prisma.TransactionClient;

/** A project whose TAM / SA seat is still "live" (the seat must be handed over). */
const CLOSED_PROJECT_STATUSES: ProjectStatus[] = ["COMPLETED", "CANCELLED"];

export interface HandoverProject {
  id: number;
  name: string;
  status: ProjectStatus;
  customerName: string | null;
  isTam: boolean;
  isSa: boolean;
  openTasks: number;
  openEpics: number;
}

export interface HandoverPreview {
  projects: HandoverProject[];
  customers: { id: number; name: string }[];
  openDeals: number;
}

export const isHandoverEmpty = (p: HandoverPreview): boolean =>
  p.projects.length === 0 && p.customers.length === 0 && p.openDeals === 0;

/**
 * What the user holds that must be handed over before deactivation. An open
 * deal is one with no outcome (`outcome === null`, the same test the
 * opportunity routes use for "closed"); an open task / epic is one whose
 * status is neither DONE nor CANCELLED.
 */
export async function computeHandoverPreview(tx: Tx, userId: number): Promise<HandoverPreview> {
  const openSeat = { notIn: CLOSED_PROJECT_STATUSES };
  const projects = await tx.project.findMany({
    where: {
      OR: [
        { tasks: { some: { assignedToId: userId, status: OPEN_TASK_STATUS_FILTER } } },
        { epics: { some: { ownerId: userId, status: OPEN_TASK_STATUS_FILTER } } },
        { tamId: userId, status: openSeat },
        { saId: userId, status: openSeat },
      ],
    },
    select: {
      id: true,
      name: true,
      status: true,
      tamId: true,
      saId: true,
      customer: { select: { name: true } },
    },
    orderBy: { id: "asc" },
  });
  const ids = projects.map((p) => p.id);
  const [taskCounts, epicCounts, customers, openDeals] = await Promise.all([
    ids.length === 0
      ? []
      : tx.task.groupBy({
          by: ["projectId"],
          where: { projectId: { in: ids }, assignedToId: userId, status: OPEN_TASK_STATUS_FILTER },
          _count: { _all: true },
        }),
    ids.length === 0
      ? []
      : tx.epic.groupBy({
          by: ["projectId"],
          where: { projectId: { in: ids }, ownerId: userId, status: OPEN_TASK_STATUS_FILTER },
          _count: { _all: true },
        }),
    tx.customer.findMany({
      where: { tamId: userId },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    }),
    tx.opportunity.count({ where: { picId: userId, outcome: null } }),
  ]);
  const tasksBy = new Map(taskCounts.map((r) => [r.projectId, r._count._all]));
  const epicsBy = new Map(epicCounts.map((r) => [r.projectId, r._count._all]));
  return {
    projects: projects.map((p) => {
      const live = !CLOSED_PROJECT_STATUSES.includes(p.status);
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        customerName: p.customer?.name ?? null,
        isTam: p.tamId === userId && live,
        isSa: p.saId === userId && live,
        openTasks: tasksBy.get(p.id) ?? 0,
        openEpics: epicsBy.get(p.id) ?? 0,
      };
    }),
    customers,
    openDeals,
  };
}

export interface OffboardInput {
  projects: {
    projectId: number;
    assignTasksTo: number | null;
    newTamId?: number;
    newSaId?: number | null;
    note?: string;
  }[];
  /** Every owned customer needs a new owner (docs/archive/plans/offboard-customer-owner.md). */
  customers: { customerId: number; newOwnerId: number }[];
  dealsPicId?: number | null;
}

/** A receiver must be another person: handing work back to the leaver is a no-op. */
function assertNotLeaver(id: number, leaverId: number, field: string): void {
  if (id === leaverId) {
    throw new HttpError(400, `${field}_not_found`, `The ${field} cannot be the user who is leaving`);
  }
}

/**
 * A receiver of handed-over work must be an active account whose role grants
 * at least one permission: a PENDING account (or any role with none) could
 * hold the work but not open it. Mirrors `handoverReceivers` in the frontend
 * (frontend/src/lib/handover.ts). A missing or inactive account keeps the
 * `<field>_not_found` code of `assertActiveUser`.
 */
async function assertReceiver(tx: Tx, id: number, field: string): Promise<void> {
  const user = await tx.user.findUnique({
    where: { id },
    select: { active: true, role: { select: { permissions: true } } },
  });
  if (!user || !user.active) {
    throw new HttpError(400, `${field}_not_found`, `The selected ${field} does not exist or is inactive`);
  }
  if (permissionsOf(user.role.permissions).length === 0) {
    throw new HttpError(
      400,
      `${field}_cannot_receive`,
      `The selected ${field} has no access yet, so cannot take over work. Give them a role first.`,
    );
  }
}

/**
 * Validates each distinct new owner once (not once per customer) and groups
 * the customers by the owner they move to, in ascending customer order. A
 * rejected owner is blamed on the first customer that named them.
 */
async function groupCustomersByNewOwner(
  tx: Tx,
  leaverId: number,
  rows: { customerId: number; newOwnerId: number }[],
): Promise<Map<number, number[]>> {
  const byOwner = new Map<number, number[]>();
  for (const { customerId, newOwnerId } of rows) {
    const group = byOwner.get(newOwnerId);
    if (group) {
      group.push(customerId);
      continue;
    }
    await withRow({ customerId }, async () => {
      assertNotLeaver(newOwnerId, leaverId, "owner");
      // Active, unlike PATCH /customers/:id (see the SA seat in `offboardUser`).
      await assertReceiver(tx, newOwnerId, "owner");
    });
    byOwner.set(newOwnerId, [customerId]);
  }
  return byOwner;
}

/** Runs `fn`; a 400 it throws without details gets `details` (the row the failure belongs to). */
async function withRow<T>(details: Record<string, number>, fn: () => Promise<T> | T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError && err.details === undefined) err.details = details;
    throw err;
  }
}

/** Postgres deadlock (40P01), as Prisma surfaces it: P2034 or a raw-query error carrying the code. */
function isDeadlock(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2034") return true;
    const meta = JSON.stringify(err.meta ?? {});
    if (meta.includes("40P01")) return true;
  }
  const message = err instanceof Error ? err.message : "";
  return message.includes("40P01") || message.includes("deadlock detected");
}

/**
 * Runs an offboard transaction, retrying once if Postgres reports a deadlock
 * (deal row locks can cross a concurrent stage re-pack). A second failure
 * propagates unchanged.
 */
export async function withDeadlockRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (!isDeadlock(err)) throw err;
    return run();
  }
}

/**
 * Hands over everything in the user's preview and deactivates the account, all
 * in the caller's transaction (a failure anywhere rolls the whole thing back).
 * Returns the deactivated user plus the customer-owner changes the caller logs
 * once the transaction has committed.
 */
export async function offboardUser(
  tx: Tx,
  input: { leaverId: number; actorId: number; body: OffboardInput },
): Promise<{
  user: { id: number; username: string; email: string; active: boolean };
  customerOwnerChanges: { customerId: number; from: number; to: number | null }[];
}> {
  const { leaverId, actorId, body } = input;
  const leaver = await tx.user.findUnique({
    where: { id: leaverId },
    select: { id: true, username: true },
  });
  if (!leaver) throw new HttpError(404, "user_not_found", "User not found");

  // Lock order: projects (ascending id) -> customers (ascending id) -> the
  // leaver's user row -> authoritative recompute -> deals (ascending id). The
  // project lock always precedes any row lock
  // (backend/CLAUDE.md, "Position re-packs take the project lock").
  const firstLook = await computeHandoverPreview(tx, leaverId);
  const lockIds = [
    ...new Set([...firstLook.projects.map((p) => p.id), ...body.projects.map((p) => p.projectId)]),
  ].sort((a, b) => a - b);
  for (const id of lockIds) await lockProject(tx, id);
  const customerLockIds = [
    ...new Set([...firstLook.customers.map((c) => c.id), ...body.customers.map((c) => c.customerId)]),
  ].sort((a, b) => a - b);
  if (customerLockIds.length > 0) {
    await tx.$queryRaw`SELECT id FROM customers WHERE id IN (${Prisma.join(customerLockIds)}) ORDER BY id FOR NO KEY UPDATE`;
  }
  // Any write that sets a foreign key to this user (a task assignment, a seat,
  // a customer owner, a deal PIC) takes FOR KEY SHARE on the row, so it either
  // commits before the recompute below (and is seen) or waits until after the
  // deactivation (where the active checks apply).
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${leaverId} FOR UPDATE`;

  // The authoritative preview, taken under the locks.
  const preview = await computeHandoverPreview(tx, leaverId);
  const byProject = new Map(body.projects.map((p) => [p.projectId, p]));
  const byCustomer = new Map(body.customers.map((c) => [c.customerId, c]));
  const missingProjects = preview.projects.filter((p) => !byProject.has(p.id)).map((p) => p.id);
  const missingCustomers = preview.customers.filter((c) => !byCustomer.has(c.id)).map((c) => c.id);
  if (missingProjects.length + missingCustomers.length > 0) {
    throw new HttpError(
      400,
      "handover_incomplete",
      "The handover does not cover everything this user still holds. Reload and try again.",
      { projectIds: missingProjects, customerIds: missingCustomers },
    );
  }

  const today = utcMidnightOf(new Date());

  // ---- Projects (ascending id) -------------------------------------------
  for (const row of preview.projects) {
    const choice = byProject.get(row.id)!;
    const receiverId = choice.assignTasksTo;
    const rowDetails = { projectId: row.id };
    if (receiverId !== null) {
      await withRow(rowDetails, async () => {
        assertNotLeaver(receiverId, leaverId, "assignee");
        await assertReceiver(tx, receiverId, "assignee");
      });
    }

    const before = await tx.project.findUniqueOrThrow({
      where: { id: row.id },
      select: { name: true, ...projectSeatsSelect },
    });

    // Seats: the TAM is mandatory where the leaver holds it; the SA seat is
    // replaced or cleared. Same validation as PATCH /projects/:id (a changed
    // TAM / SA must exist; an inactive SA is tolerated there, so here too).
    const seatData: Prisma.ProjectUpdateInput = {};
    if (row.isTam) {
      if (choice.newTamId === undefined) {
        throw new HttpError(400, "tam_required", `Choose a new TAM for "${row.name}"`, rowDetails);
      }
      const newTamId = choice.newTamId;
      await withRow(rowDetails, async () => {
        assertNotLeaver(newTamId, leaverId, "tam");
        await assertReceiver(tx, newTamId, "tam");
      });
      seatData.tam = { connect: { id: choice.newTamId } };
    }
    if (row.isSa) {
      const newSaId = choice.newSaId ?? null;
      if (newSaId === null) {
        seatData.sa = { disconnect: true };
      } else {
        await withRow(rowDetails, async () => {
          assertNotLeaver(newSaId, leaverId, "sa");
          // Active, unlike PATCH /projects/:id: a handover must not hand a
          // seat to another inactive account.
          await assertReceiver(tx, newSaId, "sa");
        });
        seatData.sa = { connect: { id: newSaId } };
      }
    }
    const changes: ActivityChanges = {};
    if (Object.keys(seatData).length > 0) {
      const after = await tx.project.update({ where: { id: row.id }, data: seatData });
      Object.assign(changes, await diffProjectSeats(tx, before, after));
      await recordSeatChangeNotes(tx, { projectId: row.id, actorId, changes, via: "Offboarding", noteDate: today });
    }

    const { count: tasks } = await tx.task.updateMany({
      where: { projectId: row.id, assignedToId: leaverId, status: OPEN_TASK_STATUS_FILTER },
      data: { assignedToId: receiverId },
    });
    const { count: epics } = await tx.epic.updateMany({
      where: { projectId: row.id, ownerId: leaverId, status: OPEN_TASK_STATUS_FILTER },
      data: { ownerId: receiverId },
    });

    // Receiver access exactly as a normal task assignment grants it, for the
    // work that actually moved; the seat change above comes first so a
    // receiver who became TAM / SA needs no member row.
    if (receiverId !== null && (tasks > 0 || epics > 0)) {
      const added = await withRow(rowDetails, () =>
        ensureAssigneeIsMember(tx, row.id, receiverId, actorId),
      );
      if (added) {
        await recordActivity(tx, {
          projectId: row.id,
          actorId,
          entityType: "member",
          entityId: receiverId,
          action: "added",
          entityLabel: added.username,
        });
      }
    }

    const note = choice.note?.trim();
    if (note) {
      await tx.projectNote.create({
        data: {
          projectId: row.id,
          authorId: actorId,
          body: note,
          noteDate: today,
        },
      });
    }

    if (tasks > 0 || epics > 0) {
      const to = receiverId === null ? null : await tx.user.findUnique({
        where: { id: receiverId },
        select: { username: true },
      });
      // Usernames and counts only — never the note body.
      changes.handover = {
        from: leaver.username,
        to: to?.username ?? null,
        tasks,
        ...(epics > 0 ? { epics } : {}),
      };
    }

    const event = await recordActivity(tx, {
      projectId: row.id,
      actorId,
      entityType: "project",
      entityId: row.id,
      action: "updated",
      entityLabel: shortLabel(before.name),
      changes,
    });
    await notifyForEvent(tx, event, { tasksHandedOverTo: tasks + epics > 0 ? receiverId : null });
  }

  // ---- Customers ---------------------------------------------------------
  const customerOwnerChanges: { customerId: number; from: number; to: number }[] = [];
  const ownerGroups = await groupCustomersByNewOwner(
    tx,
    leaverId,
    preview.customers.map((c) => ({ customerId: c.id, newOwnerId: byCustomer.get(c.id)!.newOwnerId })),
  );
  for (const [newOwnerId, customerIds] of ownerGroups) {
    await tx.customer.updateMany({ where: { id: { in: customerIds } }, data: { tamId: newOwnerId } });
    for (const customerId of customerIds) {
      customerOwnerChanges.push({ customerId, from: leaverId, to: newOwnerId });
    }
  }

  // ---- Pipeline deals ----------------------------------------------------
  const picId = body.dealsPicId ?? null;
  if (picId !== null) {
    assertNotLeaver(picId, leaverId, "pic");
    // The opportunity routes only require the PIC to exist; the handover also
    // requires an active account that can see the Pipeline (spec F5, 4c).
    await assertActiveUser(tx, picId, "pic");
    const receiver = await tx.user.findUniqueOrThrow({
      where: { id: picId },
      select: { role: { select: { permissions: true } } },
    });
    if (!canUserSeePipeline({ permissions: permissionsOf(receiver.role.permissions) })) {
      throw new HttpError(
        400,
        "pic_no_pipeline_access",
        "The selected user cannot access the Pipeline, so cannot be the PIC",
      );
    }
  }
  if (preview.openDeals > 0) {
    // Stage advisory locks first (sorted, all stages), then the deal row locks
    // in id order: this serialises with every stage re-pack (create, move,
    // delete), which takes the same locks before touching a row.
    await lockStages(tx, ...ALL_PIPELINE_STAGES);
    const dealIds = (
      await tx.opportunity.findMany({
        where: { picId: leaverId, outcome: null },
        select: { id: true },
        orderBy: { id: "asc" },
      })
    ).map((d) => d.id);
    if (dealIds.length > 0) {
      await tx.$queryRaw`SELECT id FROM opportunities WHERE id IN (${Prisma.join(dealIds)}) ORDER BY id FOR NO KEY UPDATE`;
    }
    const newPic =
      picId === null
        ? null
        : await tx.user.findUniqueOrThrow({ where: { id: picId }, select: { id: true, username: true } });
    for (const dealId of dealIds) {
      // Re-check under the lock: a deal closed or reassigned meanwhile stays put.
      const { count } = await tx.opportunity.updateMany({
        where: { id: dealId, picId: leaverId, outcome: null },
        data: { picId, lastActivityAt: new Date() },
      });
      if (count === 0) continue;
      const deal = await tx.opportunity.findUniqueOrThrow({
        where: { id: dealId },
        select: { title: true },
      });
      const event = await recordOpportunityChange(tx, {
        opportunityId: dealId,
        actorId,
        action: "assigned",
        entityLabel: deal.title,
        changes: {
          pic: {
            from: { id: leaver.id, username: leaver.username },
            to: newPic ? { id: newPic.id, username: newPic.username } : null,
          },
        },
        note: newPic ? `Assigned to ${newPic.username}` : "Unassigned",
      });
      await notifyForEvent(tx, event);
    }
  }

  // ---- Deactivate (same write as PATCH /admin/users/:id/deactivate) -------
  const user = await tx.user.update({
    where: { id: leaverId },
    data: { active: false },
    select: { id: true, username: true, email: true, active: true },
  });
  return { user, customerOwnerChanges };
}

/**
 * Locks the customers a user owns and the user's row, in the same order as
 * `offboardUser` (customers ascending, then the user), and returns the owned
 * customers as seen under the locks. A customer write that names this user as
 * owner takes FOR KEY SHARE on the user row, so the list cannot grow after
 * this returns.
 */
export async function lockOwnedCustomers(
  tx: Tx,
  userId: number,
  extraCustomerIds: number[],
): Promise<{ id: number; name: string }[]> {
  const firstLook = await tx.customer.findMany({ where: { tamId: userId }, select: { id: true } });
  const lockIds = [...new Set([...firstLook.map((c) => c.id), ...extraCustomerIds])].sort((a, b) => a - b);
  if (lockIds.length > 0) {
    await tx.$queryRaw`SELECT id FROM customers WHERE id IN (${Prisma.join(lockIds)}) ORDER BY id FOR NO KEY UPDATE`;
  }
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
  return tx.customer.findMany({
    where: { tamId: userId },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });
}

/**
 * Gives every customer the leaver owns a new, active owner before the leaver
 * is deleted: an unowned customer is claimable by any TAM, so a delete must
 * never leave one behind (docs/archive/plans/user-delete-customer-owner.md). Call after `lockOwnedCustomers`, in the
 * same transaction. Every owned customer must have a choice; choices for
 * customers the leaver no longer owns are ignored.
 */
export async function reassignOwnedCustomers(
  tx: Tx,
  input: {
    leaverId: number;
    owned: { id: number; name: string }[];
    choices: { customerId: number; newOwnerId: number }[];
  },
): Promise<{ customerId: number; from: number; to: number | null }[]> {
  const { leaverId, owned, choices } = input;
  const byCustomer = new Map(choices.map((c) => [c.customerId, c.newOwnerId]));
  const missing = owned.filter((c) => !byCustomer.has(c.id));
  if (missing.length > 0) {
    throw new HttpError(
      409,
      "customer_owner_required",
      `Choose a new owner for ${missing.length === 1 ? `"${missing[0].name}"` : `${missing.length} customers`} before you delete this user.`,
      { customers: missing },
    );
  }
  const changes: { customerId: number; from: number; to: number | null }[] = [];
  const ownerGroups = await groupCustomersByNewOwner(
    tx,
    leaverId,
    owned.map((c) => ({ customerId: c.id, newOwnerId: byCustomer.get(c.id)! })),
  );
  for (const [newOwnerId, customerIds] of ownerGroups) {
    try {
      await tx.customer.updateMany({ where: { id: { in: customerIds } }, data: { tamId: newOwnerId } });
    } catch (err) {
      // The new owner was deleted after the check above: blame the owner, not the leaver.
      if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2003" || err.code === "P2025")) {
        throw new HttpError(400, "owner_not_found", "The selected owner does not exist or is inactive", {
          customerId: customerIds[0],
        });
      }
      throw err;
    }
    for (const customerId of customerIds) changes.push({ customerId, from: leaverId, to: newOwnerId });
  }
  return changes;
}

/** Logs the customer owner changes the way PATCH /customers/:id does; call after commit. */
export function logCustomerOwnerChanges(
  actorId: number,
  changes: { customerId: number; from: number; to: number | null }[],
): void {
  for (const c of changes) {
    logger.info(
      { event: "customer.owner_changed", customerId: c.customerId, actorId, from: c.from, to: c.to },
      "customer owner changed",
    );
  }
}
