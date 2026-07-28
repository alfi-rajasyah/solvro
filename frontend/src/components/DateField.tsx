import { useEffect, useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDisplay, isoToLocalDate, localDateToIso } from "@/lib/dateField";
import { cn } from "@/lib/utils";

interface DateFieldProps {
  /** ISO string — same currency as the API. */
  value: string | null;
  onChange: (iso: string | null) => void;
  disabled?: boolean;
  /** "boxed" = bordered inline-editor look (default). "bare" = borderless FieldRow text. */
  variant?: "boxed" | "bare";
  /** Renders a "Clear" action under the calendar. */
  clearable?: boolean;
  /** Pass-through for react-day-picker props, e.g. disabled-day matchers, defaultMonth. */
  calendarProps?: Partial<
    Omit<React.ComponentProps<typeof Calendar>, "mode" | "selected" | "onSelect">
  >;
  /** Extra classes on the trigger button. */
  className?: string;
  "aria-label"?: string;
}

const triggerBaseClasses =
  "cursor-pointer text-left focus:outline-hidden disabled:cursor-default";

const variantClasses = {
  boxed:
    "rounded-sm border border-outline-variant bg-surface-container-lowest px-1.5 py-0.5 font-mono text-[12px] text-on-surface focus:border-primary",
  bare: "border-none bg-transparent text-xs font-semibold text-on-surface",
} as const;

/**
 * Shared calendar-popover date field replacing native `<input type="date">`
 * sites. Composes ui/calendar.tsx inside ui/popover.tsx, the same pattern as
 * `reui/gantt/gantt-nav.tsx`'s `GanttDatePicker` (validated to render
 * correctly in dark mode without edits to ui/calendar.tsx).
 */
export function DateField({
  value,
  onChange,
  disabled = false,
  variant = "boxed",
  clearable = false,
  calendarProps,
  className,
  "aria-label": ariaLabel,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const date = isoToLocalDate(value);

  function handleSelect(day: Date | undefined) {
    if (day === undefined && !clearable) {
      // react-day-picker fires onSelect(undefined) when the user re-clicks
      // the already-selected day. Without a Clear affordance that shouldn't
      // be able to null out the value — just close (mirrors
      // reui/gantt/gantt-nav.tsx:401-406's `if (next)` guard).
      setOpen(false);
      return;
    }
    onChange(localDateToIso(day ?? null));
    setOpen(false);
  }

  function handleClear() {
    onChange(null);
    setOpen(false);
  }

  // Single source of truth for "is the popover actually visible" — must
  // gate both the Popover's `open` prop and the Escape capture-listener
  // effect below. Deriving `open && !disabled` separately in each place let
  // `disabled` flip true while `open` was still true: the popup would hide
  // (Popover-level gate) but the effect below, keyed only on `open`, kept
  // its capture listener attached — swallowing every document Escape (the
  // host Modal/Drawer became keyboard-unclosable) — and the popover could
  // spring back open once `disabled` cleared.
  const isOpen = open && !disabled;

  // If `disabled` flips true while the popover is open, force `open` back
  // to false so the popup can't resurrect once `disabled` clears again.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  // Base-UI's own Escape-to-dismiss listener and the host Drawer/Modal
  // shells' Escape-to-close listeners are all plain bubble-phase
  // `document.addEventListener("keydown", ...)` calls — co-located listeners
  // on the same node/phase all still fire regardless of any one of them
  // calling stopPropagation(). A capture-phase listener runs strictly before
  // all of those, so stopImmediatePropagation() there reliably suppresses
  // the whole bubble pass (including the host shell) while we close the
  // popover ourselves. Removed as soon as the popover closes (including via
  // `disabled` flipping true), so a second Escape reaches the host shell
  // normally.
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDownCapture(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      e.preventDefault();
      setOpen(false);
    }
    document.addEventListener("keydown", onKeyDownCapture, true);
    return () => document.removeEventListener("keydown", onKeyDownCapture, true);
  }, [isOpen]);

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        disabled={disabled}
        aria-label={
          ariaLabel ?? (date ? `Select date, currently ${formatDisplay(date)}` : "Select date")
        }
        className={cn(triggerBaseClasses, variantClasses[variant], className)}
      >
        {formatDisplay(date) || "—"}
      </PopoverTrigger>
      <PopoverContent align="start" positionerClassName="z-101" className="w-auto p-0! shadow-overlay">
        <Calendar
          {...calendarProps}
          mode="single"
          selected={date ?? undefined}
          defaultMonth={calendarProps?.defaultMonth ?? date ?? undefined}
          onSelect={handleSelect}
        />
        {clearable ? (
          <div className="flex justify-end border-t border-outline-variant p-1">
            <button
              type="button"
              onClick={handleClear}
              className="rounded-sm px-1.5 py-0.5 font-display text-label-caps uppercase tracking-wider text-on-surface-variant hover:bg-surface-container"
            >
              Clear
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
