import type { Prisma, PrismaClient, TaskStatus } from "@prisma/client";
import { HttpError } from "../http/errors.js";

// A sibling list is the ordered set of tasks a `position` value is relative
// to. For top-level tasks (parentTaskId null) that's every task in the same
// project + status column. For subtasks it's simply "the parent's subtasks"
// — status does NOT partition a subtask list, since a subtask board isn't
// column-based the way the top-level Kanban is.
export interface SiblingKey {
  projectId: number;
  parentTaskId: number | null;
  // Only meaningful (and only used in the where-clause) when parentTaskId
  // is null.
  status: TaskStatus;
}

type Tx = Prisma.TransactionClient | PrismaClient;

function siblingWhere(key: SiblingKey): Prisma.TaskWhereInput {
  if (key.parentTaskId === null) {
    return { projectId: key.projectId, parentTaskId: null, status: key.status };
  }
  return { parentTaskId: key.parentTaskId };
}

export function siblingKeyEquals(a: SiblingKey, b: SiblingKey): boolean {
  if (a.parentTaskId !== b.parentTaskId) return false;
  if (a.parentTaskId === null) {
    return a.projectId === b.projectId && a.status === b.status;
  }
  return true;
}

/** Count of siblings in a list — used by "append at end" on create. */
export async function countSiblings(tx: Tx, key: SiblingKey): Promise<number> {
  return tx.task.count({ where: siblingWhere(key) });
}

/**
 * Remove `taskId` from its old sibling list, closing the gap left behind,
 * and re-pack the remaining siblings to dense 0..n-1 (ordered by their
 * current position, then id). Does nothing if the task isn't present in
 * that list (e.g. brand new task being created).
 */
async function closeGap(tx: Tx, key: SiblingKey, taskId: number): Promise<void> {
  const remaining = await tx.task.findMany({
    where: { ...siblingWhere(key), id: { not: taskId } },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  for (let i = 0; i < remaining.length; i++) {
    await tx.task.update({ where: { id: remaining[i].id }, data: { position: i } });
  }
}

/**
 * Insert `taskId` into the sibling list `key` at `requestedPosition`
 * (clamped to [0, len]), shifting existing members at/after that index up
 * by one slot, then re-packing the whole list to dense 0..n-1. `taskId` is
 * excluded from the "existing members" query so this works whether the task
 * already had a row in this exact list or not.
 *
 * Returns the final position assigned to `taskId`.
 */
async function insertAt(
  tx: Tx,
  key: SiblingKey,
  taskId: number,
  requestedPosition: number | undefined,
): Promise<number> {
  const others = await tx.task.findMany({
    where: { ...siblingWhere(key), id: { not: taskId } },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: { id: true },
  });

  const clamped =
    requestedPosition === undefined
      ? others.length
      : Math.max(0, Math.min(requestedPosition, others.length));

  const ordered = [...others.map((o) => o.id)];
  ordered.splice(clamped, 0, taskId);

  for (let i = 0; i < ordered.length; i++) {
    await tx.task.update({ where: { id: ordered[i] }, data: { position: i } });
  }

  return clamped;
}

/**
 * Move `taskId` from `oldKey` to `newKey` (which may be the same list) and
 * place it at `requestedPosition` (append to the end when omitted). Always
 * leaves both the old and new sibling lists densely packed (0..n-1).
 *
 * Must be called inside a `prisma.$transaction`.
 */
export async function moveTaskWithinSiblings(
  tx: Tx,
  taskId: number,
  oldKey: SiblingKey,
  newKey: SiblingKey,
  requestedPosition: number | undefined,
): Promise<number> {
  if (siblingKeyEquals(oldKey, newKey)) {
    // Same list: reorder in place. Exclude self, then re-insert at the
    // clamped target index — this both moves and re-packs in one pass.
    return insertAt(tx, newKey, taskId, requestedPosition);
  }

  // Cross-list move: close the gap in the old list first, then insert into
  // the new list. Order matters only in that both must happen in the same
  // transaction; the two lists never overlap in rows (a task can't be in
  // two sibling lists at once) so the sequence is safe either way.
  await closeGap(tx, oldKey, taskId);
  return insertAt(tx, newKey, taskId, requestedPosition);
}

/** Guard: max depth is 1 — a task cannot have a parent that itself has a parent. */
export async function assertValidParent(
  tx: Tx,
  projectId: number,
  taskId: number,
  parentTaskId: number,
): Promise<void> {
  if (parentTaskId === taskId) {
    throw new HttpError(400, "invalid_parent", "Task cannot be its own parent");
  }

  const parent = await tx.task.findUnique({
    where: { id: parentTaskId },
    select: { id: true, projectId: true, parentTaskId: true },
  });
  if (!parent || parent.projectId !== projectId) {
    throw new HttpError(400, "invalid_parent", "Parent task must belong to the same project");
  }
  if (parent.parentTaskId !== null) {
    throw new HttpError(
      400,
      "max_depth_exceeded",
      "Cannot set a parent that itself has a parent (max depth is 1)",
    );
  }

  const subtaskCount = await tx.task.count({ where: { parentTaskId: taskId } });
  if (subtaskCount > 0) {
    throw new HttpError(
      400,
      "max_depth_exceeded",
      "Cannot give a parent to a task that already has subtasks (max depth is 1)",
    );
  }
}

/**
 * Guard: a `sectionId` set on a task write must reference a section in the same
 * project. Without this, a `task:write` caller could connect their task to a
 * section id from a project they can't see — the task read-back then leaks that
 * section's name/color (cross-project IDOR). Mirrors assertValidParent's
 * same-project rule for parentTaskId. Returns a 404-free 400: the caller
 * already proved they can see the task/project, so this is a request error.
 */
export async function assertSectionInProject(
  tx: Tx,
  projectId: number,
  sectionId: number,
): Promise<void> {
  const section = await tx.section.findUnique({
    where: { id: sectionId },
    select: { projectId: true },
  });
  if (!section || section.projectId !== projectId) {
    throw new HttpError(400, "invalid_section", "Section must belong to the same project");
  }
}

/**
 * Guard: every `labelId` set on a task write must reference a label in the same
 * project. Same IDOR reasoning as assertSectionInProject — a foreign label id
 * would otherwise attach and leak its name/color on read-back.
 */
export async function assertLabelsInProject(
  tx: Tx,
  projectId: number,
  labelIds: number[],
): Promise<void> {
  const uniqueIds = [...new Set(labelIds)];
  if (uniqueIds.length === 0) return;
  const count = await tx.label.count({
    where: { id: { in: uniqueIds }, projectId },
  });
  if (count !== uniqueIds.length) {
    throw new HttpError(400, "invalid_label", "All labels must belong to the same project");
  }
}
