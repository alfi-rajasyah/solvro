import { format } from "date-fns";
import type { DateRange } from "react-day-picker";

/**
 * Pure date helpers backing `DateField` (frontend/src/components/DateField.tsx)
 * and `InlineDateRangeEditor` (frontend/src/components/InlineDateRangeEditor.tsx).
 * No React here — see the Vitest suite in `dateField.test.ts`.
 *
 * Two representations, kept deliberately distinct:
 *
 * - A "day string": `"yyyy-MM-dd"`, no time, no zone. This is what
 *   `DateField` traffics in as its `value`/`onChange` contract, and what
 *   draft state holds while a date range is being edited. A day string has
 *   no timezone to drift across, so parsing it for the Calendar (local
 *   midnight, `dayToDate`) and re-emitting it after a pick (`dateToDay`) is
 *   TZ-drift-free by construction — click day N, see day N, in every zone.
 * - An ISO instant (e.g. `"2026-07-28T00:00:00.000Z"`): the persisted API
 *   payload currency (`Task.startDate`/`dueDate` etc). Unchanged by this
 *   module — every helper that touches an ISO string treats it exactly as
 *   the pre-DateField-swap `InlineDateRangeEditor.tsx` code did
 *   (`toInputValue`/`fromInputValue`, byte-identical for parsable ISO
 *   input — `dayFromIso` additionally probes the sliced day for validity,
 *   a check `toInputValue` lacked, so the two diverge only on unparsable
 *   input, unreachable with Prisma timestamps): the calendar date is
 *   always `iso.slice(0, 10)`, and the ISO for a picked day is always
 *   derived from LOCAL midnight of that day (`new Date(`${day}T00:00:00`)`,
 *   then `.toISOString()`).
 *
 * Why the split exists (root cause of the walk-back bug this module fixes):
 * an earlier version of `DateField` had `value`/`onChange` carry the ISO
 * instant directly, transforming through local-midnight -> `toISOString()`
 * on every pick. East of UTC (positive offset), local midnight serializes to
 * the *previous* UTC calendar day, so picking July 28 in UTC+7 immediately
 * re-displayed 27/07/2026 — the freshly emitted ISO's date-part had already
 * walked back a day before the round-trip back through the picker. Because
 * `commitDraft` below also used a raw ISO comparison at save time, an
 * untouched form re-saved in that timezone would walk the *stored* date back
 * one more day per save (Save → 27 stored → reopen shows 27 → Save again →
 * 26 stored → ...). Moving `DateField`'s own contract to a plain day string
 * removes the ISO round-trip from the picker's display path entirely: the
 * *only* place an ISO instant gets derived from a day string is the save
 * boundary (`isoFromDay`, via `commitDraft`), once, not on every keystroke of
 * navigating the calendar. The persisted payload semantics are unchanged —
 * see `commitDraft`'s doc below for how untouched-draft passthrough
 * preserves that while still fixing the walk-back.
 */

/**
 * Legacy display boundary (was `InlineDateRangeEditor.tsx`'s `toInputValue`):
 * ISO timestamp -> plain day string ("yyyy-MM-dd"). Null for null, empty, or
 * an unparsable slice.
 */
export function dayFromIso(iso: string | null): string | null {
  if (!iso) return null;
  const day = iso.slice(0, 10);
  const probe = new Date(`${day}T00:00:00`);
  if (Number.isNaN(probe.getTime())) return null;
  return day;
}

/**
 * Legacy commit boundary (was `InlineDateRangeEditor.tsx`'s `fromInputValue`):
 * plain day string -> ISO timestamp, derived from LOCAL midnight of that day.
 * Byte-identical to the pre-swap helper. Null for null, empty, or an
 * unparsable day string.
 */
