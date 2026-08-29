// Weekly update block (spec §6.3 pin 7): one per customer, on the group's
// surface-container tone. Three states — Not started / Draft (editor) /
// Done — driven by `customer.weeklyUpdate` (null/NOT_STARTED = not
// started). Local draft state is keyed by `week.key` so Prev/Next week
// navigation never leaks text between weeks, and is only overwritten by a
// server refetch while the entry is untouched (`dirty: false`) — see the
// sync effect below.
import { useEffect, useState } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Badge, type BadgeProps } from "@/components/reui/badge";
import { ButtonGroup } from "@/components/ui/button-group";
import { Textarea } from "@/components/ui/textarea";
import { type DailyReviewCustomer, type WeeklyHealth, useSaveWeeklyUpdate } from "@/lib/queries";
import { weekNumberLabel } from "@/lib/dailyReviewStats";
import { draftWeeklyUpdate } from "@/lib/weeklyDraft";

type Mode = "not-started" | "editor" | "done";

interface LocalEntry {
  body: string;
  health: WeeklyHealth | null;
  mode: Mode;
  dirty: boolean;
  authorUsername: string | null;
  doneAt: string | null;
}

const DONE_AT_FMT = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

// Same reui/badge variants as CustomerDetail.tsx's `statusBadge` — kept in
// lockstep with that page's rendering of the same WeeklyStatus values.
const STATUS_BADGE: Record<Mode, { label: string; variant: BadgeProps["variant"] }> = {
  "not-started": { label: "Not started", variant: "outline" },
  editor: { label: "Draft", variant: "warning-light" },
  done: { label: "Done", variant: "success-light" },
};

const HEALTH_OPTIONS: { value: WeeklyHealth; label: string; className: string }[] = [
  { value: "GREEN", label: "Green", className: "bg-chip-emerald-bg text-chip-emerald-text" },
  { value: "AMBER", label: "Amber", className: "bg-chip-amber-bg text-chip-amber-text" },
  { value: "RED", label: "Red", className: "bg-chip-rose-bg text-chip-rose-text" },
];

function serverEntry(customer: DailyReviewCustomer): LocalEntry {
  const u = customer.weeklyUpdate;
  const mode: Mode = !u || u.status === "NOT_STARTED" ? "not-started" : u.status === "DONE" ? "done" : "editor";
  return {
    body: u?.body ?? "",
    health: u?.health ?? null,
    mode,
    dirty: false,
    authorUsername: u?.author.username ?? null,
    doneAt: u?.doneAt ?? null,
  };
}

export interface WeeklyUpdateBlockProps {
  customer: DailyReviewCustomer;
  week: { key: string; start: string; days: string[] };
}

