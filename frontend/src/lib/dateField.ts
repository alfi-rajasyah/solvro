import { format } from "date-fns";

/**
 * Pure date helpers backing `DateField` (frontend/src/components/DateField.tsx).
 * No React here — see the Vitest suite in `dateField.test.ts`.
 *
 * These reproduce the exact ISO<->local-calendar-date semantics the native
 * `<input type="date">` sites used before the swap (see
 * `InlineDateRangeEditor.tsx`'s `toInputValue`/`fromInputValue`, byte-for-byte):
 * the calendar date is always `iso.slice(0, 10)`, and the Date object for that
 * calendar date is always local midnight (`new Date(`${slice}T00:00:00`)`),
 * never a UTC-parsed Date.
 *
 * This does NOT avoid the classic UTC-slice off-by-one — it deliberately
 * REPRODUCES it, for byte-for-byte parity with the legacy pair. Because
 * `localDateToIso` ends in `.toISOString()`, a timezone east of UTC (positive
 * offset) makes the emitted ISO's date part lag one calendar day behind the
 * day the user picked (local midnight gets serialized to the previous UTC
 * day). `InlineDateRangeEditor.tsx:12-22`'s `fromInputValue` has the exact
 * same drift, so this is intentional parity, not a bug — "fixing" it here
 * would silently change the stored date at every existing call site relative
 * to what they persist today. See `dateField.test.ts`'s
 * "equivalence with the legacy toInputValue/fromInputValue pair" block for
 * the byte-identical comparison, and its round-trip tests for how the drift
 * is verified to be TZ-independent in its effect (same instant, both sides).
 */

/**
 * ISO timestamp -> Date at LOCAL midnight of its calendar date.
 * Returns null for null, empty, or unparsable input.
 */
export function isoToLocalDate(iso: string | null): Date | null {
  if (!iso) return null;
  const dayString = iso.slice(0, 10);
  const local = new Date(`${dayString}T00:00:00`);
  if (Number.isNaN(local.getTime())) return null;
  return local;
}

/**
 * Date (assumed local midnight of the intended calendar day) -> ISO string.
 * Derives yyyy-MM-dd from the Date's LOCAL year/month/day (not UTC getters),
 * then re-parses that string as local midnight before calling toISOString(),
 * matching the legacy `fromInputValue` round-trip exactly. Null in, null out.
 */
export function localDateToIso(d: Date | null): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  const dayString = format(d, "yyyy-MM-dd");
  const local = new Date(`${dayString}T00:00:00`);
  if (Number.isNaN(local.getTime())) return null;
  return local.toISOString();
}

/** dd/MM/yyyy display string (matches the native `<input type="date">` locale-agnostic rendering). Empty string for null. */
export function formatDisplay(d: Date | null): string {
  if (!d) return "";
  return format(d, "dd/MM/yyyy");
}
