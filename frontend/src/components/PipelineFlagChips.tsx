// The opportunity flow redesign's flag chips (docs/archive/plans/
// opportunity-flow-redesign.md §4.3, D12) — one small bespoke chip per
// independent attribute a deal now carries alongside its stage
// (`StageChip.tsx`): who owns the next move, whether the SA is waiting on
// the Sales team, a manual Hold/Delayed tag, an SLA idle alert, and (on a
// closed deal) the outcome. Bespoke on `Chip`/`CHIP_BASE` from
// `StatusChip.tsx` (docs/DESIGN.md's chip tint pairs) — CLAUDE.md's
// guardrail: never rebase these onto `reui/badge`.
// Every chip renders `null` when its condition doesn't hold, so a caller can
// unconditionally render the whole row (`OwnerChip`, `SubStatusChip`,
// `TagChip`, `IdleChip`) and only the applicable ones actually draw
// anything — mirrors `StageChip`'s own glyph convention
// (`<span class="material-symbols-outlined text-[13px]" aria-hidden="true">`).
// `SubStatusChip`/`IdleChip` are NOT independent, though: both would
// otherwise read the same `idle.days` count off the same "waiting" SLA
// clock (backend/src/lib/pipelineSla.ts's `computeIdle`) — see each chip's
// own doc comment for the resulting render split.
import { CHIP_BASE, Chip, type Tone } from "@/components/StatusChip";
import {
  OUTCOME_LABELS,
  OUTCOME_REASON_LABELS,
  SUB_STATUS_LABELS,
  TAG_LABELS,
  type IdleState,
  type PipelineOutcome,
  type PipelineOutcomeReason,
  type PipelineStatusTag,
  type PipelineSubStatus,
} from "@/lib/pipelineFormat";

function Glyph({ name }: { name: string }) {
  return (
    <span className="material-symbols-outlined text-[13px]" aria-hidden="true">
      {name}
    </span>
  );
}

// OwnerChip is the one flag chip the mockups render as an outline rather
// than a solid tone (D12/§4.3: "outlined chip 'Client'") — composes the
// shared `CHIP_BASE` sizing/type instead of a hand-copied second string.
const OWNER_CHIP_CLASS = `${CHIP_BASE} border border-outline-variant text-on-surface-variant`;

/**
 * "Client" outline chip — renders only while the deal's owner is the client
 * (`stage === "WAITING_RESPONSE"`, D3: `owner` is server-derived, never
 * stored). The other 5 stages imply "SA" by column position (D10), so this
 * renders nothing there by default; `showSa` (OpportunityDetail's header,
 * which always shows "Owner · SA / Client") renders the SA case too.
 */
export function OwnerChip({
  owner,
  showSa = false,
}: {
  owner: "sa" | "client";
  showSa?: boolean;
}) {
  if (owner === "sa" && !showSa) return null;
  return <span className={OWNER_CHIP_CLASS}>{owner === "client" ? "Client" : "SA"}</span>;
}

/**
 * "Waiting Sales input · N wd" — renders only for `WAITING_SALES_INPUT`. `N`
 * is `idle.days`, but only when the backend's own idle computation is
 * actually keyed off this waiting state (`idle.basis === "waiting"`) — a
 * fresh flag (`waitingInputSince` just set) can have `idle.basis ===
 * "waiting"` with `days` still 0, which renders "· 0 wd", matching the
 * backend's own `workingDaysBetween` semantics (same-day = 0) rather than
 * hiding the count until it's non-zero.
 *
 * Takes the tone from amber to rose once `idle.level === "critical"` — this
 * chip is the one that carries the day count for a waiting deal (see
 * `IdleChip`'s own comment: it deliberately renders nothing while `basis ===
 * "waiting"`, so the SLA breach still needs a visible signal somewhere).
 */
export function SubStatusChip({
  subStatus,
  idle,
}: {
  subStatus: PipelineSubStatus | null;
  idle: Pick<IdleState, "basis" | "days" | "level">;
}) {
  if (subStatus !== "WAITING_SALES_INPUT") return null;
  const suffix = idle.basis === "waiting" ? ` · ${idle.days} wd` : "";
  const tone: Tone = idle.level === "critical" ? "rose" : "amber";
  return (
    <Chip tone={tone}>
      <Glyph name="schedule" />
      {`${SUB_STATUS_LABELS.WAITING_SALES_INPUT}${suffix}`}
    </Chip>
  );
}

const TAG_TONE: Record<PipelineStatusTag, Tone> = {
  HOLD: "gray",
  DELAYED: "violet",
};
const TAG_ICON: Record<PipelineStatusTag, string> = {
  HOLD: "pause_circle",
  DELAYED: "event",
};

/** Manual Hold/Delayed tag — independent of stage and outcome (D2/D5): a
 * tagged deal keeps its place on the board. Renders nothing when untagged. */
export function TagChip({ tag }: { tag: PipelineStatusTag | null }) {
  if (tag === null) return null;
  return (
    <Chip tone={TAG_TONE[tag]}>
      <Glyph name={TAG_ICON[tag]} />
      {TAG_LABELS[tag]}
    </Chip>
  );
}

const IDLE_TONE: Record<Exclude<IdleState["level"], "none">, Tone> = {
  warning: "amber",
  critical: "rose",
};

/**
 * SLA idle alert — `computeIdle` (backend/src/lib/pipelineSla.ts) is the
 * sole source of `level`/`days`/`basis` (D1: computed on read, no client
 * math). Renders nothing at level "none", AND renders nothing while `basis
 * === "waiting"` — a waiting-on-Sales-input deal's day count already renders
 * on `SubStatusChip` ("Waiting Sales input · N wd", which itself takes the
 * amber->rose tone once `idle.level` is "critical"); rendering both chips
 * here would repeat the exact same day count in the same amber/rose family
 * right next to it.
 */
export function IdleChip({ idle }: { idle: Pick<IdleState, "basis" | "days" | "level"> }) {
  if (idle.level === "none" || idle.basis === "waiting") return null;
  return (
    <Chip tone={IDLE_TONE[idle.level]}>
      <Glyph name="warning" />
      {`Idle · ${idle.days} wd`}
    </Chip>
  );
}

const OUTCOME_TONE: Record<PipelineOutcome, Tone> = {
  WON: "emerald",
  LOST: "rose",
  CANCELLED: "gray",
  ARCHIVED: "gray",
};
const OUTCOME_ICON: Record<PipelineOutcome, string> = {
  WON: "check_circle",
  LOST: "cancel",
  CANCELLED: "block",
  ARCHIVED: "archive",
};

/** A closed deal's outcome (+ reason category, when one was given) — e.g.
 * "Lost · Competitor". Renders nothing on an open deal (`outcome === null`). */
export function OutcomeChip({
  outcome,
  reasonCategory,
}: {
  outcome: PipelineOutcome | null;
  reasonCategory: PipelineOutcomeReason | null;
}) {
  if (outcome === null) return null;
  const label = reasonCategory
    ? `${OUTCOME_LABELS[outcome]} · ${OUTCOME_REASON_LABELS[reasonCategory]}`
    : OUTCOME_LABELS[outcome];
  return (
    <Chip tone={OUTCOME_TONE[outcome]}>
      <Glyph name={OUTCOME_ICON[outcome]} />
      {label}
    </Chip>
  );
}
