import type { ActivityEvent, Prisma, PrismaClient } from "@prisma/client";
import { hasPermission } from "../http/auth.js";
import { canUserSeeProject, type ProjectVisibilityFacts } from "./visibility.js";

// In-app notifications (docs/archive/plans/collaboration-and-sharing.md, C5b).
// `notifyForEvent` runs in the SAME transaction as the activity event that
// triggers it (call it with the row `recordActivity` returned), so a rolled-back
// write leaves neither an event nor a notification. Events are scoped to a
// project OR a Pipeline deal; recipients are filtered by the matching rule
// (can see the project / can see the Pipeline). In-app only.

type Tx = Prisma.TransactionClient | PrismaClient;

export type NotificationReason =
  | "assigned"
  | "commented"
  | "mentioned"
  | "deal_closed"
  | "handed_off"
  | "tasks_handed_over"
  | "all_tasks_closed";

export interface NotifyOptions {
  /**
   * `comment` events only: the task's CURRENT assignee (the comment route
   * already has the task row) — they get a `commented` notification.
   */
  taskAssigneeId?: number | null;
  /**
   * Hook for C5c (@mentions): ids the comment mentions. A mention wins over
   * `commented` for the same user (one notification per user per event), so
   * these are applied first. The candidates are still filtered by the same
   * actor / active / can-see-project rules below (in one batch).
   */
  mentionedUserIds?: readonly number[];
  /**
   * Pipeline events only: the deal's CURRENT PIC (the route has the updated
   * row). They hear about a note (`commented`), a close (`deal_closed`) and a
   * handoff (`handed_off`) done by someone else.
   */
  picId?: number | null;
  /**
   * Project `updated` events only: the user an offboarding handover moved the
   * leaver's tasks and/or epics to. One `tasks_handed_over` notification per event, so one
   * per receiver per project; a seat notification (`assigned`) wins for the
   * same user (docs/archive/plans/feedback-round-lifecycle-spec.md, F5).
   */
  tasksHandedOverTo?: number | null;
  /**
   * `all_tasks_closed` project events only: the project's TAM and members.
   * Each gets an `all_tasks_closed` notification.
   */
  allTasksClosedTo?: readonly number[];
  /**
   * Explicit opt-in: the actor is not skipped. Default off; only the
   * `all_tasks_closed` event sets it (the person who closed the last task is
   * told too). Applies to every reason added for that event.
   */
  includeActor?: boolean;
}

type IdLike = { id?: unknown } | null | undefined;

const idOf = (v: IdLike): number | null => (typeof v?.id === "number" ? v.id : null);

/** The user `changes.assignee.to` names on a task event, if any. */
function assigneeFromChanges(event: ActivityEvent): number | null {
  const changes = event.changes as { assignee?: { to?: IdLike } | null } | null;
  return idOf(changes?.assignee?.to);
}

/** The user `changes.pic.to` names on a deal event, if any (`created` carries the plain `pic`). */
function picFromChanges(event: ActivityEvent): number | null {
  const changes = event.changes as { pic?: { to?: IdLike; id?: unknown } | null } | null;
  if (event.action === "created") return idOf(changes?.pic);
  return idOf(changes?.pic?.to);
}

/**
 * The TAM / SA a project event hands the project to: `created` carries
 * `changes.tam` / `changes.sa` (`{ id, username }`), `updated` carries
 * `changes.tamId` / `changes.saId` as `{ from, to }` user ids (or `tam` /
 * `sa` as `{ from, to }` objects).
 */
function projectPeopleFromChanges(event: ActivityEvent): number[] {
  const changes = (event.changes ?? {}) as Record<string, unknown>;
  const ids: number[] = [];
  for (const key of ["tam", "sa"] as const) {
    const v = changes[key] as { to?: IdLike; id?: unknown } | null | undefined;
    const id = event.action === "created" ? idOf(v) : idOf(v?.to);
    if (id !== null) ids.push(id);
  }
  if (event.action === "updated") {
    for (const key of ["tamId", "saId"] as const) {
      const to = (changes[key] as { to?: unknown } | null | undefined)?.to;
      if (typeof to === "number") ids.push(to);
    }
  }
  return ids;
}

/**
 * Which of `userIds` are active users who can see `projectId`, in a fixed
 * number of queries (users + roles, then the project's TAM / customer owner /
 * candidate members) however many ids are passed. It loads the project's facts
 * and applies `canUserSeeProject` (lib/visibility.ts), the pure twin of
 * `projectVisibilityFilter`; test/notifications.test.ts compares the two.
 */
