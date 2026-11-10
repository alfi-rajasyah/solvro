// Sentence and link for one in-app notification
// (docs/archive/plans/collaboration-and-sharing.md, C5b). Pure and total, like
// `activityText.ts`, whose event shapes and task-id rule it reuses. A
// notification is project-scoped (a task, a comment, a project role) or
// deal-scoped (a Pipeline opportunity); the deal phrases name the deal, the
// project phrases the task.
import { type ActivityPart, allTasksClosedParts, describeActivity, eventTaskId } from "@/lib/activityText";
import { OUTCOME_LABELS } from "@/lib/pipelineFormat";
import type { AppNotification } from "@/lib/queries";

export interface NotificationSentence {
  parts: ActivityPart[];
  /** The whole sentence as plain text. */
  text: string;
}

const REASON_PHRASE: Record<string, { before: string }> = {
  assigned: { before: "assigned you " },
  commented: { before: "commented on " },
  mentioned: { before: "mentioned you on " },
};

const DEAL_ENTITY_TYPES = new Set(["opportunity", "opportunity_note", "opportunity_link"]);

/** True for a notification about a Pipeline deal rather than a project. */
function isDealEvent(n: AppNotification): boolean {
  return DEAL_ENTITY_TYPES.has(n.event?.entityType) || (typeof n.opportunityId === "string" && n.projectId === null);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

function record(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function build(actor: string, segments: (string | { entity: string })[]): NotificationSentence {
  const parts: ActivityPart[] = [{ kind: "actor", text: actor }];
  for (const seg of segments) {
    parts.push(typeof seg === "string" ? { kind: "text", text: seg } : { kind: "entity", text: seg.entity });
  }
  return { parts, text: parts.map((p) => p.text).join("") };
}

/** The deal phrase for a deal-scoped notification, or null when it names no deal. */
function describeDealNotification(n: AppNotification, actor: string): NotificationSentence | null {
  const deal = str(n.opportunityTitle) ?? str(n.event.entityLabel);
  if (!deal) return null;
  const outcome = str(record(n.event.changes)?.outcome);
  switch (n.reason) {
    case "assigned":
      return build(actor, [" assigned you the deal ", { entity: deal }]);
    case "commented":
      return build(actor, [" added a note on ", { entity: deal }]);
    case "mentioned":
      return build(actor, [" mentioned you on ", { entity: deal }]);
    case "handed_off": {
      const name = str(record(record(n.event.changes)?.project)?.name);
      return build(actor, [" handed ", { entity: deal }, ...(name ? [" off to project ", { entity: name }] : [" off to a project"])]);
    }
    case "deal_closed": {
      const label = outcome
        ? Object.prototype.hasOwnProperty.call(OUTCOME_LABELS, outcome)
          ? OUTCOME_LABELS[outcome as keyof typeof OUTCOME_LABELS]
          : outcome
        : null;
      return build(actor, [" closed ", { entity: deal }, ...(label ? [` as ${label}`] : [])]);
    }
    default:
      return null;
  }
}

/** The user id a `tam` / `sa` payload points at: a bare id, `{ id }`, or an update's `{ from, to }` (the `to` side). */
function userIdOf(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  const r = record(v);
  if (!r) return null;
  if ("to" in r) return userIdOf(r.to);
  return typeof r.id === "number" && Number.isInteger(r.id) ? r.id : null;
}

/**
 * Which project role a "you now have a role" notification is about. The
 * payload carries `tam` and/or `sa`; the viewer's own id picks the matching
 * one (TAM wins a tie). Without a viewer id, an update naming only one role
 * reads as that role and anything else as TAM.
 */
function projectRole(changes: Record<string, unknown> | null, viewerId: number | null): "TAM" | "SA" {
  const tam = changes?.tam;
  const sa = changes?.sa;
  if (viewerId !== null) {
    if (userIdOf(tam) === viewerId) return "TAM";
    if (userIdOf(sa) === viewerId) return "SA";
  }
  return tam === undefined && sa !== undefined ? "SA" : "TAM";
}

/**
 * A project handoff, or a TAM/SA change on a project, names the project and the
 * role it gives you: "rina made you TAM of Acme rollout (from deal Acme)",
 * "rina made you SA of Acme rollout". A missing project name falls back to the
 * activity sentence.
 */
function describeProjectRoleNotification(
  n: AppNotification,
  actor: string,
  viewerId: number | null,
  canViewPipeline: boolean,
): NotificationSentence | null {
  const project = str(n.projectName) ?? str(n.event.entityLabel);
  if (!project) return null;
  const changes = record(n.event.changes);
  // The deal is named only for viewers who may open the Pipeline; the server
  // withholds it otherwise (`{ withheld: true }` has no title), this is the backstop.
  const dealTitle = canViewPipeline
    ? (str(record(changes?.fromOpportunity)?.title) ?? str(n.opportunityTitle))
    : null;
  return build(actor, [
    ` made you ${projectRole(changes, viewerId)} of `,
    { entity: project },
    ...(dealTitle ? [` (from deal ${dealTitle})`] : []),
  ]);
}

/**
 * `all_tasks_closed` reads "All tasks in <project> are closed — mark the
 * project Completed?" with no actor (the closer may be the recipient), and
 * `tasks_handed_over` reads "rina handed you 3 tasks and 1 epic in <project>"
 * (docs/archive/plans/feedback-round-lifecycle-spec.md, F3 and F5). Null when
 * the payload is too thin, so the caller falls back to the activity sentence.
 */
function describeLifecycleNotification(n: AppNotification, actor: string): NotificationSentence | null {
  const project = str(n.projectName) ?? str(n.event.entityLabel);
  const reason = n.reason;
  if (reason === "all_tasks_closed") {
    const parts = allTasksClosedParts(project);
    return { parts, text: parts.map((p) => p.text).join("") };
  }
  if (reason === "tasks_handed_over") {
    const h = record(record(n.event.changes)?.handover);
    const count = (v: unknown, noun: string): string | null =>
      typeof v === "number" && Number.isInteger(v) && v > 0 ? `${v} ${noun}${v === 1 ? "" : "s"}` : null;
    const what = [count(h?.tasks, "task"), count(h?.epics, "epic")].filter(Boolean).join(" and ");
    if (!project || !what) return null;
    return build(actor, [` handed you ${what} in `, { entity: project }]);
  }
  return null;
}

/** A project event whose notification is about a role, not a task. */
function isProjectRoleEvent(n: AppNotification): boolean {
  return n.event?.entityType === "project" && n.reason === "assigned";
}

/**
 * "rina assigned you Task", "rina commented on Task", "rina mentioned you on
 * Task"; for a deal "rina assigned you the deal X", "rina added a note on X",
 * "rina closed X as Lost"; for a project role "rina made you TAM of P (from
 * deal X)" / "rina made you SA of P". `viewerId` (the signed-in user) picks
 * TAM or SA when the event names both. An unknown reason, or no title to
 * name, falls back to the activity sentence for the underlying event.
 */
export function describeNotification(
  n: AppNotification,
  viewerId: number | null = null,
  canViewPipeline = true,
): NotificationSentence {
  const actor = n.event.actor?.username || "Someone";

  const lifecycle = describeLifecycleNotification(n, actor);
  if (lifecycle) return lifecycle;

  if (isProjectRoleEvent(n)) {
    const sentence = describeProjectRoleNotification(n, actor, viewerId, canViewPipeline);
    if (sentence) return sentence;
  } else if (isDealEvent(n)) {
    const sentence = describeDealNotification(n, actor);
    if (sentence) return sentence;
  }

  const phrase = Object.prototype.hasOwnProperty.call(REASON_PHRASE, n.reason)
    ? REASON_PHRASE[n.reason]
    : null;
  const label = typeof n.event?.entityLabel === "string" && n.event.entityLabel ? n.event.entityLabel : null;
  if (!phrase || !label || isDealEvent(n)) {
    const { parts, text } = describeActivity(n.event, { canViewPipeline });
    return { parts, text };
  }
  return build(actor, [` ${phrase.before}`, { entity: label }]);
}

/**
 * Where a notification leads: a deal's page for a deal event, else the task
 * panel when the task is known, else the project.
 */
export function notificationHref(n: AppNotification): string {
  if (isDealEvent(n) && n.opportunityId) return `/pipeline/${n.opportunityId}`;
  if (n.projectId === null) return n.opportunityId ? `/pipeline/${n.opportunityId}` : "/";
  const taskId = eventTaskId(n.event);
  return taskId !== null ? `/projects/${n.projectId}?task=${taskId}` : `/projects/${n.projectId}`;
}
