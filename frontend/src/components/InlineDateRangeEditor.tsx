import { useEffect, useRef, useState, type FormEvent } from "react";

interface InlineDateRangeEditorProps {
  startISO: string | null;
  endISO: string | null;
  onSave: (startISO: string | null, endISO: string | null) => void;
  onCancel: () => void;
  /** Optional positional className (e.g. "absolute right-0 top-full mt-1 z-50"). */
  className?: string;
}

function toInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function fromInputValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function InlineDateRangeEditor({
  startISO,
  endISO,
  onSave,
  onCancel,
  className = "",
}: InlineDateRangeEditorProps) {
  const [start, setStart] = useState(toInputValue(startISO));
  const [end, setEnd] = useState(toInputValue(endISO));
  const wrapRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    function onDocPointer(e: PointerEvent) {
      const wrap = wrapRef.current;
      if (wrap && !wrap.contains(e.target as Node)) onCancel();
    }
    function onKey(e: KeyboardEvent) {
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
    if (start && end && new Date(start) > new Date(end)) {
      setEnd(start);
      return;
    }
    onSave(fromInputValue(start), fromInputValue(end));
  }

  return (
    <form
      ref={wrapRef}
      onSubmit={handleSubmit}
      onClick={(e) => e.stopPropagation()}
      className={[
        "w-[220px] rounded border border-outline-variant bg-surface-container-lowest p-2 shadow-lg",
        className,
      ].join(" ")}
    >
      <label className="flex items-center gap-2 py-0.5">
        <span className="w-10 font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
          Start
        </span>
        <input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="flex-1 rounded border border-outline-variant bg-surface-container-lowest px-1.5 py-0.5 font-mono text-[12px] text-on-surface focus:border-primary focus:outline-none"
        />
      </label>
      <label className="flex items-center gap-2 py-0.5">
        <span className="w-10 font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
          Due
        </span>
        <input
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="flex-1 rounded border border-outline-variant bg-surface-container-lowest px-1.5 py-0.5 font-mono text-[12px] text-on-surface focus:border-primary focus:outline-none"
        />
      </label>
      <div className="mt-1 flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-1.5 py-0.5 font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant hover:bg-surface-container"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded bg-primary px-2 py-0.5 font-display text-[11px] font-bold uppercase tracking-wider text-on-primary hover:bg-primary-container"
        >
          Save
        </button>
      </div>
    </form>
  );
}
