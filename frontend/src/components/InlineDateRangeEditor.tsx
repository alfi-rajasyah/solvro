import { useEffect, useRef, useState, type FormEvent } from "react";
import { DateField } from "@/components/DateField";
import { commitDraft, dayFromIso, dayToDate, formatDisplay } from "@/lib/dateField";

interface InlineDateRangeEditorProps {
  startISO: string | null;
  endISO: string | null;
  onSave: (startISO: string | null, endISO: string | null) => void;
  onCancel: () => void;
  /** Optional positional className (e.g. "absolute right-0 top-full mt-1 z-50"). */
  className?: string;
}

export function InlineDateRangeEditor({
  startISO,
  endISO,
  onSave,
  onCancel,
  className = "",
}: InlineDateRangeEditorProps) {
  // External contract is unchanged (ISO instants in/out via startISO/endISO
  // and onSave), but draft state is now plain day strings ("yyyy-MM-dd") —
  // DateField's contract as of this task (see DateField.tsx / lib/dateField.ts).
  // `startISO`/`endISO` themselves stay untouched for the lifetime of this
  // mount and are what `commitDraft` compares each draft against at save time.
  const [start, setStart] = useState<string | null>(dayFromIso(startISO));
  const [end, setEnd] = useState<string | null>(dayFromIso(endISO));
  const wrapRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    function onDocPointer(e: PointerEvent) {
      const wrap = wrapRef.current;
      if (!wrap) return;
      if (wrap.contains(e.target as Node)) return;
      // DateField's calendar popup is rendered through a Base-UI Portal, so
      // a click inside it lands outside `wrap` in the DOM tree even though
      // it's logically still "inside" the editor. Without this check, every
      // day click in either calendar would be seen as an outside click and
      // cancel the whole editor before the field's own onChange could fire.
      // Deliberately matches only the popover portal marker, not
      // `[role="dialog"]` — a call site can mount this editor inside a host
      // element that itself carries role="dialog" (e.g. TaskPanel's <aside>),
      // and matching that role here made every click anywhere inside the
      // host count as "inside the editor", killing outside-click dismissal
      // for clicks elsewhere in that host. Base-UI's popup carries both
      // `data-slot="popover-content"` and `role="dialog"`, so the attribute
      // selector alone still covers the portal.
      const target = e.target as Element | null;
      if (target?.closest('[data-slot="popover-content"]')) return;
      onCancel();
    }
    function onKey(e: KeyboardEvent) {
      // Base-UI's Popover already stops its own dismissing Escape from
      // reaching this document-level listener (verified empirically,
      // 2026-07-28), so this only ever fires when no calendar popup is
      // open — exactly the "cancel the editor" case it's meant for.
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("pointerdown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [onCancel]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Day-string comparison — legacy-exact logic (the pre-swap code compared
    // full ISO timestamps derived the same monotonic way); with start/end
    // now day strings this reads identically and is calendar-day-correct in
    // every timezone rather than incidentally correct via the ISO transform.
    if (start && end && new Date(start) > new Date(end)) {
      setEnd(start);
      return;
    }
    onSave(commitDraft(start, startISO), commitDraft(end, endISO));
  }

  const startDate = dayToDate(start);

  return (
    <form
      ref={wrapRef}
      onSubmit={handleSubmit}
      onClick={(e) => e.stopPropagation()}
      className={[
        "w-[220px] rounded-sm border border-outline-variant bg-surface-container-lowest p-2 shadow-overlay",
        className,
      ].join(" ")}
    >
      <label className="flex items-center gap-2 py-0.5">
        <span className="w-10 font-display text-label-caps uppercase tracking-wider text-on-surface-variant">
          Start
        </span>
        <DateField
          value={start}
          onChange={setStart}
          className="flex-1"
          clearable
          aria-label={start ? `Start date, currently ${formatDisplay(start)}` : "Start date"}
        />
      </label>
      <label className="flex items-center gap-2 py-0.5">
        <span className="w-10 font-display text-label-caps uppercase tracking-wider text-on-surface-variant">
          Due
        </span>
        <DateField
          value={end}
          onChange={setEnd}
          className="flex-1"
          clearable
          aria-label={end ? `Due date, currently ${formatDisplay(end)}` : "Due date"}
          calendarProps={{
            disabled: startDate ? { before: startDate } : undefined,
            // react-day-picker computes its initial month as
            // `month || defaultMonth || today` and never consults `selected`
            // — an existing due date's own month must win here, or opening
            // this picker on a due date set in a different month than start
            // would silently land on the START month instead, hiding the
            // due date the calendar is meant to be showing. Falls back to
            // `startDate` (the no-due-yet nicety: land near the start month
            // rather than today) and finally `undefined` (today) when
            // neither is set.
            defaultMonth: dayToDate(end) ?? startDate ?? undefined,
          }}
        />
      </label>
      <div className="mt-1 flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-sm px-1.5 py-0.5 font-display text-label-caps uppercase tracking-wider text-on-surface-variant hover:bg-surface-container"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-sm bg-primary px-2 py-0.5 font-display text-label-caps uppercase tracking-wider text-on-primary hover:bg-primary-container"
        >
          Save
        </button>
      </div>
    </form>
  );
}
