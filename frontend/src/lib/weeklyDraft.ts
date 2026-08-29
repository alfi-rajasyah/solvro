// Drafts a customer's weekly update body from the week's daily notes
// (daily-review-v2-spec.md §6.2). Pure function — no React, no network —
// so `DailyReview.tsx`'s "Draft from this week's notes" / "Re-draft" actions
// (T6) can call it directly and the Vitest suite below can exercise it in
// isolation.
import { dayFromIso } from "./dateField";
import type { DailyReviewCustomer, DailyReviewNote, DailyReviewOpsNote } from "./queries";

const WEEKDAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Mon 24" — weekday abbreviation + day-of-month, derived in UTC from a "yyyy-MM-dd" day string. */
function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  return `${WEEKDAY_ABBR[d.getUTCDay()]} ${d.getUTCDate()}`;
}

/**
 * Groups `notes` by calendar day, each day's bucket sorted `(noteDate, id)`
 * ascending — the same tiebreak the backend's own `orderBy` uses
 * (`routes/dailyReview.ts`), so bucket order is deterministic regardless of
 * the order notes arrive in.
 *
 * `note.noteDate` is a `@db.Date` column and arrives over the wire as an
 * ISO instant (`"2026-08-24T00:00:00.000Z"`, see `backend/test/
 * projectReviews.test.ts`), NOT a bare "yyyy-MM-dd" day string — grouping on
 * the raw value would never match `week.days`' bare day strings in
 * `buildDayRows` below. `dayFromIso` extracts the calendar day for the map
 * key (it also accepts an already-bare day string unchanged, since it just
 * reads the first 10 characters — so a caller passing either shape groups
 * correctly); the full instant string is still what's compared for
 * ordering, since same-format ISO instants sort identically to their date
 * parts (all `T00:00:00.000Z`-suffixed).
 */
function groupNotesByDay<T extends { id: number; noteDate: string }>(
  notes: T[],
): Map<string, T[]> {
  const sorted = [...notes].sort(
    (a, b) => a.noteDate.localeCompare(b.noteDate) || a.id - b.id,
  );
  const byDay = new Map<string, T[]>();
  for (const note of sorted) {
    const day = dayFromIso(note.noteDate) ?? note.noteDate;
    const bucket = byDay.get(day);
    if (bucket) bucket.push(note);
    else byDay.set(day, [note]);
  }
  return byDay;
}

/**
 * One row per day (in `days` order — Monday..Sunday) that has at least one
 * note; a day with no notes is skipped entirely. Multi-line bodies are
 * never touched, so their internal newlines survive unchanged.
 *
 * `bracketOf`, when given, tags each note with a bracket (project rows pass
 * none — they're never bracketed, note count notwithstanding):
 * - Exactly one note that day: the bracket sits between the day label and
 *   the colon, e.g. `"Mon 24 [SD-WAN]: body"` — unchanged from the
 *   single-note case.
 * - Two or more notes that day: there's no single slot for N different
 *   notes' brackets, so each moves onto its own body instead, joined with
 *   " / ": `"Mon 24: [SD-WAN] body-one / [Firewall] body-two"` (a
 *   `bracketOf` that returns "" for a given note omits that note's bracket
 *   prefix — `bracketFor` below never does, since title is required).
 */
function buildDayRows<T extends { id: number; noteDate: string; body: string }>(
  days: string[],
  byDay: Map<string, T[]>,
  bracketOf?: (note: T) => string,
): string[] {
  const rows: string[] = [];
  for (const day of days) {
    const dayNotes = byDay.get(day);
    if (!dayNotes || dayNotes.length === 0) continue;
    const label = dayLabel(day);
    if (!bracketOf || dayNotes.length === 1) {
      const bracket = bracketOf ? bracketOf(dayNotes[0]) : "";
      const bodies = dayNotes.map((n) => n.body).join(" / ");
      rows.push(bracket ? `${label} ${bracket}: ${bodies}` : `${label}: ${bodies}`);
    } else {
      const segments = dayNotes.map((n) => {
        const bracket = bracketOf(n);
        return bracket ? `${bracket} ${n.body}` : n.body;
      });
      rows.push(`${label}: ${segments.join(" / ")}`);
    }
  }
  return rows;
}

/**
 * `[<title>]` — the title is required (1-120 chars, Decision 4), so this
 * always returns a non-empty bracket, unlike the earlier optional-service
 * version.
 */
function bracketFor(note: DailyReviewOpsNote): string {
  return `[${note.title}]`;
}

/**
 * Drafts a customer's weekly update from this week's project + operations
 * notes: one paragraph per project (customer's own project order, project
 * skipped entirely if it has zero notes this week), then one "Operations —"
 * paragraph if any operations notes exist this week, then a trailing
 * "Next week — " line — always appended, even for a customer with no notes
 * at all (in which case the whole output is just that one line). Paragraphs
 * are separated by a blank line.
 */
export function draftWeeklyUpdate(
  customer: DailyReviewCustomer,
  week: { days: string[] },
): string {
  const paragraphs: string[] = [];

  for (const project of customer.projects) {
    const rows = buildDayRows<DailyReviewNote>(week.days, groupNotesByDay(project.notes));
    if (rows.length === 0) continue;
    paragraphs.push(`${project.name} — ${rows.join(" · ")}`);
  }

  if (customer.operationsNotes.length > 0) {
    const rows = buildDayRows<DailyReviewOpsNote>(
      week.days,
      groupNotesByDay(customer.operationsNotes),
      bracketFor,
    );
    if (rows.length > 0) {
      paragraphs.push(`Operations — ${rows.join(" · ")}`);
    }
  }

  paragraphs.push("Next week — ");
  return paragraphs.join("\n\n");
}
