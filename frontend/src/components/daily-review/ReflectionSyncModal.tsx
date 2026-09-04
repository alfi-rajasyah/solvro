// Reflection sync modal (docs/plans/weekly-sync-tables.md §4 "Daily
// Review", T5): edits the Reflection half of a customer's WeeklyUpdate row
// — Weekly achievement, Outstanding issue, Lesson learned, Next week
// focus, Need manager decision — plus Health (can still be changed here if
// the week ended differently than Wednesday's read). Also owns the
// Draft/Done transition (D5: Done needs health + a non-blank achievement)
// and reopening a Done row back to Draft. Mounted only while open, same
// fresh-local-state rule as MidweekSyncModal.tsx.
import { useState, type KeyboardEvent } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Modal } from "@/components/Modal";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { Textarea } from "@/components/ui/textarea";
import { weekNumberLabel } from "@/lib/dailyReviewStats";
import { type DailyReviewCustomer, type WeeklyHealth, type WeeklyStatus, useSaveWeeklyUpdate } from "@/lib/queries";
import { draftWeeklyUpdate } from "@/lib/weeklyDraft";
import { HealthButtonGroup, SyncField } from "./SyncField";

interface DraftState {
  health: WeeklyHealth | null;
  achievement: string;
  outstandingIssue: string;
  lessonLearned: string;
  nextWeekFocus: string;
  managerDecision: string;
}

function initialState(customer: DailyReviewCustomer): DraftState {
  const u = customer.weeklyUpdate;
  return {
    health: u?.health ?? null,
    achievement: u?.achievement ?? "",
    outstandingIssue: u?.outstandingIssue ?? "",
    lessonLearned: u?.lessonLearned ?? "",
    nextWeekFocus: u?.nextWeekFocus ?? "",
    managerDecision: u?.managerDecision ?? "",
  };
}

export interface ReflectionSyncModalProps {
  customer: DailyReviewCustomer;
  week: { key: string; start: string; days: string[] };
  onClose: () => void;
}

