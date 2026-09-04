// Mid-week sync modal (docs/plans/weekly-sync-tables.md §4 "Daily Review",
// T5): edits the Mid-week half of a customer's WeeklyUpdate row — Category,
// Highlight, Risk, Action — plus Health (Wednesday sets it; the Reflection
// modal can change it again on Friday). Never sends `status` (D12 — a
// Mid-week save must not reopen or otherwise touch a Done/Draft row's
// status). Mounted only while its WeeklySyncRow button is open
// (WeeklySyncRow.tsx), so local state below always starts fresh from
// `customer.weeklyUpdate` for the week being opened — never carried over
// from a previous open or a different week.
import { useState, type KeyboardEvent } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Modal } from "@/components/Modal";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { weekNumberLabel } from "@/lib/dailyReviewStats";
import { dayFromIso } from "@/lib/dateField";
import { weekKeyOf } from "@/lib/isoWeek";
import { type DailyReviewCustomer, type WeeklyHealth, useSaveWeeklyUpdate } from "@/lib/queries";
import { draftWeeklyUpdate } from "@/lib/weeklyDraft";
import { HealthButtonGroup, SyncField } from "./SyncField";

interface DraftState {
  health: WeeklyHealth | null;
  category: string;
  highlight: string;
  risk: string;
  action: string;
}

function initialState(customer: DailyReviewCustomer): DraftState {
  const u = customer.weeklyUpdate;
  return {
    health: u?.health ?? null,
    category: u?.category ?? "",
    highlight: u?.highlight ?? "",
    risk: u?.risk ?? "",
    action: u?.action ?? "",
  };
}

export interface MidweekSyncModalProps {
  customer: DailyReviewCustomer;
  week: { key: string; start: string; days: string[] };
  onClose: () => void;
}

export function MidweekSyncModal({ customer, week, onClose }: MidweekSyncModalProps) {
  const save = useSaveWeeklyUpdate(customer.id);
  const [state, setState] = useState<DraftState>(() => initialState(customer));
  const [confirmRedraft, setConfirmRedraft] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekNumber = weekNumberLabel(week.key);
  const carryOver = customer.previousWeeklyUpdate;
  const carryOverDay = carryOver ? dayFromIso(carryOver.weekStart) : null;
  const carryOverWeekNumber = carryOverDay ? weekNumberLabel(weekKeyOf(carryOverDay)) : null;

  function patch(p: Partial<DraftState>) {
    setState((prev) => ({ ...prev, ...p }));
  }

  function applyDraft() {
    patch({ highlight: draftWeeklyUpdate(customer, week, { throughDay: week.days[2] }) });
  }

  function requestDraft() {
    if (state.highlight.trim().length > 0) {
      setConfirmRedraft(true);
    } else {
      applyDraft();
    }
  }

  function submit() {
    setError(null);
    save.mutate(
      {
        weekStart: week.start,
        health: state.health,
        category: state.category,
        highlight: state.highlight,
        risk: state.risk,
        action: state.action,
      },
      {
        onSuccess: () => onClose(),
        onError: (e) => setError(e instanceof Error ? e.message : "Failed to save the mid-week sync."),
      },
    );
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  const fieldId = (name: string) => `midweek-${customer.id}-${name}`;

  // Modal.tsx registers one document-level Escape listener per open
  // instance with no stopPropagation, so a single Escape press would
  // otherwise close both the ConfirmModal and this form underneath it,
  // discarding the edit. While the redraft confirm is open, make this
  // form's own Escape/backdrop-close a no-op so only the confirm closes.
  return (
    <Modal
      open
      onClose={save.isPending || confirmRedraft ? () => {} : onClose}
      title={`Mid-week sync — ${customer.name}, week ${weekNumber}`}
      widthClass="max-w-2xl"
      footer={
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
            onClick={submit}
            disabled={save.isPending}
            className="rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-on-primary hover:bg-primary/90 disabled:opacity-60"
          >
            {save.isPending ? "Saving…" : "Save mid-week"}
          </button>
        </>
      }
    >
      <>
        <div className="space-y-4" onKeyDown={handleKeyDown}>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {carryOver && (
            <div className="rounded-sm border border-outline-variant bg-surface-container p-3">
              <p className="mb-2 font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                From last Friday · Week {carryOverWeekNumber}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[150px_1fr]">
                <span className="text-[12px] font-semibold text-on-surface-variant">Outstanding issue</span>
                <span className="text-sm text-on-surface">{carryOver.outstandingIssue || "None."}</span>
                <span className="text-[12px] font-semibold text-on-surface-variant">Next week focus</span>
                <span className="text-sm text-on-surface">{carryOver.nextWeekFocus || "None."}</span>
                <span className="text-[12px] font-semibold text-on-surface-variant">Manager decision</span>
                <span className="text-sm text-on-surface">{carryOver.managerDecision || "None."}</span>
              </div>
            </div>
          )}

          <div>
            <p className="mb-1 block font-display text-label-caps uppercase tracking-widest text-on-surface-variant">
              Health
            </p>
            <HealthButtonGroup value={state.health} onChange={(health) => patch({ health })} />
          </div>

          <SyncField id={fieldId("category")} label="Category" helper="One line. 120 characters max.">
            <Input
              id={fieldId("category")}
              value={state.category}
              onChange={(e) => patch({ category: e.target.value })}
              maxLength={120}
              aria-label={`Category for ${customer.name}`}
            />
          </SyncField>

          <SyncField
            id={fieldId("highlight")}
            label="Highlight"
            action={
              <button
                type="button"
                onClick={requestDraft}
                className="text-[12px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                Draft from Mon–Wed notes
              </button>
            }
          >
            <Textarea
              id={fieldId("highlight")}
              value={state.highlight}
              onChange={(e) => patch({ highlight: e.target.value })}
              aria-label={`Highlight for ${customer.name}`}
              className="min-h-[88px]"
            />
          </SyncField>

          <SyncField id={fieldId("risk")} label="Risk">
            <Textarea
              id={fieldId("risk")}
              value={state.risk}
              onChange={(e) => patch({ risk: e.target.value })}
              aria-label={`Risk for ${customer.name}`}
            />
          </SyncField>

          <SyncField id={fieldId("action")} label="Action">
            <Textarea
              id={fieldId("action")}
              value={state.action}
              onChange={(e) => patch({ action: e.target.value })}
              aria-label={`Action for ${customer.name}`}
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
          title="Draft from Mon–Wed notes"
          body="Replace the Highlight with a draft from this week's notes?"
          confirmLabel="Draft"
          confirmTone="warning"
        />
      </>
    </Modal>
  );
}
