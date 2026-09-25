import { Chip, type Tone } from "@/components/StatusChip";
import { STAGE_LABELS, type PipelineStage } from "@/lib/pipelineFormat";

// docs/DESIGN.md's "Status chip tone table" — the 2026-09-25 flow redesign's
// 6-stage funnel (D2, D12): ASSESSMENT stays gray; TECHNICAL_CLARIFICATION,
// POC and RFP share the "in-motion" blue tone (PoC's column header carries
// the amber tone instead, per the spec's hand-off risk point — a
// board-container concern, not this chip's); DELIVER_PROPOSAL stays amber;
// WAITING_RESPONSE stays violet. Won, Lost, Cancelled and Hold no longer
// render through this chip at all — they moved to `OutcomeChip`/`TagChip`
// (`PipelineFlagChips.tsx`), which render ALONGSIDE StageChip rather than
// replacing it (D5: a closed or held deal keeps the stage it stalled in).
const STAGE_TONE: Record<PipelineStage, Tone> = {
  ASSESSMENT: "gray",
  TECHNICAL_CLARIFICATION: "blue",
  POC: "blue",
  RFP: "blue",
  DELIVER_PROPOSAL: "amber",
  WAITING_RESPONSE: "violet",
};

// Humanized stage text for non-chip surfaces that want the same mapping
// without rendering a full colored chip (mirrors StatusChip's
// projectStatusLabel export).
export function pipelineStageLabel(stage: PipelineStage): string {
  return STAGE_LABELS[stage];
}

export function StageChip({ stage }: { stage: PipelineStage }) {
  return <Chip tone={STAGE_TONE[stage]}>{STAGE_LABELS[stage]}</Chip>;
}