export async function filterActiveUsersWhoCanSeeProject(
  tx: Tx,
  projectId: number,
  userIds: readonly number[],
): Promise<Set<number>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Set();
  const [users, project] = await Promise.all([
    tx.user.findMany({
      where: { id: { in: ids }, active: true },
      select: { id: true, role: { select: { roleName: true, permissions: true } } },
    }),
    tx.project.findUnique({
      where: { id: projectId },
      select: {
        tamId: true,
        saId: true,
        customer: { select: { tamId: true } },
        members: { where: { userId: { in: ids } }, select: { userId: true } },
      },
    }),
  ]);
  const visible = new Set<number>();
  if (!project) return visible;
  const facts: ProjectVisibilityFacts = {
    tamId: project.tamId,
    saId: project.saId,
    customerTamId: project.customer?.tamId ?? null,
    memberIds: new Set(project.members.map((m) => m.userId)),
  };
  for (const u of users) {
    const permissions = Array.isArray(u.role.permissions)
      ? u.role.permissions.filter((p): p is string => typeof p === "string")
      : [];
    if (canUserSeeProject({ sub: u.id, role: u.role.roleName, permissions }, facts)) {
      visible.add(u.id);
    }
  }
  return visible;
}

/**
 * Pure twin of the Pipeline read gate: every Pipeline route is gated by
 * `pipeline:view` (or the `*` wildcard), and deal visibility is global for
 * its holders — there is no per-deal scoping.
 */
export function canUserSeePipeline(user: { permissions: string[] }): boolean {
  return hasPermission({ sub: 0, role: "", permissions: user.permissions }, "pipeline:view");
}

/**
 * Which of `userIds` are active users who hold `pipeline:view` (or `*`), in
 * one query however many ids are passed.
 */
export async function filterActiveUsersWhoCanSeeOpportunity(
  tx: Tx,
  userIds: readonly number[],
): Promise<Set<number>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Set();
  const users = await tx.user.findMany({
    where: { id: { in: ids }, active: true },
    select: { id: true, role: { select: { permissions: true } } },
  });
  const visible = new Set<number>();
  for (const u of users) {
    const permissions = Array.isArray(u.role.permissions)
      ? u.role.permissions.filter((p): p is string => typeof p === "string")
      : [];
    if (canUserSeePipeline({ permissions })) visible.add(u.id);
  }
  return visible;
}

/** The recipients an event notifies and why, before the actor / active / can-see filters. */
function reasonsForEvent(event: ActivityEvent, opts: NotifyOptions): Map<number, NotificationReason> {
  const reasons = new Map<number, NotificationReason>();
  const add = (userId: number | null | undefined, reason: NotificationReason) => {
    if (userId == null || (userId === event.actorId && !opts.includeActor) || reasons.has(userId)) return;
    reasons.set(userId, reason);
  };

  for (const userId of opts.mentionedUserIds ?? []) add(userId, "mentioned");
  if (event.opportunityId !== null) {
    if (
      event.entityType === "opportunity" &&
      (event.action === "created" || event.action === "updated" || event.action === "assigned")
    ) {
      add(picFromChanges(event), "assigned");
    }
    if (event.entityType === "opportunity" && event.action === "closed") add(opts.picId, "deal_closed");
    if (event.entityType === "opportunity" && event.action === "handed_off") add(opts.picId, "handed_off");
    if (event.entityType === "opportunity_note" && event.action === "created") add(opts.picId, "commented");
  } else {
    if (event.entityType === "task" && (event.action === "created" || event.action === "updated")) {
      add(assigneeFromChanges(event), "assigned");
    }
    if (event.entityType === "project" && (event.action === "created" || event.action === "updated")) {
      for (const userId of projectPeopleFromChanges(event)) add(userId, "assigned");
    }
    if (event.entityType === "project" && event.action === "updated") {
      add(opts.tasksHandedOverTo, "tasks_handed_over");
    }
    if (event.entityType === "project" && event.action === "all_tasks_closed") {
      for (const userId of opts.allTasksClosedTo ?? []) add(userId, "all_tasks_closed");
    }
    if (event.entityType === "comment" && event.action === "created") {
      add(opts.taskAssigneeId, "commented");
    }
  }
  return reasons;
}