export function isoFromDay(day: string | null): string | null {
  if (!day) return null;
  const d = new Date(`${day}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Day string -> Date at LOCAL midnight of that calendar date, for handing to
 * the Calendar's `selected`/`defaultMonth`. Null for null, empty, or
 * unparsable input.
 */
export function dayToDate(day: string | null): Date | null {
  if (!day) return null;
  const d = new Date(`${day}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * Date -> day string, deriving `yyyy-MM-dd` from the Date's LOCAL
 * year/month/day (not UTC getters) via `date-fns` `format`. This is the
 * Calendar's `onSelect` boundary. Null for null or an Invalid Date.
 */
export function dateToDay(d: Date | null): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  return format(d, "yyyy-MM-dd");
}

/** dd/MM/yyyy display string from a day string. Empty string for null/invalid. */
export function formatDisplay(day: string | null): string {
  const d = dayToDate(day);
  if (!d) return "";
  return format(d, "dd/MM/yyyy");
}

/**
 * Save-boundary rule reconciling a `DateField` draft (day string) against
 * the original persisted ISO instant it started from.
 *
 * - If the draft is unchanged from the original (`draftDay === dayFromIso(originalIso)`,
 *   including both being null), returns `originalIso` UNCHANGED — an
 *   untouched-draft passthrough. This is a FIX, not mere byte-parity: without
 *   it, re-saving a form the user never touched would re-derive the ISO from
 *   the day string via `isoFromDay`, which in a positive-offset timezone
 *   (east of UTC) walks the stored instant back one calendar day per save
 *   (see this module's top comment for the mechanism). Passthrough means an
 *   untouched field is byte-identical in and out, in every timezone.
 * - Otherwise (the user actually changed or cleared the day), returns
 *   `isoFromDay(draftDay)` — the legacy commit transform, applied only to
 *   fields that were actually edited.
 */
export function commitDraft(draftDay: string | null, originalIso: string | null): string | null {
  if (draftDay === dayFromIso(originalIso)) return originalIso;
  return isoFromDay(draftDay);
}

/**
 * `DateRangeField`'s DISPLAY-boundary mapping: a draft day-string PAIR (the
 * component's actual source of truth, see `DateRangeField.tsx`'s module doc
 * for why) -> react-day-picker's `DateRange`, fed to `Calendar`'s `selected`
 * prop only. Never used to derive what gets emitted on Apply — that's the
 * pair itself, verbatim.
 *
 * - Both null -> `undefined` (nothing highlighted).
 * - One-sided (e.g. a due-only task) -> `{ from: theDay, to: theDay }` — RDP
 *   has no one-sided `selected` shape, so a single-day range is the closest
 *   display that still highlights the known day without inventing a second
 *   one.
 * - Both set -> `{ from, to }`.
 */
export function rangeFromPair(start: string | null, end: string | null): DateRange | undefined {
  const from = dayToDate(start);
  const to = dayToDate(end);
  if (from && to) return { from, to };
  const theDay = from ?? to;
  return theDay ? { from: theDay, to: theDay } : undefined;
}

/**
 * The inverse of `rangeFromPair`: react-day-picker's `onSelect` callback
 * argument -> a draft day-string pair. `range.to` falls back to `range.from`
 * so a click that only sets `from` (RDP's `addToRange` does this whenever
 * `min` is left at its default of 0 starting from an empty selection — see
 * `DateRangeField.tsx`'s capability-trade-off note) still seeds both sides
 * the same day, matching `rangeFromPair`'s one-sided display convention
 * above rather than producing a `{ from, to: null }` split the rest of this
 * module doesn't model. `range` itself `undefined` — RDP's own
 * re-click-to-deselect signal — maps to both-null.
 */
export function pairFromRange(range: DateRange | undefined): [string | null, string | null] {
  if (!range) return [null, null];
  return [dateToDay(range.from ?? null), dateToDay(range.to ?? range.from ?? null)];
}

/**
 * `DateRangeField`'s `onSelect` boundary (fix round 3, plan Task 3.5 polish):
 * react-day-picker's callback argument -> the next draft pair. `range ===
 * undefined` is RDP's own re-click-to-DESELECT signal
 * (`selection/useRange.js`'s `select()`, via `addToRange`'s "adding a date
 * that is equal to both start and end of the range" branch, fires whenever
 * `required` is left at its default `false`) — NOT a user request to wipe the
 * draft, so it's ignored here and `current` is returned unchanged (by
 * reference). This matters for a one-sided draft (start-only/due-only) or ANY
 * milestone task (the backend forces `startDate === dueDate`, see
 * `tasks.ts`'s milestone lockstep): `rangeFromPair` fabricates a same-day
 * `{from: D, to: D}` `selected` for both shapes, so clicking that single
 * highlighted day is an entirely ordinary interaction that fires this exact
 * deselect signal — not an edge case. The ONLY path to a both-null draft is
 * `DateRangeField`'s explicit Clear button.
 *
 * A defined `range` maps through `pairFromRange` as normal.
 */
export function nextDraftFromSelection(
  range: DateRange | undefined,
  current: [string | null, string | null],
): [string | null, string | null] {
  if (!range) return current;
  return pairFromRange(range);
}

/**
 * `DateRangeField`'s Apply-time ordering fix (fix round 2, plan Task 3.5).
 * Historically-stored `Task.startDate`/`dueDate` pairs can already be
 * inverted (`startDate > dueDate`) — nothing upstream of this component
 * enforces ordering (no relational DB check, and the old two-field editor's
 * submit-time `start > end` clamp is gone; range mode's structural ordering
 * only covers a pair `addToRange` builds up itself from an EMPTY selection,
 * not one SEEDED already-inverted via `rangeFromPair` — see
 * `DateRangeField.tsx`'s `handleSelect` doc for why RDP doesn't self-correct
 * that case).
 *
 * Swaps `draftStart`/`draftEnd` when both are set and `draftStart >
 * draftEnd` (plain string comparison is correct for `"yyyy-MM-dd"` — the
 * same order as calendar order) — but ONLY when at least one draft differs
 * from its seed (`seedStart`/`seedEnd`, the props `DateRangeField` last
 * reseeded the draft from on open). This guard is load-bearing: an untouched
 * open→Apply on an inverted STORED pair (`draftStart === seedStart &&
 * draftEnd === seedEnd`, both still inverted) must still emit the seed
 * values verbatim, unswapped — swapping an untouched pair would fabricate a
 * change the user never made and break `commitDraft`'s untouched-passthrough
 * byte-parity at the call site (`InlineDateRangeEditor`/`TaskFormModal`).
 *
 * One-sided (`null` on either side) and both-null drafts are returned
 * unchanged regardless of the changed check — there's no pair to order.
 */
export function normalizePair(
  draftStart: string | null,
  draftEnd: string | null,
  seedStart: string | null,
  seedEnd: string | null,
): [string | null, string | null] {
  const changed = draftStart !== seedStart || draftEnd !== seedEnd;
  if (changed && draftStart && draftEnd && draftStart > draftEnd) {
    return [draftEnd, draftStart];
  }
  return [draftStart, draftEnd];
}
