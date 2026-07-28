import { describe, expect, it } from "vitest";
import { formatDisplay, isoToLocalDate, localDateToIso } from "./dateField";

/**
 * Legacy pair from InlineDateRangeEditor.tsx:12-22, reimplemented here as a
 * fixture (not imported from the component — it's a pure comparison target,
 * not a dependency) so this suite can assert byte-identical output against
 * the behavior every call site relied on before the DateField swap.
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
 * that exposes the off-by-one described in `dateField.ts`'s top comment).
 * Run both to reproduce: `docker compose exec frontend npm test` and
 * `docker compose exec -e TZ=Asia/Jakarta frontend npm test`.
 *
 * An earlier draft of the round-trip tests below asserted
 * `localDateToIso(date).slice(0, 10) === iso.slice(0, 10)` — i.e. it compared
 * the UTC-slice of the *emitted* ISO string back to the *originally picked*
 * calendar day. That assertion is itself TZ-dependent and wrong: east of UTC,
 * `.toISOString()` legitimately shifts the date substring back a day (see
 * `dateField.ts`'s comment), so the assertion fails under e.g.
 * `TZ=Asia/Jakarta` even though `localDateToIso` is behaving correctly. The
 * fix is not the helpers — it's asserting a property that actually holds in
 * every timezone: re-hydrating the emitted ISO with `new Date(iso)` and
 * reading it back through the *same* local getters used to produce it always
 * recovers the same local calendar day, because that string encodes the same
 * instant `date` does. That's the invariant the tests below check.
 */
describe("isoToLocalDate / localDateToIso round-trip", () => {
  const sampleIsos = [
    "2026-07-26T00:00:00.000Z",
    "2026-07-26T15:42:07.123Z",
    "2026-01-01T00:00:00.000Z",
    "2026-12-31T23:59:59.999Z",
    "2026-02-28T00:00:00.000Z",
    "2028-02-29T00:00:00.000Z", // leap day
    "2026-07-26", // date-only, no time component
  ];

  for (const iso of sampleIsos) {
    it(`preserves the calendar date for ${iso}`, () => {
      const date = isoToLocalDate(iso);
      expect(date).not.toBeNull();

      // Hop 1 (isoToLocalDate) is TZ-independent by construction: dayString
      // is a pure string slice of `iso`, so the parsed local Y/M/D always
      // matches it exactly, in any timezone.
      const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
      expect(date!.getFullYear()).toBe(y);
      expect(date!.getMonth()).toBe(m - 1);
      expect(date!.getDate()).toBe(d);

      const roundTripped = localDateToIso(date);
      expect(roundTripped).not.toBeNull();

      // Hop 2 (localDateToIso) is checked via the same-instant invariant
      // (see file-level comment above), not by comparing raw ISO date
      // substrings, which is what makes this TZ-independent.
      const reparsed = new Date(roundTripped!);
      expect(reparsed.getFullYear()).toBe(date!.getFullYear());
      expect(reparsed.getMonth()).toBe(date!.getMonth());
      expect(reparsed.getDate()).toBe(date!.getDate());
    });
  }

  it("isoToLocalDate produces a Date at local midnight, not UTC midnight", () => {
    const date = isoToLocalDate("2026-07-26T15:42:07.123Z");
    expect(date).not.toBeNull();
    expect(date!.getHours()).toBe(0);
    expect(date!.getMinutes()).toBe(0);
    expect(date!.getSeconds()).toBe(0);
    expect(date!.getFullYear()).toBe(2026);
    expect(date!.getMonth()).toBe(6); // July, 0-indexed
    expect(date!.getDate()).toBe(26);
  });

  it("localDateToIso derives yyyy-MM-dd from LOCAL getters, not UTC getters", () => {
    // Construct a Date directly (not via isoToLocalDate) at local midnight.
    const localMidnight = new Date(2026, 6, 26, 0, 0, 0); // July 26, 2026 local
    const iso = localDateToIso(localMidnight);
    expect(iso).not.toBeNull();
    // Same-instant invariant (see file-level comment): re-hydrating `iso`
    // and reading LOCAL getters must recover July 26 2026 in any timezone.
    // If this derived dayString from UTC getters instead of local ones, this
    // would diverge under an offset TZ like Asia/Jakarta.
    const reparsed = new Date(iso!);
    expect(reparsed.getFullYear()).toBe(2026);
    expect(reparsed.getMonth()).toBe(6);
    expect(reparsed.getDate()).toBe(26);
  });

  it("localDateToIso normalizes a non-midnight Date to the same result as local midnight of the same calendar day", () => {
    // `localDateToIso` derives yyyy-MM-dd via `format(d, "yyyy-MM-dd")` and
    // then RE-PARSES that string as local midnight before calling
    // `toISOString()` (dateField.ts:48-51) — a normalization step that only
    // does anything observable when `d` itself isn't already local midnight.
    // Every other test in this file passes local-midnight Dates in, so this
    // re-parse line is otherwise never exercised. A time-of-day component
    // (23:30) must be discarded, not folded into the emitted instant.
    const nonMidnight = new Date(2026, 6, 26, 23, 30); // July 26, 2026, 23:30 local
    const midnight = new Date(2026, 6, 26, 0, 0, 0); // July 26, 2026, local midnight
    expect(localDateToIso(nonMidnight)).toBe(localDateToIso(midnight));
  });
});

