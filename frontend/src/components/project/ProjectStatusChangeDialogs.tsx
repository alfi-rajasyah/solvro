import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Modal } from "@/components/Modal";
import { FIELD_FOCUS } from "@/lib/utils";
import {
  createConfirmGate,
  dialogToShow,
  localHoldDays,
  parseShiftDays,
  plural,
} from "@/lib/projectStatusChange";
import {
  projectLifecyclePreviewOptions,
  type ProjectLifecyclePreview,
  type ProjectStatus,
} from "@/lib/queries";

/** What the caller must do with the user's answer. */
export interface StatusChangeDecision {
  /** false = the user backed out; do not save. */
  proceed: boolean;
  /** Send as `shiftOpenDatesByDays` on the same PATCH. */
  shiftOpenDatesByDays?: number;
  /** Save, then call `afterSave` so the project's timeline opens. */
  openTimelineAfter?: boolean;
}

type Pending =
  | { kind: "cancel"; preview: ProjectLifecyclePreview }
  | { kind: "reactivate"; preview: ProjectLifecyclePreview };

const DESKTOP_QUERY = "(min-width: 768px)";

/**
 * Shared by every place a project's status can be edited. Call
 * `confirm(from, to)` before the PATCH: it resolves straight away when the
 * change needs no dialog, otherwise it shows the cancel confirm or the
 * reactivation dialog and resolves with the user's answer. Render `dialogs`
 * once in the caller; `busy` is true while a dialog is open (callers use it to
 * ignore their own Escape / backdrop close).
 */
export function useProjectStatusChange(project: {
  id: number;
  onHoldSince: string | null;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [pending, setPending] = useState<Pending | null>(null);
  // True from the moment `confirm` starts fetching the preview until it settles.
  const [awaiting, setAwaiting] = useState(false);
  const [gate] = useState(createConfirmGate);
  const resolver = useRef<((d: StatusChangeDecision) => void) | null>(null);

  const settle = useCallback((decision: StatusChangeDecision) => {
    resolver.current?.(decision);
    resolver.current = null;
    gate.cancel();
    setPending(null);
  }, [gate]);

  /** The owning form closed: abandon whatever is in flight or on screen. */
  const cancel = useCallback(() => {
    resolver.current?.({ proceed: false });
    resolver.current = null;
    gate.cancel();
    setPending(null);
    setAwaiting(false);
  }, [gate]);

  const confirm = useCallback(
    async (from: ProjectStatus, to: ProjectStatus): Promise<StatusChangeDecision> => {
      // Cheap guard first: most edits are neither a cancel nor a reactivation.
      if (dialogToShow(from, to, { openTasks: 1, doneTasks: 0, pastDueOpenTasks: 1 }) === null) {
        return { proceed: true };
      }
      const token = gate.begin();
      // A confirm is already running (double-click on Save): ignore this one.
      if (token === null) return { proceed: false };
      setAwaiting(true);
      try {
        const preview = await qc.fetchQuery({
          ...projectLifecyclePreviewOptions(project.id),
          staleTime: 0,
        });
        // The form closed while the preview was loading: drop the answer.
        if (!gate.isCurrent(token)) return { proceed: false };
        const kind = dialogToShow(from, to, preview);
        if (kind === null) {
          gate.end(token);
          return { proceed: true };
        }
        return await new Promise<StatusChangeDecision>((resolve) => {
          resolver.current = resolve;
          setPending({ kind, preview });
        });
      } catch (err) {
        gate.end(token);
        throw err;
      } finally {
        // Not when a newer confirm has taken over after a cancel.
        if (gate.current() === null || gate.current() === token) setAwaiting(false);
      }
    },
    [qc, project.id, gate],
  );

  /** Opens the Gantt (the List on phones, where the Gantt is unavailable). */
  const afterSave = useCallback(
    (decision: StatusChangeDecision) => {
      if (!decision.openTimelineAfter) return;
      const desktop = window.matchMedia(DESKTOP_QUERY).matches;
      navigate(`/projects/${project.id}/${desktop ? "gantt" : "list"}`);
    },
    [navigate, project.id],
  );

  const dialogs: ReactNode = (
    <>
      <ConfirmModal
        open={pending?.kind === "cancel"}
        onClose={() => settle({ proceed: false })}
        onConfirm={() => settle({ proceed: true })}
        title="Cancel project and its open tasks?"
        body={
          pending?.kind === "cancel" ? (
            <p>
              {plural(pending.preview.openTasks, "open task", "open tasks")}{" "}
              will be marked Cancelled.{" "}
              {plural(pending.preview.doneTasks, "completed task", "completed tasks")}{" "}
              {pending.preview.doneTasks === 1 ? "stays" : "stay"} as{" "}
              {pending.preview.doneTasks === 1 ? "it is" : "they are"}. Reactivating the
              project later will not reopen them.
            </p>
          ) : null
        }
        confirmLabel="Cancel project"
        cancelLabel="Keep project"
        confirmTone="danger"
      />
      {pending?.kind === "reactivate" && (
        <ReactivationDialog
          preview={pending.preview}
          onHoldSince={pending.preview.onHoldSince ?? project.onHoldSince}
          onResolve={settle}
        />
      )}
    </>
  );

  return { confirm, cancel, afterSave, dialogs, busy: awaiting || pending !== null };
}

function ReactivationDialog({
  preview,
  onHoldSince,
  onResolve,
}: {
  preview: ProjectLifecyclePreview;
  onHoldSince: string | null;
  onResolve: (d: StatusChangeDecision) => void;
}) {
  // Local-time day count, not the server's `holdDays` (see localHoldDays).
  const holdDays = localHoldDays(onHoldSince, new Date());
  const [raw, setRaw] = useState(String(holdDays));
  const days = parseShiftDays(raw);
  const errorId = useId();

  return (
    <Modal
      open
      onClose={() => onResolve({ proceed: false })}
      title="Update the timeline?"
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => onResolve({ proceed: false })}
            className="rounded-sm border border-outline-variant px-4 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onResolve({ proceed: true, openTimelineAfter: true })}
            className="rounded-sm border border-outline-variant px-4 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-container"
          >
            I'll update the timeline myself
          </button>
          <button
            type="button"
            data-autofocus
            disabled={days === null}
            onClick={() =>
              days !== null && onResolve({ proceed: true, shiftOpenDatesByDays: days })
            }
            className="rounded-sm bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary/90 disabled:opacity-60"
          >
            Shift open dates by {days ?? "N"} {days === 1 ? "day" : "days"}
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-sm text-on-surface">
        <p>
          This project was on hold for {plural(holdDays, "day", "days")}.{" "}
          {plural(preview.pastDueOpenTasks, "open task", "open tasks")}{" "}
          {preview.pastDueOpenTasks === 1 ? "is" : "are"} now past due.
        </p>
        <label className="block">
          <span className="mb-1 block text-label-caps uppercase text-on-surface-variant">
            Days to shift open dates
          </span>
          <input
            type="number"
            min={1}
            max={3650}
            step={1}
            inputMode="numeric"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            aria-invalid={days === null}
            aria-describedby={days === null ? errorId : undefined}
            className={`w-28 rounded-sm border bg-surface-container-lowest px-3 py-2 text-sm text-on-surface ${FIELD_FOCUS} ${
              days === null ? "border-error" : "border-outline-variant"
            }`}
          />
          {days === null && (
            <span id={errorId} className="mt-1 block text-xs text-error">Enter a whole number from 1 to 3650.</span>
          )}
        </label>
      </div>
    </Modal>
  );
}
