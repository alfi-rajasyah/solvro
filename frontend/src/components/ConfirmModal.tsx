import type { ReactNode } from "react";
import { Modal } from "./Modal";

type Tone = "primary" | "warning" | "danger";

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  /** Label of the dismiss button; defaults to "Cancel". */
  cancelLabel?: string;
  confirmTone?: Tone;
  busy?: boolean;
  /** Keeps the confirm button disabled, for a dialog that needs input first. */
  confirmDisabled?: boolean;
  confirmTestId?: string;
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmTone = "primary",
  busy = false,
  confirmDisabled = false,
  confirmTestId,
}: ConfirmModalProps) {
  const confirmClass =
    confirmTone === "warning"
      ? "rounded-sm bg-warning-solid px-4 py-1.5 text-xs font-semibold text-on-warning hover:opacity-90 disabled:opacity-60"
      : confirmTone === "danger"
        ? "rounded-sm bg-error px-4 py-1.5 text-xs font-semibold text-on-error hover:bg-error/90 disabled:opacity-60"
        : "rounded-sm bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary/90 disabled:opacity-60";
  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={title}
      footer={
        <>
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            disabled={busy}
            className="rounded-sm border border-outline-variant px-4 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
            data-testid={confirmTestId}
            className={confirmClass}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-on-surface">{body}</div>
    </Modal>
  );
}
