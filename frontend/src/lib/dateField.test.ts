import { describe, expect, it } from "vitest";
import { commitDraft, dateToDay, dayFromIso, dayToDate, formatDisplay, isoFromDay } from "./dateField";

/**
 * Legacy pair from the pre-Task-2 `InlineDateRangeEditor.tsx:12-22`,
 * reimplemented here as a fixture (not imported from any component — it's a
 * pure comparison target, not a dependency) so this suite can assert
 * byte-identical output against the behavior every call site relied on
 * before the DateField swap.
 */
function legacyToInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function legacyFromInputValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Timezone-independence note: this suite was verified green under both
 * `TZ=UTC` and `TZ=Asia/Jakarta` (a positive/east-of-UTC offset — the zone
 * that exposed the picker walk-back bug this task fixes, see
 * `dateField.ts`'s top comment). Run both to reproduce:
 * `docker compose exec frontend npm test` and
 * `docker compose exec -e TZ=Asia/Jakarta frontend npm test`.
 *
 * Post-Task-2, `dayToDate`/`dateToDay` operate purely on local Y/M/D — no
 * ISO round-trip, no `.toISOString()` — so their round-trips are trivially
 * TZ-independent and can be asserted directly (unlike the pre-Task-2
 * `isoToLocalDate`/`localDateToIso` pair, which needed a same-instant
 * invariant to express a TZ-independent property). The ISO-touching
 * helpers (`dayFromIso`, `isoFromDay`) still carry the classic UTC-slice
 * off-by-one deliberately, for byte-parity with the legacy pair above — see
 * the "legacy equivalence" describe block below and `dateField.ts`'s doc.
 */
describe("dayToDate / dateToDay round-trip", () => {
  const sampleDays = [
    "2026-07-26",
    "2026-01-01",
    "2026-12-31",
    "2026-02-28",
    "2028-02-29", // leap day
  ];

  for (const day of sampleDays) {
    it(`round-trips ${day} through dayToDate -> dateToDay unchanged`, () => {
      const date = dayToDate(day);
      expect(date).not.toBeNull();
      const [y, m, d] = day.split("-").map(Number);
      expect(date!.getFullYear()).toBe(y);
      expect(date!.getMonth()).toBe(m - 1);
      expect(date!.getDate()).toBe(d);
      expect(date!.getHours()).toBe(0);
      expect(date!.getMinutes()).toBe(0);
      expect(date!.getSeconds()).toBe(0);

      expect(dateToDay(date)).toBe(day);
    });
  }

  it("dateToDay derives yyyy-MM-dd from LOCAL getters, not UTC getters", () => {
    const localMidnight = new Date(2026, 6, 26, 0, 0, 0); // July 26, 2026 local
    expect(dateToDay(localMidnight)).toBe("2026-07-26");
  });

  it("dateToDay discards a non-midnight time-of-day component", () => {
    const nonMidnight = new Date(2026, 6, 26, 23, 30);
    const midnight = new Date(2026, 6, 26, 0, 0, 0);
    expect(dateToDay(nonMidnight)).toBe(dateToDay(midnight));
    expect(dateToDay(nonMidnight)).toBe("2026-07-26");
  });
});

describe("DST-transition-adjacent dates round-trip to the same calendar day", () => {
  // EU DST transitions in 2026: spring-forward last Sunday of March (29th),
  // fall-back last Sunday of October (25th). Exercise the days immediately
  // surrounding each transition — these are exactly the dates most likely to
  // shift by one day if a UTC-based date path ever creeps back in.
  const dstAdjacentDays = [
    "2026-03-28",
    "2026-03-29",
    "2026-03-30",
    "2026-10-24",
    "2026-10-25",
    "2026-10-26",
  ];

  for (const day of dstAdjacentDays) {
    it(`round-trips ${day} to the same local calendar day`, () => {
      const date = dayToDate(day);
      expect(date).not.toBeNull();
      expect(dateToDay(date)).toBe(day);
    });
  }
});

describe("null / empty / garbage input handling", () => {
  it("dayToDate(null) / dayToDate(\"\") return null", () => {
    expect(dayToDate(null)).toBeNull();
    expect(dayToDate("")).toBeNull();
  });

  it("dayToDate(garbage string) returns null", () => {
    expect(dayToDate("not-a-date")).toBeNull();
    expect(dayToDate("banana")).toBeNull();
    expect(dayToDate("2026-13-99")).toBeNull();
  });

  it("dateToDay(null) returns null", () => {
    expect(dateToDay(null)).toBeNull();
  });

  it("dateToDay(Invalid Date) returns null", () => {
    expect(dateToDay(new Date("garbage"))).toBeNull();
  });

  it("dayFromIso(null) / dayFromIso(\"\") return null", () => {
    expect(dayFromIso(null)).toBeNull();
    expect(dayFromIso("")).toBeNull();
  });

  it("isoFromDay(null) / isoFromDay(\"\") return null", () => {
    expect(isoFromDay(null)).toBeNull();
    expect(isoFromDay("")).toBeNull();
  });

  it("formatDisplay(null) returns empty string", () => {
    expect(formatDisplay(null)).toBe("");
  });
});

describe("formatDisplay", () => {
  it("formats a day string as dd/MM/yyyy", () => {
    expect(formatDisplay("2026-07-26")).toBe("26/07/2026");
  });

  it("zero-pads single-digit day and month", () => {
    expect(formatDisplay("2026-01-05")).toBe("05/01/2026");
  });

  it("returns empty string for null", () => {
    expect(formatDisplay(null)).toBe("");
  });

  it("returns empty string for garbage input", () => {
    expect(formatDisplay("not-a-date")).toBe("");
  });
});

describe("legacy equivalence: dayFromIso/isoFromDay match toInputValue/fromInputValue byte-for-byte", () => {
  const sampleIsos = [
    "2026-07-26T00:00:00.000Z",
    "2026-07-26T15:42:07.123Z",
    "2026-01-01T00:00:00.000Z",
    "2026-12-31T23:59:59.999Z",
    "2028-02-29T00:00:00.000Z",
    "2026-03-29T00:00:00.000Z",
    "2026-10-25T00:00:00.000Z",
  ];

  for (const iso of sampleIsos) {
    it(`dayFromIso matches legacy toInputValue for ${iso}`, () => {
      expect(dayFromIso(iso)).toBe(legacyToInputValue(iso));
    });
  }

  const sampleDays = ["2026-07-26", "2026-01-01", "2026-12-31", "2028-02-29"];

  for (const day of sampleDays) {
    it(`isoFromDay matches legacy fromInputValue for ${day}`, () => {
      expect(isoFromDay(day)).toBe(legacyFromInputValue(day));
    });
  }

  for (const iso of sampleIsos) {
    it(`isoFromDay(dayFromIso(iso)) matches legacy fromInputValue(toInputValue(iso)) for ${iso}`, () => {
      const legacyResult = legacyFromInputValue(legacyToInputValue(iso));
      const newResult = isoFromDay(dayFromIso(iso));
      expect(newResult).toBe(legacyResult);
    });
  }

  it("both sides agree null propagates for null input", () => {
    expect(isoFromDay(dayFromIso(null))).toBe(legacyFromInputValue(legacyToInputValue(null)));
  });

  it("both sides agree empty-string / no-selection propagates to null", () => {
    expect(legacyFromInputValue(legacyToInputValue(""))).toBeNull();
    expect(isoFromDay(dayFromIso(""))).toBeNull();
  });
});

describe("commitDraft", () => {
  it("untouched passthrough: draft unchanged from original returns the original ISO unchanged", () => {
    // Non-midnight fixture deliberately: for a midnight-UTC ISO,
    // isoFromDay(dayFromIso(iso)) === iso under a UTC system clock, which
    // makes the passthrough branch unobservable — this test would stay
    // green even with the `if (draftDay === dayFromIso(originalIso))` guard
    // deleted from commitDraft. A non-midnight ISO keeps its time-of-day
    // component only via the passthrough, so deleting the guard collapses
    // it to local midnight and this assertion goes red, in every zone
    // including UTC.
    const originalIso = "2026-07-26T15:42:07.123Z";
    const draftDay = dayFromIso(originalIso); // "2026-07-26"
    expect(commitDraft(draftDay, originalIso)).toBe(originalIso);
  });

  it("untouched passthrough preserves a Gantt-written midnight-UTC ISO unchanged", () => {
    // The exact shape Gantt-authored Task.startDate/dueDate are always
    // written in ("yyyy-MM-ddT00:00:00.000Z") — kept as its own case so
    // that shape stays covered, even though (unlike the non-midnight case
    // above) this fixture alone can't distinguish the passthrough branch
    // from isoFromDay(dayFromIso(iso)) under a UTC system clock.
    const originalIso = "2026-07-26T00:00:00.000Z";
    const draftDay = dayFromIso(originalIso);
    expect(commitDraft(draftDay, originalIso)).toBe(originalIso);
  });

  it("untouched passthrough: null draft against null original returns null", () => {
    expect(commitDraft(null, null)).toBeNull();
  });

  it("untouched passthrough is the fix for the legacy walk-back bug: repeated no-op commits never change the stored ISO", () => {
    // In a positive-offset timezone (e.g. Asia/Jakarta), re-deriving the ISO
    // from the day string on every save used to walk the stored date back a
    // day each time (see dateField.ts's top comment). A non-midnight
    // fixture (see the rationale in the first passthrough test above) also
    // makes this regression-visible under a UTC system clock: without the
    // passthrough guard, the first cycle alone would collapse
    // 15:42:07.123 down to local midnight. Simulate three "reopen and
    // re-save without touching anything" cycles and assert the stored ISO
    // never moves.
    let storedIso: string | null = "2026-07-26T15:42:07.123Z";
    for (let i = 0; i < 3; i++) {
      const draftDay = dayFromIso(storedIso);
      storedIso = commitDraft(draftDay, storedIso);
    }
    expect(storedIso).toBe("2026-07-26T15:42:07.123Z");
  });

  it("changed day: draft differing from the original's day commits via isoFromDay", () => {
    const originalIso = "2026-07-26T00:00:00.000Z";
    const changedDay = "2026-07-28";
    expect(commitDraft(changedDay, originalIso)).toBe(isoFromDay(changedDay));
    expect(commitDraft(changedDay, originalIso)).not.toBe(originalIso);
  });

  it("cleared day: draft null against a non-null original commits to null", () => {
    const originalIso = "2026-07-26T00:00:00.000Z";
    expect(commitDraft(null, originalIso)).toBeNull();
  });

  it("originalIso null + a freshly picked day commits via isoFromDay", () => {
    const pickedDay = "2026-07-28";
    expect(commitDraft(pickedDay, null)).toBe(isoFromDay(pickedDay));
    expect(commitDraft(pickedDay, null)).not.toBeNull();
  });

  it("originalIso null + no pick (draft stays null) stays null", () => {
    expect(commitDraft(null, null)).toBeNull();
  });
});
