import { type Row } from "@/lib/gantt/geometry";
import {
  AXIS_HEIGHT,
  CHECKBOX_COL_WIDTH,
  DATE_COL_WIDTH,
  LIST_PANE_WIDTH,
  NAME_COL_WIDTH,
  PCT_COL_WIDTH,
} from "@/lib/gantt/constants";
import type { TaskStatus } from "@/lib/queries";
import { GanttListRow } from "./GanttListRow";

interface GanttListPaneProps {
  rows: Row[];
  canEdit: boolean;
  onToggleSection: (id: string) => void;
  onTaskClick: (taskId: number) => void;
  onToggleStatus: (taskId: number, current: TaskStatus) => void;
  onUpdateDates: (taskId: number, startISO: string | null, dueISO: string | null) => void;
}

export function GanttListPane({
  rows,
  canEdit,
  onToggleSection,
  onTaskClick,
  onToggleStatus,
  onUpdateDates,
}: GanttListPaneProps) {
  return (
    <div
      className="sticky left-0 z-30 border-r border-outline-variant bg-surface-container-lowest"
      style={{ width: LIST_PANE_WIDTH }}
    >
      <div
        className="sticky top-0 z-40 flex items-stretch border-b border-outline-variant bg-surface-container-low"
        style={{ height: AXIS_HEIGHT, width: LIST_PANE_WIDTH }}
      >
        <div style={{ width: CHECKBOX_COL_WIDTH }} />
        <div
          className="flex items-center border-r border-outline-variant px-2 font-display text-[10px] font-bold uppercase tracking-widest text-on-surface-variant"
          style={{ width: NAME_COL_WIDTH }}
        >
          Name
        </div>
        <div
          className="flex items-center justify-end border-r border-outline-variant px-2 font-display text-[10px] font-bold uppercase tracking-widest text-on-surface-variant"
          style={{ width: DATE_COL_WIDTH }}
        >
          Start
        </div>
        <div
          className="flex items-center justify-end border-r border-outline-variant px-2 font-display text-[10px] font-bold uppercase tracking-widest text-on-surface-variant"
          style={{ width: DATE_COL_WIDTH }}
        >
          Due
        </div>
        <div
          className="flex items-center justify-end px-2 font-display text-[10px] font-bold uppercase tracking-widest text-on-surface-variant"
          style={{ width: PCT_COL_WIDTH }}
        >
          %
        </div>
      </div>
      <div>
        {rows.map((row) => (
          <GanttListRow
            key={row.id}
            row={row}
            canEdit={canEdit}
            onToggleSection={onToggleSection}
            onTaskClick={onTaskClick}
            onToggleStatus={onToggleStatus}
            onUpdateDates={onUpdateDates}
          />
        ))}
      </div>
    </div>
  );
}