describe("null / empty / garbage input handling", () => {
  it("isoToLocalDate(null) returns null", () => {
    expect(isoToLocalDate(null)).toBeNull();
  });

  it('isoToLocalDate("") returns null', () => {
    expect(isoToLocalDate("")).toBeNull();
  });

  it("isoToLocalDate(garbage string) returns null", () => {
    expect(isoToLocalDate("not-a-date")).toBeNull();
    expect(isoToLocalDate("banana")).toBeNull();
    expect(isoToLocalDate("2026-13-99")).toBeNull();
  });

  it("localDateToIso(null) returns null", () => {
    expect(localDateToIso(null)).toBeNull();
  });

  it("localDateToIso(Invalid Date) returns null", () => {
    expect(localDateToIso(new Date("garbage"))).toBeNull();
  });

  it("formatDisplay(null) returns empty string", () => {
    expect(formatDisplay(null)).toBe("");
  });
});

describe("DST-transition-adjacent dates round-trip to the same calendar day", () => {
  // EU DST transitions in 2026: spring-forward last Sunday of March (29th),
  // fall-back last Sunday of October (25th). Exercise the days immediately
  // surrounding each transition — these are exactly the dates most likely to
  // shift by one day if a UTC-based date path ever creeps back in.
  const dstAdjacentDates = [
    "2026-03-28",
    "2026-03-29",
    "2026-03-30",
    "2026-10-24",
    "2026-10-25",
    "2026-10-26",
  ];

  for (const day of dstAdjacentDates) {
    it(`round-trips ${day} to the same local calendar day`, () => {
      const iso = `${day}T00:00:00.000Z`;
      const date = isoToLocalDate(iso);
      expect(date).not.toBeNull();
      const roundTripped = localDateToIso(date);
      expect(roundTripped).not.toBeNull();
      // Same-instant invariant (see the file-level TZ note above) rather
      // than a raw ISO-string comparison, so this holds under UTC and under
      // a positive-offset zone (e.g. Asia/Jakarta) alike, including across
      // the DST transition itself.
      const reparsed = new Date(roundTripped!);
      expect(reparsed.getFullYear()).toBe(date!.getFullYear());
      expect(reparsed.getMonth()).toBe(date!.getMonth());
      expect(reparsed.getDate()).toBe(date!.getDate());
    });
  }
});

describe("formatDisplay", () => {
  it("formats a Date as dd/MM/yyyy", () => {
    const date = isoToLocalDate("2026-07-26T00:00:00.000Z");
    expect(formatDisplay(date)).toBe("26/07/2026");
  });

  it("zero-pads single-digit day and month", () => {
    const date = isoToLocalDate("2026-01-05T00:00:00.000Z");
    expect(formatDisplay(date)).toBe("05/01/2026");
  });

  it("returns empty string for null", () => {
    expect(formatDisplay(null)).toBe("");
  });
});

describe("equivalence with the legacy toInputValue/fromInputValue pair", () => {
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
    it(`localDateToIso(isoToLocalDate(iso)) matches legacy fromInputValue(toInputValue(iso)) for ${iso}`, () => {
      const legacyResult = legacyFromInputValue(legacyToInputValue(iso));
      const newResult = localDateToIso(isoToLocalDate(iso));
      expect(newResult).toBe(legacyResult);
    });
  }

  it("both sides agree null propagates for null input", () => {
    expect(localDateToIso(isoToLocalDate(null))).toBe(
      legacyFromInputValue(legacyToInputValue(null)),
    );
  });

  it("both sides agree empty-string / no-selection propagates to null", () => {
    expect(legacyFromInputValue(legacyToInputValue(""))).toBeNull();
    expect(localDateToIso(isoToLocalDate(""))).toBeNull();
  });
});