export function ReflectionSyncModal({ customer, week, onClose }: ReflectionSyncModalProps) {
  const save = useSaveWeeklyUpdate(customer.id);
  const [state, setState] = useState<DraftState>(() => initialState(customer));
  const [confirmRedraft, setConfirmRedraft] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekNumber = weekNumberLabel(week.key);
  const isDone = customer.weeklyUpdate?.status === "DONE";
  const canMarkDone = state.health !== null && state.achievement.trim().length > 0;
  // Same requirement applies whether this is the first "Mark done" or a
  // later "Save" on an already-Done week (D5) — an already-Done row whose
  // health gets cleared or achievement gets blanked out here must not stay
  // saveable, or the server's 400 (weekly_update_incomplete) is the only
  // thing stopping it.
  const primaryDisabled = save.isPending || !canMarkDone;

  function patch(p: Partial<DraftState>) {
    setState((prev) => ({ ...prev, ...p }));
  }

  function applyDraft() {
    patch({ achievement: draftWeeklyUpdate(customer, week) });
  }

  function requestDraft() {
    if (state.achievement.trim().length > 0) {
      setConfirmRedraft(true);
    } else {
      applyDraft();
    }
  }

  function submit(status: WeeklyStatus) {
    setError(null);
    save.mutate(
      {
        weekStart: week.start,
        health: state.health,
        achievement: state.achievement,
        outstandingIssue: state.outstandingIssue,
        lessonLearned: state.lessonLearned,
        nextWeekFocus: state.nextWeekFocus,
        managerDecision: state.managerDecision,
        status,
      },
      {
        onSuccess: () => onClose(),
        onError: (e) => setError(e instanceof Error ? e.message : "Failed to save the reflection sync."),
      },
    );
  }

  function primarySubmit() {
    if (primaryDisabled) return;
    submit("DONE");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      primarySubmit();
    }
  }

  const fieldId = (name: string) => `reflection-${customer.id}-${name}`;

  // Modal.tsx registers one document-level Escape listener per open
  // instance with no stopPropagation, so a single Escape press would
  // otherwise close both the open ConfirmModal and this form underneath
  // it, discarding the edit. While either the redraft or reopen confirm is
  // open, make this form's own Escape/backdrop-close a no-op so only the
  // confirm closes.
  return (
    <Modal
      open
      onClose={save.isPending || confirmRedraft || confirmReopen ? () => {} : onClose}
      title={`Reflection sync — ${customer.name}, week ${weekNumber}`}
      widthClass="max-w-2xl"
      footer={
        isDone ? (
          <>
            <button
              type="button"
              onClick={onClose}
              disabled={save.isPending}
              className="rounded-lg border border-outline-variant px-4 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setConfirmReopen(true)}
              disabled={save.isPending}
              className="rounded-lg border border-outline-variant px-4 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
            >
              Reopen as draft
            </button>
            <button
              type="button"
              onClick={primarySubmit}
              disabled={primaryDisabled}
              className="rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-on-primary hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {save.isPending ? "Saving…" : "Save"}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onClose}
              disabled={save.isPending}
              className="rounded-lg border border-outline-variant px-4 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => submit("DRAFT")}
              disabled={save.isPending}
              className="rounded-lg border border-outline-variant px-4 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
            >
              Save draft
            </button>
            <button
              type="button"
              onClick={primarySubmit}
              disabled={primaryDisabled}
              className="rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-on-primary hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {save.isPending ? "Saving…" : "Mark done"}
            </button>
          </>
        )
      }
    >
      <>
        <div className="space-y-4" onKeyDown={handleKeyDown}>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div>
            <p className="mb-1 block font-display text-label-caps uppercase tracking-widest text-on-surface-variant">
              Health
            </p>
            <HealthButtonGroup value={state.health} onChange={(health) => patch({ health })} />
            <p className="mt-1 text-[12px] text-on-surface-variant">
              Set on Wednesday. Change it here if the week ended differently.
            </p>
          </div>

          <SyncField
            id={fieldId("achievement")}
            label={
              <>
                Weekly achievement <span className="text-primary">· required to mark done</span>
              </>
            }
            action={
              <button
                type="button"
                onClick={requestDraft}
                className="text-[12px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                Draft from this week's notes
              </button>
            }
          >
            <Textarea
              id={fieldId("achievement")}
              value={state.achievement}
              onChange={(e) => patch({ achievement: e.target.value })}
              aria-label={`Weekly achievement for ${customer.name}`}
              className="min-h-[88px]"
            />
          </SyncField>

          <SyncField id={fieldId("outstanding")} label="Outstanding issue">
            <Textarea
              id={fieldId("outstanding")}
              value={state.outstandingIssue}
              onChange={(e) => patch({ outstandingIssue: e.target.value })}
              aria-label={`Outstanding issue for ${customer.name}`}
            />
          </SyncField>

          <SyncField id={fieldId("lesson")} label="Lesson learned">
            <Textarea
              id={fieldId("lesson")}
              value={state.lessonLearned}
              onChange={(e) => patch({ lessonLearned: e.target.value })}
              aria-label={`Lesson learned for ${customer.name}`}
            />
          </SyncField>

          <SyncField id={fieldId("nextweek")} label="Next week focus">
            <Textarea
              id={fieldId("nextweek")}
              value={state.nextWeekFocus}
              onChange={(e) => patch({ nextWeekFocus: e.target.value })}
              aria-label={`Next week focus for ${customer.name}`}
            />
          </SyncField>

          <SyncField
            id={fieldId("decision")}
            label="Need manager decision"
            helper="Leave empty if no decision is needed. A filled row pins to the top of Monday's table."
          >
            <Textarea
              id={fieldId("decision")}
              value={state.managerDecision}
              onChange={(e) => patch({ managerDecision: e.target.value })}
              aria-label={`Need manager decision for ${customer.name}`}
            />
          </SyncField>
        </div>

        <ConfirmModal
          open={confirmRedraft}
          onClose={() => setConfirmRedraft(false)}
          onConfirm={() => {
            applyDraft();
            setConfirmRedraft(false);
          }}
          title="Draft from this week's notes"
          body="Replace the Weekly achievement with a draft from this week's notes?"
          confirmLabel="Draft"
          confirmTone="warning"
        />

        <ConfirmModal
          open={confirmReopen}
          onClose={() => setConfirmReopen(false)}
          onConfirm={() => {
            setConfirmReopen(false);
            submit("DRAFT");
          }}
          title="Reopen as draft"
          body="Reopen this week's reflection as a draft?"
          confirmLabel="Reopen"
          confirmTone="warning"
        />
      </>
    </Modal>
  );
}
