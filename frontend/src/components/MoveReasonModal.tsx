// Skip-reason prompt for the one gated stage jump (docs/archive/plans/
// opportunity-flow-redesign.md §4.3, D4): Technical Clarification -> RFP, skipping PoC.
// Deliberately dumb — it only collects and returns the reason
// (`onConfirm(reason)`); the caller (the board's drag handler or the detail
// page's stage menu) performs the actual `POST /:id/move` and decides when
// to close this dialog, same split `AssignPicModal`/`CloseDealDialog` don't
// need since they own their own mutation end-to-end.
import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "./Modal";
import { STAGE_LABELS } from "@/lib/pipelineFormat";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called with the trimmed, non-empty reason — the caller performs the move. */
  onConfirm: (reason: string) => void;
  /** The deal's title, for the subtitle line. */
  dealTitle: string;
  /** True while the caller's own move request is in flight — disables the
   * form so a slow request can't be double-submitted. */
  busy?: boolean;
}

export function MoveReasonModal({ open, onClose, onConfirm, dealTitle, busy = false }: Props) {
  const [reason, setReason] = useState("");

  // Reset on the OPEN TRANSITION only — same `[open]`-only-deps convention
  // as the other Pipeline dialogs (AssignPicModal, CloseDealDialog).
  useEffect(() => {
    if (!open) return;
    setReason("");
  }, [open]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Move to RFP and skip PoC?"
      widthClass="max-w-md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-sm border border-outline-variant px-4 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="move-reason-form"
            disabled={busy || reason.trim() === ""}
            className="rounded-sm bg-primary px-4 py-1.5 text-xs font-bold text-on-primary hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? "Moving…" : "Move to RFP"}
          </button>
        </>
      }
    >
      <form id="move-reason-form" onSubmit={handleSubmit} className="space-y-3">
        <p className="text-sm text-on-surface-variant">
          {dealTitle} · {STAGE_LABELS.TECHNICAL_CLARIFICATION} → {STAGE_LABELS.RFP}
        </p>

        <label className="block">
          <span className="mb-1 block text-label-caps uppercase text-on-surface-variant">
            Reason for the skip
            <span className="ml-1 text-error">*</span>
          </span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            required
            autoFocus
            disabled={busy}
            className="w-full rounded-sm border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </label>

        <p className="text-xs text-on-surface-variant">Saved in the activity log</p>
      </form>
    </Modal>
  );
}
