// Pure-function suite — no DB (workingDaysBetween only touches
// lib/holidays.ts's in-memory date-holidays cache). Covers §5 item 8's
// workingDaysBetween cases: a weekend span, a span over 17 August (Hari
// Kemerdekaan — Indonesian Independence Day), `to < from` -> 0, same day ->
// 0.
import { describe, expect, it } from "vitest";
import { workingDaysBetween } from "../src/lib/workingDays.js";
import { getHolidaysForYear } from "../src/lib/holidays.js";

function day(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function isWeekday(d: Date): boolean {
  const dayOfWeek = d.getUTCDay();
  return dayOfWeek !== 0 && dayOfWeek !== 6;
}

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Independent day-by-day reference implementation — the ORIGINAL shape of
 * `workingDaysBetween` before the arithmetic optimization (phase-review
 * finding SF1). Kept only here, never imported by source, purely to
 * cross-check the optimized version's output for a handful of spans.
 */
function bruteForceWorkingDaysBetween(from: Date, to: Date): number {
  const fromDay = utcMidnight(from);
  const toDay = utcMidnight(to);
  if (toDay.getTime() <= fromDay.getTime()) return 0;

  const holidays = new Set<string>();
  for (let year = fromDay.getUTCFullYear(); year <= toDay.getUTCFullYear(); year++) {
    for (const h of getHolidaysForYear(year)) holidays.add(h.date);
  }

  let count = 0;
  const cursor = new Date(fromDay);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor.getTime() <= toDay.getTime()) {
    if (isWeekday(cursor) && !holidays.has(cursor.toISOString().slice(0, 10))) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

describe("workingDaysBetween", () => {
  it("counts only the Monday across a Fri->Mon weekend span", () => {
    // 2026-09-04 is a Friday, 2026-09-07 the following Monday — no holiday
    // in between (2026's Indonesian public holiday list has nothing in
    // September).
    expect(workingDaysBetween(day("2026-09-04"), day("2026-09-07"))).toBe(1);
  });

  it("counts Fri/Mon/Tue across a longer span crossing one weekend", () => {
    // 2026-09-03 Thursday -> 2026-09-08 Tuesday: Fri 4, Mon 7, Tue 8 count;
    // Sat 5 and Sun 6 don't.
    expect(workingDaysBetween(day("2026-09-03"), day("2026-09-08"))).toBe(3);
  });

  it("excludes 17 August (Hari Kemerdekaan) from the count", () => {
    // 2026-08-14 Friday -> 2026-08-21 Friday: without the holiday exclusion
    // this would be 5 (18,19,20,21 plus the Monday 17th); with it, 17
    // August — a Monday — drops out, leaving 4 (18,19,20,21).
    expect(workingDaysBetween(day("2026-08-14"), day("2026-08-21"))).toBe(4);
  });

  it("returns 0 when to is before from", () => {
    expect(workingDaysBetween(day("2026-09-07"), day("2026-09-04"))).toBe(0);
  });

  it("returns 0 for the same day", () => {
    expect(workingDaysBetween(day("2026-09-07"), day("2026-09-07"))).toBe(0);
  });

  it("truncates both instants to their UTC calendar day before counting", () => {
    // Same UTC days as the first case (Fri 4 -> Mon 7) but with non-midnight
    // times — the UTC-day contract (lib/workingDays.ts's header comment)
    // means the time-of-day is irrelevant to the count.
    const from = new Date("2026-09-04T23:30:00.000Z");
    const to = new Date("2026-09-07T00:05:00.000Z");
    expect(workingDaysBetween(from, to)).toBe(1);
  });
});

describe("workingDaysBetween — arithmetic cross-checked against a brute-force day-by-day loop (SF1)", () => {
  const spans: [label: string, from: string, to: string][] = [
    ["a 2-year span", "2025-01-01", "2027-01-01"],
    ["a span starting on a Saturday", "2026-09-05", "2026-09-17"],
    ["a span ending on a Sunday", "2026-08-25", "2026-09-06"],
    ["a span containing both 1 January and 17 August", "2025-12-01", "2026-08-20"],
  ];

  it.each(spans)("%s (%s -> %s) matches the brute-force count", (_label, from, to) => {
    const fromDate = day(from);
    const toDate = day(to);
    expect(workingDaysBetween(fromDate, toDate)).toBe(bruteForceWorkingDaysBetween(fromDate, toDate));
  });
});

describe("workingDaysBetween — performance (SF1)", () => {
  it("handles 500 x ~1000-day-span calls well under the backend's sub-200ms API budget", () => {
    const from = day("2023-01-01");
    const to = day("2025-09-27"); // ~1000 days later
    const start = performance.now();
    for (let i = 0; i < 500; i++) {
      workingDaysBetween(from, to);
    }
    const elapsedMs = performance.now() - start;
    // Measured well under 50ms for the arithmetic version (the day-by-day
    // loop this replaced measured ~284ms for this exact workload). This
    // assertion keeps a generous margin so it doesn't flake on a loaded CI
    // runner, while still catching a regression back to an O(days) loop.
    expect(elapsedMs).toBeLessThan(150);
  });
});
