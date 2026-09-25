import { utcMidnightOf } from "./dateBoundary.js";
import { getWeekdayHolidayDatesForYear } from "./holidays.js";

// Working-day counter backing lib/pipelineSla.ts's computeIdle (opportunity-
// pipeline-flow-spec §7, opportunity-flow-redesign D8). "Working day" =
// Monday-Friday, minus Indonesian public holidays (the same date-holidays
// "ID" source routes/holidays.ts already served — see lib/holidays.ts).
//
// UTC-day choice: `lastActivityAt`/`waitingInputSince` are instants, but this
// counts CALENDAR days between them, so a day boundary has to be picked
// somewhere. This reuses the app's existing plain-day contract
// (lib/dateBoundary.ts's `utcMidnightOf`, the same boundary routes/tasks.ts's
// "overdue" check and the DateField/DateRangeField UI use) rather than
// inventing a WIB-local one: WIB is UTC+7, so a deal that changes hands right
// at local midnight can land on the "wrong" UTC day by our count — accepted,
// same tradeoff the rest of the date contract already makes.
//
// Arithmetic, not a day-by-day loop (perf finding SF1, phase review): the
// list route (routes/opportunities.ts) calls computeIdle -> this function
// once per deal, and the D6 backfill leaves plenty of rows with a
// months-old `lastActivityAt` — a year-old span walking ~365 iterations per
// deal, times hundreds of deals, blew past backend/CLAUDE.md's sub-200ms NFR
// (measured: 500 deals x 365-day span ~= 146ms of pure loop CPU before the
// query or JSON even ran). A full 7-day block always contains exactly 5
// weekdays regardless of which day it starts on, so the span decomposes
// into `fullWeeks * 5` plus a weekday count over the short remainder — O(1)
// day math instead of O(days). Only the public holidays that land on a
// weekday need subtracting (a weekend holiday is already excluded by the
// Mon-Fri arithmetic); `getWeekdayHolidayDatesForYear` pre-filters and
// caches that list per year, so this only ever iterates a handful of
// holiday dates, not the days between them.
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Counts Monday-Friday UTC calendar days strictly after `from`'s day up to
 * and including `to`'s day, excluding Indonesian public holidays. Returns 0
 * when `to` is on or before `from`'s day (same day counts as 0, and a `to`
 * before `from` never counts negative days).
 */
export function workingDaysBetween(from: Date, to: Date): number {
  const fromDay = utcMidnightOf(from);
  const toDay = utcMidnightOf(to);
  if (toDay.getTime() <= fromDay.getTime()) return 0;

  const spanDays = Math.round((toDay.getTime() - fromDay.getTime()) / MS_PER_DAY);
  const firstDayOfWeek = (fromDay.getUTCDay() + 1) % 7; // day-of-week of the day right after fromDay
  const fullWeeks = Math.floor(spanDays / 7);
  const remainder = spanDays % 7;

  let weekdayCount = fullWeeks * 5;
  for (let i = 0; i < remainder; i++) {
    const dayOfWeek = (firstDayOfWeek + i) % 7; // 0 = Sunday, 6 = Saturday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) weekdayCount++;
  }

  // String comparison is safe and exact here: both operands are the same
  // fixed-width "yyyy-MM-dd" format, so lexicographic order matches
  // calendar order without parsing a Date per holiday.
  const fromDayString = fromDay.toISOString().slice(0, 10);
  const toDayString = toDay.toISOString().slice(0, 10);
  let holidayWeekdayCount = 0;
  for (let year = fromDay.getUTCFullYear(); year <= toDay.getUTCFullYear(); year++) {
    for (const dateString of getWeekdayHolidayDatesForYear(year)) {
      if (dateString > fromDayString && dateString <= toDayString) holidayWeekdayCount++;
    }
  }

  return weekdayCount - holidayWeekdayCount;
}
