// Pure date math + key mapping for keyboard-operable Gantt bars
// (docs/archive/plans/application-review-2026-10-22.md, F-36). No DOM, no
// React — everything works on plain calendar days ("yyyy-MM-dd", the same
// contract as lib/dateField.ts) so DST and timezone never enter the picture.

import { addDays, format, parseISO } from "date-fns";
import type { GanttEvent, GanttProposedUpdate } from "@/components/reui/gantt/gantt-types";
import type { Task } from "@/lib/queries";

export const KEYBOARD_COMMIT_DELAY_MS = 600;

export interface DayRange {
  /** First day, "yyyy-MM-dd". */
  start: string;
  /** Last day, INCLUSIVE, "yyyy-MM-dd" (Solvro's dueDate convention). */
  end: string;
}

export interface Nudge {
  /** `move` shifts the whole bar; `resize` shifts only the end edge. */
  kind: "move" | "resize";
  /** Signed day count: ±1 for an arrow, ±7 with Shift. */
  days: number;
}

export interface NudgeKeyInput {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

/**
 * ArrowLeft/Right = move one day, Shift = one week. Alt+Arrow = move the END
 * edge instead (resize), same step sizes. Ctrl/Meta combos are left alone:
 * they belong to the OS, browser and screen readers.
 */
export function nudgeFromKey(e: NudgeKeyInput): Nudge | null {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return null;
  if (e.ctrlKey || e.metaKey) return null;
  const step = e.shiftKey ? 7 : 1;
  return {
    kind: e.altKey ? "resize" : "move",
    days: e.key === "ArrowLeft" ? -step : step,
  };
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Add whole days to a "yyyy-MM-dd" string via UTC math (DST-proof). */
export function addDaysToDay(day: string, days: number): string {
  const m = DAY_RE.exec(day);
  if (!m) return day;
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return t.toISOString().slice(0, 10);
}

/**
 * Apply a nudge. Move shifts both edges. Resize shifts the end edge and never
 * lets it pass the start (start <= end). Returns null when nothing changes
 * (a clamped resize, a disallowed resize, or a malformed day).
 */
export function nudgeRange(
  range: DayRange,
  nudge: Nudge,
  opts: { canResize: boolean },
): DayRange | null {
  if (!DAY_RE.test(range.start) || !DAY_RE.test(range.end)) return null;
  if (nudge.kind === "move") {
    return {
      start: addDaysToDay(range.start, nudge.days),
      end: addDaysToDay(range.end, nudge.days),
    };
  }
  if (!opts.canResize) return null;
  let end = addDaysToDay(range.end, nudge.days);
  // "yyyy-MM-dd" sorts lexically in calendar order.
  if (end < range.start) end = range.start;
  if (end === range.end) return null;
  return { start: range.start, end };
}

/** An event's visible days as inclusive calendar days (ReUI `end` is exclusive). */
export function eventDays(event: GanttEvent<Task>): DayRange {
  return {
    start: format(event.start, "yyyy-MM-dd"),
    end: format(addDays(event.end, -1), "yyyy-MM-dd"),
  };
}

/** The update a pointer drop would hand `onEventUpdate` for these days. */
export function proposedUpdate(event: GanttEvent<Task>, p: DayRange): GanttProposedUpdate<Task> {
  return {
    event,
    occurrence: null,
    start: parseISO(p.start),
    end: addDays(parseISO(p.end), 1),
    allDay: true,
    resourceId: event.resourceId,
    source: "keyboard",
  };
}
