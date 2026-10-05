// Close deal dialog (docs/archive/plans/opportunity-flow-redesign.md §4.3, D5) — the
// single Close action for Won/Lost/Cancelled. The stage is never reset;
// POST /opportunities/:id/close locks it in place (backend §3.5). Radio
// cards + select + textarea conventions copied from AssignPicModal.tsx /
// OpportunityFormModal.tsx (label-caps span, input/select/textarea classes,
// inline ApiError). Radio cards are real `<input type="radio">` + `<label>`
// (accessibility requirement, not a styled `<div onClick>`).
import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "./Modal";
import { StageChip } from "./StageChip";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { ApiError } from "@/lib/api";
import {
  formatIDRCompact,
  OUTCOME_LABELS,
  OUTCOME_REASON_LABELS,
  REASONS_BY_OUTCOME,
  type PipelineOutcome,
  type PipelineOutcomeReason,
} from "@/lib/pipelineFormat";
import { useCloseOpportunity, type Opportunity } from "@/lib/queries";

interface Props {
  deal: Opportunity;
  open: boolean;
  onClose: () => void;
  onClosed: (updated: Opportunity) => void;
}

const OUTCOMES: PipelineOutcome[] = ["WON", "LOST", "CANCELLED"];

const OUTCOME_ICON: Record<PipelineOutcome, string> = {
  WON: "check_circle",
  LOST: "cancel",
  CANCELLED: "block",
};

export function CloseDealDialog({ deal, open, onClose, onClosed }: Props) {
  const close = useCloseOpportunity();

  const [outcome, setOutcome] = useState<PipelineOutcome>("WON");
  const [reasonCategory, setReasonCategory] = useState<PipelineOutcomeReason | "">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset to the dialog's defaults on the OPEN TRANSITION only — same
  // `[open]`-only-deps convention as AssignPicModal/OpportunityFormModal's
  // own reset effects (this repo has no exhaustive-deps lint to satisfy).
  useEffect(() => {
    if (!open) return;
    setOutcome("WON");
    setReasonCategory("");
    setNote("");
    setError(null);
  }, [open]);

  const reasons = REASONS_BY_OUTCOME[outcome];

  function selectOutcome(next: PipelineOutcome) {
    setOutcome(next);
    // A category picked for the previous outcome may not be valid for the
    // new one (LOST and CANCELLED's category lists only share "OTHER").
    setReasonCategory("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (outcome !== "WON" && reasonCategory === "") {
      setError("Pick a reason category.");
      return;
    }
    try {
      const updated = await close.mutateAsync({
        id: deal.id,
        outcome,
        reasonCategory: outcome === "WON" ? undefined : reasonCategory || undefined,
        reason: note.trim() || undefined,
      });
      onClosed(updated);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not close the deal.");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Close deal"
      widthClass="max-w-lg"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={close.isPending}
            className="rounded-lg border border-outline-variant px-4 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="close-deal-form"
            disabled={close.isPending}
            className={`rounded-lg px-4 py-1.5 text-xs font-bold disabled:opacity-60 ${
              outcome === "WON"
                ? "bg-primary text-on-primary hover:bg-primary/90"
                : "bg-error text-on-error hover:bg-error/90"
            }`}
          >
            {close.isPending ? "Closing…" : `Close as ${OUTCOME_LABELS[outcome]}`}
          </button>
        </>
      }
    >
      <form id="close-deal-form" onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-on-surface-variant">
          {deal.title} · {deal.customerName} · {formatIDRCompact(deal.dealValue)} · stays in{" "}
          <StageChip stage={deal.stage} />
        </p>

        <fieldset>
          <legend className="mb-1 block text-label-caps uppercase text-on-surface-variant">
            Outcome
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {OUTCOMES.map((o) => (
              <label
                key={o}
                className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border px-3 py-3 text-center text-xs font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/30 ${
                  outcome === o
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-outline-variant text-on-surface-variant hover:bg-surface-container"
                }`}
              >
                <input
                  type="radio"
                  name="outcome"
                  value={o}
                  checked={outcome === o}
                  onChange={() => selectOutcome(o)}
                  className="sr-only"
                />
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  {OUTCOME_ICON[o]}
                </span>
                {OUTCOME_LABELS[o]}
              </label>
            ))}
          </div>
        </fieldset>

        {outcome !== "WON" && (
          <label className="block">
            <span className="mb-1 block text-label-caps uppercase text-on-surface-variant">
              Reason category
              <span className="ml-1 text-error">*</span>
            </span>
            <select
              value={reasonCategory}
              onChange={(e) => setReasonCategory(e.target.value as PipelineOutcomeReason)}
              required
              className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              <option value="">Select a reason…</option>
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {OUTCOME_REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-label-caps uppercase text-on-surface-variant">
            Note (optional)
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={500}
            className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </label>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </form>
    </Modal>
  );
}
