import { STAGE_LABELS, type PipelineStage } from "@/lib/pipelineFormat";

type Tone = "emerald" | "amber" | "rose" | "violet" | "blue" | "gray";

const TONE_CLASS: Record<Tone, string> = {
  emerald: "bg-chip-emerald-bg text-chip-emerald-text",
  amber: "bg-chip-amber-bg text-chip-amber-text",
  rose: "bg-chip-rose-bg text-chip-rose-text",
  violet: "bg-chip-violet-bg text-chip-violet-text",
  blue: "bg-primary/10 text-primary dark:bg-primary/20",
  gray: "bg-surface-container-high text-on-surface-variant",
};

// PRD §2.2 "Stage chip tones" table: `poc` and `technical_clarification`
// share `rfp`'s "in-motion" blue tone row; `hold` gets its own amber row
// plus a `pause_circle` glyph (same icon PRD §2.2's Icons list and §2.3's
// held-card treatment use) to disambiguate it from `deliver_proposal`,
// which is also amber.
const STAGE_TONE: Record<PipelineStage, Tone> = {
  ASSESSMENT: "gray",
  RFP: "blue",
  POC: "blue",
  TECHNICAL_CLARIFICATION: "blue",
  DELIVER_PROPOSAL: "amber",
  WAITING_RESPONSE: "violet",
  WON: "emerald",
  DROP: "rose",
  HOLD: "amber",
};

// Humanized stage text for non-chip surfaces that want the same mapping
// without rendering a full colored chip (mirrors StatusChip's
// projectStatusLabel export).
export function pipelineStageLabel(stage: PipelineStage): string {
  return STAGE_LABELS[stage];
}

const CHIP_BASE =
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-display text-[11px] font-semibold leading-[18px]";

export function StageChip({ stage }: { stage: PipelineStage }) {
  return (
    <span className={`${CHIP_BASE} ${TONE_CLASS[STAGE_TONE[stage]]}`}>
      {stage === "HOLD" ? (
        <span className="material-symbols-outlined text-[13px]" aria-hidden="true">
          pause_circle
        </span>
      ) : null}
      {STAGE_LABELS[stage]}
    </span>
  );
}