export function WeeklyUpdateBlock({ customer, week }: WeeklyUpdateBlockProps) {
  const save = useSaveWeeklyUpdate(customer.id);
  const [entries, setEntries] = useState<Record<string, LocalEntry>>({});
  const [confirmRedraft, setConfirmRedraft] = useState(false);

  const entry = entries[week.key] ?? serverEntry(customer);

  // Sync from the server whenever its row changes for this week, UNLESS the
  // user has unsaved edits (`dirty`) — spec: "only overwrite local text if
  // the user has no unsaved edits". Runs on mount too (no entry yet).
  useEffect(() => {
    setEntries((prev) => {
      const cur = prev[week.key];
      if (cur?.dirty) return prev;
      const next = serverEntry(customer);
      if (
        cur &&
        cur.body === next.body &&
        cur.health === next.health &&
        cur.mode === next.mode &&
        cur.authorUsername === next.authorUsername &&
        cur.doneAt === next.doneAt
      ) {
        return prev;
      }
      return { ...prev, [week.key]: next };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    week.key,
    customer.weeklyUpdate?.status,
    customer.weeklyUpdate?.body,
    customer.weeklyUpdate?.health,
    customer.weeklyUpdate?.updatedAt,
  ]);

  function setLocal(patch: Partial<LocalEntry>, dirty = true) {
    setEntries((prev) => ({
      ...prev,
      [week.key]: { ...(prev[week.key] ?? serverEntry(customer)), ...patch, dirty },
    }));
  }

  function applySaved(saved: { body: string; health: WeeklyHealth | null; doneAt: string | null; author: { username: string } }, mode: Mode) {
    setEntries((prev) => ({
      ...prev,
      [week.key]: {
        body: saved.body,
        health: saved.health,
        mode,
        dirty: false,
        authorUsername: saved.author.username,
        doneAt: saved.doneAt,
      },
    }));
  }

  const projectNoteCount = customer.projects.reduce((sum, p) => sum + p.notes.length, 0);
  const operationsNoteCount = customer.operationsNotes.length;
  const noteCount = projectNoteCount + operationsNoteCount;

  function applyDraftFromNotes() {
    setLocal({ body: draftWeeklyUpdate(customer, week), mode: "editor" });
  }

  function draftFromNotes(confirmFirst: boolean) {
    if (confirmFirst) {
      setConfirmRedraft(true);
      return;
    }
    applyDraftFromNotes();
  }

  function saveDraft() {
    save.mutate(
      { weekStart: week.start, body: entry.body, health: entry.health, status: "DRAFT" },
      { onSuccess: (saved) => applySaved(saved, "editor") },
    );
  }

  function markDone() {
    save.mutate(
      { weekStart: week.start, body: entry.body, health: entry.health, status: "DONE" },
      { onSuccess: (saved) => applySaved(saved, "done") },
    );
  }

  function reopen() {
    save.mutate(
      { weekStart: week.start, body: entry.body, health: entry.health, status: "DRAFT" },
      { onSuccess: (saved) => applySaved(saved, "editor") },
    );
  }

  const trimmedBody = entry.body.trim();
  const badge = STATUS_BADGE[entry.mode];

  return (
    <section className="rounded-sm border border-outline-variant bg-surface-container p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-sm font-semibold text-on-surface">Weekly update</h3>
        <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
          Week {weekNumberLabel(week.key)} · {customer.name}
        </span>
        <Badge variant={badge.variant}>{badge.label}</Badge>
        <ButtonGroup role="radiogroup" aria-label="Health" className="ml-auto">
          {HEALTH_OPTIONS.map((h) => {
            const selected = entry.health === h.value;
            return (
              <button
                key={h.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setLocal({ health: h.value })}
                // Only editable once the draft editor is open — a health
                // click in "not-started" mode would mark the entry `dirty`
                // and block the server-sync effect above before there's
                // any draft to hold it (spec's "Draft from notes" gates
                // the whole editor open, health included).
                disabled={entry.mode !== "editor"}
                className={[
                  "rounded-sm border border-outline-variant px-2.5 py-1 text-[12px] font-semibold transition-colors focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60",
                  selected ? h.className : "bg-surface-container-lowest text-on-surface-variant hover:text-on-surface",
                ].join(" ")}
              >
                {h.label}
              </button>
            );
          })}
        </ButtonGroup>
      </div>

      {entry.mode === "not-started" && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-on-surface-variant">
            {noteCount} note{noteCount === 1 ? "" : "s"} this week ({projectNoteCount} project,{" "}
            {operationsNoteCount} operations)
          </p>
          <button
            type="button"
            onClick={() => draftFromNotes(false)}
            className="rounded-sm bg-primary px-3 py-1.5 font-display text-[12px] font-semibold text-on-primary hover:bg-primary-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            Draft from this week's notes
          </button>
        </div>
      )}

      {entry.mode === "editor" && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-on-surface-variant">
            Drafted from {noteCount} note{noteCount === 1 ? "" : "s"} ({projectNoteCount} project,{" "}
            {operationsNoteCount} operations) ·{" "}
            <button
              type="button"
              onClick={() => draftFromNotes(true)}
              className="font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              Re-draft from notes
            </button>
          </p>
          <Textarea
            value={entry.body}
            onChange={(e) => setLocal({ body: e.target.value })}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                saveDraft();
              }
            }}
            aria-label={`Weekly update for ${customer.name}`}
            className="min-h-[120px]"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-on-surface-variant">Shown on the customer page once done</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveDraft}
                disabled={save.isPending}
                className="rounded-sm border border-outline-variant px-3 py-1.5 font-display text-[12px] font-semibold text-on-surface-variant hover:bg-surface-container disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                Save draft
              </button>
              <button
                type="button"
                onClick={markDone}
                disabled={save.isPending || trimmedBody.length === 0 || entry.health === null}
                className="rounded-sm bg-primary px-3 py-1.5 font-display text-[12px] font-semibold text-on-primary hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                Mark done
              </button>
            </div>
          </div>
        </div>
      )}

      {entry.mode === "done" && (
        <div className="mt-3 space-y-2">
          <p className="whitespace-pre-wrap text-sm text-on-surface">{entry.body}</p>
          <p className="text-[11px] text-on-surface-variant">
            Done by {entry.authorUsername ?? "—"}
            {entry.doneAt ? ` · ${DONE_AT_FMT.format(new Date(entry.doneAt))}` : ""}
          </p>
          <button
            type="button"
            onClick={reopen}
            disabled={save.isPending}
            className="rounded-sm border border-outline-variant px-3 py-1.5 font-display text-[12px] font-semibold text-on-surface-variant hover:bg-surface-container disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            Reopen
          </button>
        </div>
      )}

      <ConfirmModal
        open={confirmRedraft}
        onClose={() => setConfirmRedraft(false)}
        onConfirm={() => {
          applyDraftFromNotes();
          setConfirmRedraft(false);
        }}
        title="Re-draft from notes"
        body="Replace the current draft text with a fresh draft from this week's notes?"
        confirmLabel="Re-draft"
        confirmTone="warning"
      />
    </section>
  );
}
