import { differenceInCalendarDays } from "date-fns";
import type { ProjectStatus } from "./queries";

export type StatusChangeDialog = "cancel" | "reactivate";

/** Which lifecycle dialog a from -> to status edit may need (null = none). */
export function statusChangeDialogFor(
  from: ProjectStatus,
  to: ProjectStatus,
): StatusChangeDialog | null {
  if (from === to) return null;
  if (to === "CANCELLED") return "cancel";
  if (from === "ON_HOLD" && (to === "ACTIVE" || to === "PLANNING")) return "reactivate";
  return null;
}

export interface LifecyclePreviewCounts {
  openTasks: number;
  doneTasks: number;
  pastDueOpenTasks: number;
}

/** The dialog actually shown: the kind applies only when the preview says there is something to confirm. */
export function dialogToShow(
  from: ProjectStatus,
  to: ProjectStatus,
  preview: LifecyclePreviewCounts,
): StatusChangeDialog | null {
  const kind = statusChangeDialogFor(from, to);
  if (kind === "cancel") return preview.openTasks > 0 ? "cancel" : null;
  if (kind === "reactivate") return preview.pastDueOpenTasks > 0 ? "reactivate" : null;
  return null;
}

/**
 * Whole calendar days on hold, counted in LOCAL time from the local day of
 * `onHoldSince` to the local day of `now` (minimum 1). The server's `holdDays`
 * compares a UTC day with the caller's day and can be one high ahead of UTC.
 */
export function localHoldDays(onHoldSinceIso: string | null, now: Date): number {
  if (!onHoldSinceIso) return 1;
  const since = new Date(onHoldSinceIso);
  if (Number.isNaN(since.getTime())) return 1;
  return Math.max(1, differenceInCalendarDays(now, since));
}

/** Parses the shift input: a whole number of days in 1..3650, else null. */
export function parseShiftDays(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw);
  return n >= 1 && n <= 3650 ? n : null;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Single-flight guard for the status-change confirm flow: at most one confirm
 * runs at a time (a second call is refused), and `cancel()` — the form closing
 * mid-flow — invalidates the running one so a late preview response is dropped
 * instead of opening a dialog nobody can see.
 */
export function createConfirmGate() {
  let active: number | null = null;
  let seq = 0;
  return {
    /** A token, or null when a confirm is already running. */
    begin(): number | null {
      if (active !== null) return null;
      seq += 1;
      active = seq;
      return active;
    },
    isCurrent: (token: number) => active === token,
    current: () => active,
    end(token: number) {
      if (active === token) active = null;
    },
    cancel() {
      active = null;
    },
  };
}