/**
 * Creates the notifications an event triggers.
 *
 * Project-scoped events:
 *  - `assigned`: a task created or updated with an assignee (`changes.assignee.to`);
 *    a project event naming a new TAM / SA (a handoff-created project, a TAM
 *    or SA change);
 *  - `commented`: a comment on a task that has an assignee (`opts.taskAssigneeId`);
 *  - `mentioned`: `opts.mentionedUserIds` (C5c).
 * Deal-scoped events (Pipeline):
 *  - `assigned`: a deal created / updated / assigned with a PIC other than the actor;
 *  - `commented`: a note on the deal, to the PIC (`opts.picId`);
 *  - `deal_closed`: the deal closed, to the PIC;
 *  - `handed_off`: the deal handed off to a project, to the PIC;
 *  - `mentioned`: `opts.mentionedUserIds` (deal notes).
 * One notification per user per event (mention > assigned > the rest), never
 * the actor, never an inactive user or one who cannot see the project / the
 * Pipeline. Events recorded without calling this (task duplicates, bulk
 * imports, everything else) never notify. Returns the number of rows created.
 */
export async function notifyForEvent(
  tx: Tx,
  event: ActivityEvent | null,
  opts: NotifyOptions = {},
): Promise<number> {
  if (!event) return 0;
  const reasons = reasonsForEvent(event, opts);
  if (reasons.size === 0) return 0;
  const recipientIds = [...reasons.keys()];
  const eligible =
    event.projectId !== null
      ? await filterActiveUsersWhoCanSeeProject(tx, event.projectId, recipientIds)
      : await filterActiveUsersWhoCanSeeOpportunity(tx, recipientIds);
  const rows: Prisma.NotificationCreateManyInput[] = [];
  for (const [userId, reason] of reasons) {
    if (eligible.has(userId)) rows.push({ userId, activityEventId: event.id, reason });
  }
  if (rows.length === 0) return 0;
  const { count } = await tx.notification.createMany({ data: rows });
  return count;
}

/**
 * `notifyForEvent` for many project-scoped events at once, in a fixed number
 * of queries however many events there are (the offboarding handover writes one
 * event per project). The rules are the same: reasons come from
 * `reasonsForEvent`, and a recipient is kept only if they are an active user
 * who can see that event's project (`canUserSeeProject`). Events without a
 * project are ignored; use `notifyForEvent` for those.
 */
export async function notifyForProjectEvents(
  tx: Tx,
  items: { event: ActivityEvent | null; opts?: NotifyOptions }[],
): Promise<number> {
  const planned: { event: ActivityEvent; reasons: Map<number, NotificationReason> }[] = [];
  for (const { event, opts } of items) {
    if (!event || event.projectId === null) continue;
    const reasons = reasonsForEvent(event, opts ?? {});
    if (reasons.size > 0) planned.push({ event, reasons });
  }
  if (planned.length === 0) return 0;
  const userIds = [...new Set(planned.flatMap((p) => [...p.reasons.keys()]))];
  const projectIds = [...new Set(planned.map((p) => p.event.projectId as number))];
  const [users, projects] = await Promise.all([
    tx.user.findMany({
      where: { id: { in: userIds }, active: true },
      select: { id: true, role: { select: { roleName: true, permissions: true } } },
    }),
    tx.project.findMany({
      where: { id: { in: projectIds } },
      select: {
        id: true,
        tamId: true,
        saId: true,
        customer: { select: { tamId: true } },
        members: { where: { userId: { in: userIds } }, select: { userId: true } },
      },
    }),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const rows: Prisma.NotificationCreateManyInput[] = [];
  for (const { event, reasons } of planned) {
    const project = projectById.get(event.projectId as number);
    if (!project) continue;
    const facts: ProjectVisibilityFacts = {
      tamId: project.tamId,
      saId: project.saId,
      customerTamId: project.customer?.tamId ?? null,
      memberIds: new Set(project.members.map((m) => m.userId)),
    };
    for (const [userId, reason] of reasons) {
      const u = userById.get(userId);
      if (!u) continue;
      const permissions = Array.isArray(u.role.permissions)
        ? u.role.permissions.filter((p): p is string => typeof p === "string")
        : [];
      if (canUserSeeProject({ sub: u.id, role: u.role.roleName, permissions }, facts)) {
        rows.push({ userId, activityEventId: event.id, reason });
      }
    }
  }
  if (rows.length === 0) return 0;
  const { count } = await tx.notification.createMany({ data: rows });
  return count;
}
