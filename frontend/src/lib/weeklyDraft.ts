// Drafts a customer's weekly-sync content from the week's daily notes
// (docs/plans/weekly-sync-highlight-rows.md §4 "Draft helper", D9). Pure
// functions — no React, no network — so the Daily Review modals' "Draft
// from notes" actions can call them directly and the Vitest suite below can
// exercise them in isolation. `opts.throughDay`, when given, restricts BOTH
// project and operations notes to `week.days` entries on or before that day
// (a plain string compare on "yyyy-MM-dd" — the boundary day itself is
// kept): the Mid-week modal passes `week.days[2]` so highlights only draft
// from Mon-Wed notes, while the Reflection modal omits it so Weekly
// Achievement keeps drafting from the full week, weekend notes included,
// exactly as before. `draftWeeklyUpdate` still backs the Reflection form's
// free-text draft; `draftWeeklyHighlights` is the Mid-week form's draft,
// producing one `WeeklyHighlightInput` row per note (D9) instead of one
// paragraph per project.
import { dayFromIso } from "./dateField";
import type {
  DailyReviewCustomer,
  DailyReviewNote,
  DailyReviewOpsNote,
  WeeklyHighlightInput,
} from "./queries";

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
 * Drafts a customer's weekly-sync text from this week's project + operations
 * notes: one paragraph per project (customer's own project order, project
 * skipped entirely if it has zero notes this week), then one "Operations —"
 * paragraph if any operations notes exist this week. No trailing "next
 * week" line: the draft now lands in a single column (Highlight on
 * Wednesday, Weekly Achievement on Friday) that gets copied verbatim into
 * the meeting table, and "next week" is its own field (Next Week Focus) —
 * a stub belonged here only when the draft filled one free-text box.
 * Paragraphs are separated by a blank line; a customer with no notes at all
 * (in the drafted range) drafts to an empty string.
 */
export function draftWeeklyUpdate(
  customer: DailyReviewCustomer,
  week: { days: string[] },
  opts?: { throughDay?: string },
): string {
  const paragraphs: string[] = [];
  const throughDay = opts?.throughDay;
  const days = throughDay ? week.days.filter((d) => d <= throughDay) : week.days;

  for (const project of customer.projects) {
    const rows = buildDayRows<DailyReviewNote>(days, groupNotesByDay(project.notes));
    if (rows.length === 0) continue;
    paragraphs.push(`${project.name} — ${rows.join(" · ")}`);
  }

  if (customer.operationsNotes.length > 0) {
    const rows = buildDayRows<DailyReviewOpsNote>(
      days,
      groupNotesByDay(customer.operationsNotes),
      bracketFor,
    );
    if (rows.length > 0) {
      paragraphs.push(`Operations — ${rows.join(" · ")}`);
    }
  }

  return paragraphs.join("\n\n");
}

/** Cuts `s` to `max` code points (not UTF-16 code units), so a multi-byte
 * character straddling the boundary is dropped whole rather than split into
 * a lone surrogate — matching the migration's `LEFT(first_line, 200)`
 * (Postgres counts characters, not UTF-16 units, for `text`). */
function cut(s: string, max: number): string {
  const codePoints = [...s];
  return codePoints.length > max ? codePoints.slice(0, max).join("") : s;
}

/**
 * Splits a note body into a one-line title and an optional detail — the
 * same rule the `weekly_highlights` data-move migration applies to the old
 * `WeeklyUpdate.highlight` text (docs/plans/weekly-sync-highlight-rows.md
 * §2). Line endings are normalised first (`\r\n` and a lone `\r` both become
 * `\n`, matching the migration's own normalisation), then each line is
 * trimmed of surrounding spaces. The title is the first non-empty line, cut
 * at 200 characters. Detail is everything after that line, trimmed, or
 * `null` when empty — UNLESS the first line itself was longer than 200
 * characters, in which case the title was cut short and detail becomes the
 * full trimmed body instead, so nothing is silently lost.
 */
export function splitTitle(text: string): { title: string; detail: string | null } {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const trimmedLines = lines.map((l) => l.trim());
  const firstIndex = trimmedLines.findIndex((l) => l.length > 0);
  if (firstIndex === -1) return { title: "", detail: null };

  const firstLine = trimmedLines[firstIndex];
  if ([...firstLine].length > 200) {
    const full = text.trim();
    return { title: cut(firstLine, 200), detail: full.length > 0 ? full : null };
  }

  const rest = lines.slice(firstIndex + 1).join("\n").trim();
  return { title: firstLine, detail: rest.length > 0 ? rest : null };
}

/** One `WeeklyHighlightInput` row for `note`, titled `prefix` + its own split title (D9). `prefix` never lands in `detail`: when the prefixed title has to be cut at 200, detail falls back to the note's full trimmed body instead of just the post-first-line remainder. */
function highlightFromNote(note: { body: string }, prefix: string): WeeklyHighlightInput {
  const split = splitTitle(note.body);
  const prefixedTitle = prefix + split.title;
  if ([...prefixedTitle].length > 200) {
    const full = note.body.trim();
    return { title: cut(prefixedTitle, 200), detail: full.length > 0 ? full : null };
  }
  return { title: prefixedTitle, detail: split.detail };
}

/**
 * Drafts one Mid-week highlight per note in this week's project + operations
 * notes (D9): day order, and within a day the customer's own project order
 * first, then operations notes. A project note is titled
 * `"<day label> <project name>: <first line>"`; an operations note
 * `"<day label> [<note title>]: <first line>"` (`bracketFor`'s `[<title>]`
 * moved next to the day label rather than the note body, since the day
 * label + name/bracket together are now the WeeklyHighlight's `title`, not
 * a plain-text prefix inside one long paragraph). Unlike `draftWeeklyUpdate`,
 * same-day notes are never joined with " / " — each note is its own row.
 * A customer with no notes in the drafted range drafts to `[]`.
 */
export function draftWeeklyHighlights(
  customer: DailyReviewCustomer,
  week: { days: string[] },
  opts?: { throughDay?: string },
): WeeklyHighlightInput[] {
  const throughDay = opts?.throughDay;
  const days = throughDay ? week.days.filter((d) => d <= throughDay) : week.days;

  const projectDays = customer.projects.map((project) => ({
    project,
    byDay: groupNotesByDay(project.notes),
  }));
  const opsByDay = groupNotesByDay(customer.operationsNotes);

  const highlights: WeeklyHighlightInput[] = [];
  for (const day of days) {
    const label = dayLabel(day);
    for (const { project, byDay } of projectDays) {
      for (const note of byDay.get(day) ?? []) {
        highlights.push(highlightFromNote(note, `${label} ${project.name}: `));
      }
    }
    for (const note of opsByDay.get(day) ?? []) {
      highlights.push(highlightFromNote(note, `${label} ${bracketFor(note)}: `));
    }
  }
  return highlights;
}
