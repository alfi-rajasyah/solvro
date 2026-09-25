import Holidays from "date-holidays";

// Extracted out of routes/holidays.ts (opportunity-flow-redesign, D8) so
// workingDays.ts's `workingDaysBetween` can share the exact same Indonesian
// public-holiday source and per-year cache the GET /holidays route already
// used — a second `date-holidays` instance/cache pair would just double the
// (cheap but pointless) computation and risk drifting if either copy's
// filtering logic ever changed.

export interface Holiday {
  date: string;
  name: string;
  type: string;
}

const cache = new Map<number, Holiday[]>();
const hd = new Holidays("ID");

export function getHolidaysForYear(year: number): Holiday[] {
  const cached = cache.get(year);
  if (cached) return cached;
  const raw = hd.getHolidays(year) ?? [];
  const list: Holiday[] = raw
    .filter((h) => h.type === "public")
    .map((h) => ({
      date: h.date.slice(0, 10),
      name: h.name,
      type: h.type,
    }));
  cache.set(year, list);
  return list;
}

// Derived cache for lib/workingDays.ts's arithmetic `workingDaysBetween`
// (perf finding SF1, phase review): a holiday landing on a weekend is
// already excluded by the Mon-Fri arithmetic, so only a holiday that falls
// on a WEEKDAY needs to be subtracted — pre-filtering once per year here
// (instead of re-deriving it, or worse re-fetching `getHolidaysForYear` and
// filtering, on every `workingDaysBetween` call) keeps a per-request idle
// computation (routes/opportunities.ts's list route calls `computeIdle`
// once per deal) from redoing the same weekday check hundreds of times.
const weekdayCache = new Map<number, Set<string>>();

export function getWeekdayHolidayDatesForYear(year: number): Set<string> {
  const cached = weekdayCache.get(year);
  if (cached) return cached;
  const set = new Set<string>();
  for (const h of getHolidaysForYear(year)) {
    const dayOfWeek = new Date(`${h.date}T00:00:00.000Z`).getUTCDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) set.add(h.date);
  }
  weekdayCache.set(year, set);
  return set;
}
