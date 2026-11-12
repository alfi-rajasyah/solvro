import type { Prisma, PrismaClient } from "@prisma/client";
import {
  dayString,
  recordActivity,
  shortLabel,
  type ActivityAction,
  type ActivityChanges,
} from "./activity.js";

// Pipeline side of the activity log (docs/archive/plans/collaboration-and-sharing.md,
// extended to deals). A deal keeps TWO records on purpose:
//  - `OpportunityActivity`: the deal's permanent, human-readable timeline —
//    user notes plus short system sentences ("Closed as Won"). Untouched by
//    retention, rendered verbatim, carries historical Velora data.
//  - `ActivityEvent` (opportunity-scoped): the structured record — diff
//    payloads, actor, 180-day-independent, and the single anchor
//    notifications hang off.
// `recordOpportunityChange` is the one helper that writes both inside the
// caller's transaction, so they cannot drift.
//
// PRIVACY: like every `changes` payload, deal diffs hold short scalar values
// only — never the description, a note body, or a free-text close/skip
// reason (those stay in the OpportunityActivity sentence alone) and never a
// link URL.

type Tx = Prisma.TransactionClient | PrismaClient;

export type OpportunityEntityType = "opportunity" | "opportunity_note" | "opportunity_link";

export interface RecordOpportunityChangeInput {
  opportunityId: string;
  actorId: number | null;
  action: ActivityAction;
  /** Defaults to "opportunity". */
  entityType?: OpportunityEntityType;
  /** Deal title (or link label) at write time. */
  entityLabel: string;
  changes?: ActivityChanges | null;
  /**
   * The OpportunityActivity sentence(s) to write, authored by `actorId`, in
   * order. Omit when the change has no timeline sentence (a link edit, an import row) or
   * when the caller already wrote the row (a user's own note).
   */
  note?: string | readonly string[];
}

/**
 * Writes the timeline sentence(s) (when given), then the structured event, in
 * `tx`. Returns the event (null when an `updated` action has nothing to list
 * — see `recordActivity`) for `notifyForEvent`.
 */
export async function recordOpportunityChange(tx: Tx, input: RecordOpportunityChangeInput) {
  const notes = input.note === undefined ? [] : typeof input.note === "string" ? [input.note] : input.note;
  for (const note of notes) {
    await tx.opportunityActivity.create({
      data: { opportunityId: input.opportunityId, userId: input.actorId, note },
    });
  }
  return recordActivity(tx, {
    opportunityId: input.opportunityId,
    actorId: input.actorId,
    entityType: input.entityType ?? "opportunity",
    action: input.action,
    entityLabel: shortLabel(input.entityLabel),
    changes: input.changes,
  });
}

// ---------------------------------------------------------------------------
// Change computation (pure)
// ---------------------------------------------------------------------------

export interface OpportunitySnapshot {
  title: string;
  customerName: string;
  /** Prisma BigInt — converted with Number() before it enters `changes`. */
  dealValue: bigint;
  deadline: Date | null;
  requestDate: Date | null;
  description: string | null;
  productSolution: string;
  leadSource: string | null;
  winProbability: number;
  subStatus: string | null;
  statusTag: string | null;
  pic: { id: number; username: string } | null;
}

const fromTo = (from: unknown, to: unknown): Prisma.InputJsonValue =>
  ({ from, to }) as Prisma.InputJsonValue;

const pickPic = (pic: OpportunitySnapshot["pic"]) => (pic ? { id: pic.id, username: pic.username } : null);

/**
 * What changed between two states of a deal. `dealValue` is a BigInt column
 * and a JSON value cannot hold one, so it is reported as a plain number; the
 * description reports `{ changed: true }` only. Stage, outcome and the
 * lastActivityAt bookkeeping are not compared — they have their own events.
 */
export function diffOpportunityChanges(
  before: OpportunitySnapshot,
  after: OpportunitySnapshot,
): ActivityChanges {
  const changes: ActivityChanges = {};
  for (const field of [
    "title",
    "customerName",
    "productSolution",
    "leadSource",
    "winProbability",
    "subStatus",
    "statusTag",
  ] as const) {
    if (before[field] !== after[field]) changes[field] = fromTo(before[field], after[field]);
  }
  if (before.dealValue !== after.dealValue) {
    changes.dealValue = fromTo(Number(before.dealValue), Number(after.dealValue));
  }
  for (const field of ["deadline", "requestDate"] as const) {
    const from = dayString(before[field]);
    const to = dayString(after[field]);
    if (from !== to) changes[field] = fromTo(from, to);
  }
  if (before.description !== after.description) changes.description = { changed: true };
  if ((before.pic?.id ?? null) !== (after.pic?.id ?? null)) {
    changes.pic = fromTo(pickPic(before.pic), pickPic(after.pic));
  }
  return changes;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11-20" -> "20 Nov 2026", the app's day-first display form. */
const dayText = (day: string) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;
/** 650000000 -> "Rp 650.000.000", as the deal page shows it. */
const rupiahText = (n: number) => `Rp ${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

const FIELD_SENTENCES: ReadonlyArray<[field: string, label: string, text: (v: unknown) => string]> = [
  ["title", "title", (v) => `"${String(v)}"`],
  ["customerName", "customer", (v) => `"${String(v)}"`],
  ["dealValue", "value", (v) => rupiahText(Number(v))],
  ["winProbability", "win probability", (v) => `${Math.round(Number(v))}%`],
  ["deadline", "deadline", (v) => dayText(String(v))],
  ["requestDate", "request date", (v) => dayText(String(v))],
  ["leadSource", "lead source", (v) => `"${String(v)}"`],
];

/**
 * Timeline sentences for a deal's plain field edits, from
 * `diffOpportunityChanges` output: "Changed value from Rp 500.000.000 to
 * Rp 650.000.000", "Set deadline to 20 Nov 2026", "Cleared lead source". The
 * two long free-text fields report the edit without their text. Sub-status,
 * status tag and PIC are left out: their callers write their own sentences.
 * Deal edits are readable in the Activity timeline this way (user decision
 * 2026-11-12), not only in the structured change log.
 */
export function fieldChangeSentences(changes: ActivityChanges): string[] {
  const sentences: string[] = [];
  const empty = (v: unknown) => v === null || v === undefined || v === "";
  for (const [field, label, text] of FIELD_SENTENCES) {
    const change = changes[field] as { from: unknown; to: unknown } | undefined;
    if (!change) continue;
    if (empty(change.to)) sentences.push(`Cleared ${label}`);
    else if (empty(change.from)) sentences.push(`Set ${label} to ${text(change.to)}`);
    else sentences.push(`Changed ${label} from ${text(change.from)} to ${text(change.to)}`);
  }
  if (changes.productSolution) sentences.push("Updated the product solution");
  if (changes.description) sentences.push("Updated the description");
  return sentences;
}

/** Changes recorded for a freshly created deal. */
export function opportunityCreatedChanges(after: {
  stage: string;
  dealValue: bigint;
  pic: { id: number; username: string } | null;
}): ActivityChanges {
  const changes: ActivityChanges = { stage: after.stage, dealValue: Number(after.dealValue) };
  if (after.pic) changes.pic = pickPic(after.pic) as Prisma.InputJsonObject;
  return changes;
}
