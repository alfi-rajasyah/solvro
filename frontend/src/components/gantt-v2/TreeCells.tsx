import { useState } from "react";
import { InlineDateRangeEditor } from "@/components/InlineDateRangeEditor";
import { fmtDateRangeDDMM } from "@/lib/gantt/geometry";
import { SECTION_COLOR_PRESETS } from "@/lib/gantt/palette";
import type { Task } from "@/lib/queries";
import { cn } from "@/lib/utils";

// Ported mounting for the tree-pane inline editors that used to live in the
// old engine's GanttListRow.tsx (~:258 dates popover, ~:164-193 section color
// popover). The editor bodies themselves are reused as-is — InlineDateRangeEditor
// is already a standalone shared component (frontend/src/components/), so it's
// imported directly rather than copied; only the section color-picker popover
// (previously inline JSX in GanttListRow) is reproduced here, verbatim in
// structure/classNames, as its own small component so it can mount via a
// ReUI GanttColumn render prop instead of a bespoke list row.

const isoToDate = (iso: string | null): Date | null => (iso ? new Date(iso) : null);

interface TaskDatesCellProps {
  task: Task;
  canEdit: boolean;
  onSave: (taskId: number, startISO: string | null, dueISO: string | null) => void;
}

/** Tree-pane "Dates" column cell for task rows (GanttListRow.tsx:240-270 parity). */
export function TaskDatesCell({ task, canEdit, onSave }: TaskDatesCellProps) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="relative flex w-full min-w-0 items-center justify-end">
      <button
        type="button"
        disabled={!canEdit}
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        className={cn(
          "w-full truncate text-right font-mono text-[11px] text-on-surface-variant",
          canEdit ? "hover:text-primary" : "cursor-default",
        )}
        title={canEdit ? "Click to edit dates" : undefined}
      >
        {fmtDateRangeDDMM(isoToDate(task.startDate), isoToDate(task.dueDate))}
      </button>
      {editing && canEdit && (
        <InlineDateRangeEditor
          className="absolute right-0 top-full z-50 mt-1"
          startISO={task.startDate}
          endISO={task.dueDate}
          onSave={(s, e) => {
            onSave(task.id, s, e);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}

interface SectionColorCellProps {
  sectionId: number;
  color: string;
  canEdit: boolean;
  onPick: (sectionId: number, color: string) => void;
}

/** Tree-pane color-swatch column cell for section group rows (GanttListRow.tsx:151-194 parity). */
export function SectionColorCell({ sectionId, color, canEdit, onPick }: SectionColorCellProps) {
  const [picking, setPicking] = useState(false);
  return (
    <span className="relative flex shrink-0 items-center">
      <button
        type="button"
        disabled={!canEdit}
        onClick={(e) => {
          e.stopPropagation();
          setPicking((v) => !v);
        }}
        className="h-2 w-2 rounded-full disabled:cursor-default"
        style={{ backgroundColor: color }}
        aria-label="Set section color"
        title={canEdit ? "Set section color" : undefined}
      />
      {picking && canEdit && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            onClick={(e) => {
              e.stopPropagation();
              setPicking(false);
            }}
            aria-label="Close color picker"
          />
          {/* Floating popover — sanctioned overlay shadow-sm token (DESIGN.md exception) */}
          <div className="absolute left-0 top-4 z-50 flex gap-1 rounded-sm border border-outline-variant bg-surface-container-lowest p-1.5 shadow-overlay">
            {SECTION_COLOR_PRESETS.map((hex) => (
              <button
                key={hex}
                type="button"
                className="h-4 w-4 rounded-full hover:ring-2 hover:ring-primary"
                style={{ backgroundColor: hex }}
                onClick={(e) => {
                  e.stopPropagation();
                  onPick(sectionId, hex);
                  setPicking(false);
                }}
                aria-label={`Section color ${hex}`}
              />
            ))}
          </div>
        </>
      )}
    </span>
  );
}
