import type { Prisma, PrismaClient } from "@prisma/client";
import { countSiblings, type SiblingKey } from "./taskOrdering.js";

type Tx = Prisma.TransactionClient | PrismaClient;

export interface DuplicateOverrides {
  sectionId?: number | null;
}

// Fields carried verbatim from source to copy — decisions 1, 3, 5, 6 and the
// date half of decision 4 in docs/archive/plans/duplicate-tasks-sections.md §3.
// status always resets to TODO (decision 2) and baseline*Date always resets
// to null (decision 4) on every copy, top-level or subtask — never selected
// here since the copy never reads them. No TaskDependency row is ever
// created for a copy (decision 8); comments are never copied (decision 9) —
// this helper never touches the Comment or TaskDependency tables. itopTicketRef
// (docs/archive/plans/itop-integration.md Task 4.2) is likewise never
// selected/copied — a copy must not pin the same iTop ticket as its source.
// Duplication deliberately never adds ProjectMember rows (unlike assigning via
// the task routes): a copy must not re-grant a member who was removed.
// epicId IS carried verbatim (docs/archive/plans/epics-spec.md §4: "lib/duplicate.ts
// copies keep epicId") — same project, so no cross-project validation is
// needed here the way routes/tasks.ts and routes/projects.ts need it on a
// client-supplied epicId.
// Document links (TaskLink) ARE copied: each copy gets its own new rows with
// the same label and url (user decision 2026-11-12, after
// docs/archive/plans/task-links.md shipped with "not copied"). No activity
// event is written for a copied link; the duplicate itself is the event.
const TASK_SELECT = {
  id: true,
  projectId: true,
  title: true,
  description: true,
  priority: true,
  startDate: true,
  dueDate: true,
  isMilestone: true,
  isCriticalPath: true,
  assignedToId: true,
  sectionId: true,
  parentTaskId: true,
  epicId: true,
  labels: { select: { id: true } },
  links: {
    select: { label: true, url: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.TaskSelect;

type SourceTask = Prisma.TaskGetPayload<{ select: typeof TASK_SELECT }>;

interface PendingCopy {
  source: SourceTask;
  parentTaskId: number | null;
  sectionId: number | null;
  position: number;
}

// Inserts every pending copy in one INSERT and returns the new ids in the
// same order as `pending`. A multi-row INSERT's RETURNING order is not a
// documented guarantee, so the rows are matched back by (parent, position),
// which is unique within a sibling list.
async function insertCopies(tx: Tx, pending: PendingCopy[]): Promise<number[]> {
  if (pending.length === 0) return [];
  const created = await tx.task.createManyAndReturn({
    data: pending.map((p) => ({
      projectId: p.source.projectId,
      title: p.source.title,
      description: p.source.description,
      status: "TODO" as const,
      priority: p.source.priority,
      startDate: p.source.startDate,
      dueDate: p.source.dueDate,
      isMilestone: p.source.isMilestone,
      isCriticalPath: p.source.isCriticalPath,
      baselineStartDate: null,
      baselineDueDate: null,
      assignedToId: p.source.assignedToId,
      parentTaskId: p.parentTaskId,
      sectionId: p.sectionId,
      epicId: p.source.epicId,
      position: p.position,
    })),
    select: { id: true, parentTaskId: true, position: true },
  });
  const idByKey = new Map(created.map((c) => [`${c.parentTaskId ?? "top"}:${c.position}`, c.id]));
  const ids: number[] = [];
  for (const p of pending) {
    const id = idByKey.get(`${p.parentTaskId ?? "top"}:${p.position}`);
    if (id === undefined) throw new Error("duplicateTaskTree: a copied task was not returned");
    ids.push(id);
  }
  return ids;
}

// Labels and links of a whole batch of copies: one INSERT each.
async function copyLabelsAndLinks(tx: Tx, pending: PendingCopy[], newIds: number[]): Promise<void> {
  // Links inserted in one transaction would all get the same now(), and
  // TaskLink ids are UUIDs, so the list order (createdAt, then id) would come
  // out random. One millisecond apart per link keeps the source's order.
  const linkBase = Date.now();
  const links: Prisma.TaskLinkCreateManyInput[] = [];
  const labelTaskIds: number[] = [];
  const labelIds: number[] = [];
  pending.forEach((p, idx) => {
    p.source.links.forEach((l, i) => {
      links.push({
        taskId: newIds[idx]!,
        label: l.label,
        url: l.url,
        createdAt: new Date(linkBase + i),
      });
    });
    for (const label of p.source.labels) {
      labelTaskIds.push(newIds[idx]!);
      labelIds.push(label.id);
    }
  });
  if (links.length > 0) await tx.taskLink.createMany({ data: links });
  if (labelIds.length > 0) {
    // Implicit many-to-many join table (A = Label, B = Task).
    await tx.$executeRaw`
      INSERT INTO "_LabelToTask" ("A", "B")
      SELECT * FROM unnest(${labelIds}::int[], ${labelTaskIds}::int[])`;
  }
}

/**
 * Copies every task in `sourceIds` (in the given order) plus, for each one,
 * its own subtasks (in source `position` then `id` order) — the shared
 * engine behind `POST /tasks/:id/duplicate` and `POST /sections/:id/duplicate`.
 * Every copy: resets `status` to `TODO`, clears both baseline date columns,
 * connects the same labels as its source, gets new copies of its source's
 * document links (same label and url), and gets no `TaskDependency` rows
 * (dependencies are dropped; comments are never copied). A subtask source
 * naturally copies with no subtasks of its own — max depth is 1, so it has
 * none to find. Every top-level copy keeps its source's own `parentTaskId`
 * (null for a top-level source, the shared parent for a subtask source) —
 * there is no way to re-parent a copy under a *different* task here, which
 * would risk building a depth-2 tree with no `assertValidParent` guard.
 *
 * `overrides.sectionId`, when given, replaces `sectionId` on the copy of
 * each id listed directly in `sourceIds` — e.g. the section-duplicate route
 * passes `{ sectionId: newSectionId }` to land its tasks' copies in the new
 * section. A subtask copy follows its parent's override only if the subtask
 * shared its parent's original section (`subtask.sectionId ===
 * source.sectionId`); a subtask that carried a different (or no) section of
 * its own keeps that value untouched — mirrors the app's normal
 * parent-to-subtask section inheritance instead of forcing every subtask
 * into the new section regardless of its prior assignment.
 *
 * Each copy (top-level or subtask) is appended at the end of its destination
 * sibling list — placement within that list (e.g. moving a task copy to
 * right after the source via `insertManyAfter`, or a batch of section copies
 * to right after the source section's last task) is the caller's job.
 *
 * Statement budget: the reads are batched (one query for every source, one
 * for every subtask of those sources), the append position is counted ONCE
 * per destination sibling list (`countSiblings`) and then incremented in
 * memory — a brand-new parent's subtask list starts at 0 with no count at
 * all — and the copies go in as one batched INSERT per level (top-level
 * tasks, then all their subtasks), followed by one INSERT for every document
 * link and one for every label connection. So a section duplicate runs a
 * constant handful of statements however many tasks it holds, not one INSERT
 * per task and not a COUNT before every row. Throws if any id in `sourceIds` doesn't resolve
 * to an existing task.
 *
 * Must run inside a `prisma.$transaction`. Returns a Map from every copied
 * source id — the top-level ids in `sourceIds` AND their copied subtask ids
 * — to its new copy's id.
 */
export async function duplicateTaskTree(
  tx: Tx,
  sourceIds: number[],
  overrides?: DuplicateOverrides,
): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  if (sourceIds.length === 0) return result;

  const sources = await tx.task.findMany({
    where: { id: { in: sourceIds } },
    select: TASK_SELECT,
  });
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const missing = sourceIds.filter((id) => !sourceById.has(id));
  if (missing.length > 0) {
    throw new Error(`duplicateTaskTree: source task(s) not found: ${missing.join(", ")}`);
  }

  const allSubtasks = await tx.task.findMany({
    where: { parentTaskId: { in: sourceIds } },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: TASK_SELECT,
  });
  const subtasksByParent = new Map<number, SourceTask[]>();
  for (const subtask of allSubtasks) {
    // Guaranteed non-null: the query above matched on parentTaskId being one
    // of sourceIds (all numbers), so a row here can't have a null parent.
    const parentId = subtask.parentTaskId!;
    const list = subtasksByParent.get(parentId);
    if (list) list.push(subtask);
    else subtasksByParent.set(parentId, [subtask]);
  }

  // Next append position per destination sibling list, seeded lazily with
  // one COUNT the first time a list is hit (the section-duplicate case hits
  // exactly one: the project's top-level list).
  const nextPosition = new Map<string, number>();
  async function takePosition(key: SiblingKey): Promise<number> {
    const k = `${key.projectId}:${key.parentTaskId ?? "top"}`;
    let next = nextPosition.get(k);
    if (next === undefined) next = await countSiblings(tx, key);
    nextPosition.set(k, next + 1);
    return next;
  }

  // Level 1: every top-level copy in one INSERT, positions taken in order.
  const topPending: PendingCopy[] = [];
  for (const sourceId of sourceIds) {
    const source = sourceById.get(sourceId)!;
    topPending.push({
      source,
      parentTaskId: source.parentTaskId,
      sectionId: overrides?.sectionId !== undefined ? overrides.sectionId : source.sectionId,
      position: await takePosition({
        projectId: source.projectId,
        parentTaskId: source.parentTaskId,
      }),
    });
  }
  const topIds = await insertCopies(tx, topPending);
  topPending.forEach((p, i) => result.set(sourceIds[i]!, topIds[i]!));

  // Level 2: every subtask of every copy in one INSERT. The new parents were
  // created in this transaction and have no children, so each subtask list
  // starts at 0 — no COUNT needed.
  const subPending: PendingCopy[] = [];
  sourceIds.forEach((sourceId, i) => {
    const source = sourceById.get(sourceId)!;
    let subtaskPosition = 0;
    for (const subtask of subtasksByParent.get(sourceId) ?? []) {
      subPending.push({
        source: subtask,
        parentTaskId: topIds[i]!,
        sectionId:
          overrides?.sectionId !== undefined && subtask.sectionId === source.sectionId
            ? overrides.sectionId
            : subtask.sectionId,
        position: subtaskPosition++,
      });
    }
  });
  const subIds = await insertCopies(tx, subPending);
  subPending.forEach((p, i) => result.set(p.source.id, subIds[i]!));

  await copyLabelsAndLinks(tx, [...topPending, ...subPending], [...topIds, ...subIds]);

  return result;
}
