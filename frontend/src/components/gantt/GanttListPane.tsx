import { type Row } from "@/lib/gantt/geometry";
import { AXIS_HEIGHT, DATE_RANGE_COL_WIDTH } from "@/lib/gantt/constants";
import { GanttListRow } from "./GanttListRow";

interface GanttListPaneProps {
  rows: Row[];
  width: number;
  canEdit: boolean;
  hoveredRowId: string | null;
  onToggleSection: (id: string) => void;
  onTaskClick: (taskId: number) => void;
  onUpdateDates: (taskId: number, startISO: string | null, dueISO: string | null) => void;
  onHoverChange: (rowId: string | null) => void;
}

export function GanttListPane({
  rows,
  width,
  canEdit,
  hoveredRowId,
  onToggleSection,
  onTaskClick,
  onUpdateDates,
  onHoverChange,
}: GanttListPaneProps) {
  return (
    <div
      className="sticky left-0 z-30 border-r border-outline-variant bg-surface-container-lowest"
      style={{ width }}
    >
      <div
        className="sticky top-0 z-40 flex items-stretch border-b border-outline-variant bg-surface-container-low"
        style={{ height: AXIS_HEIGHT, width }}
      >
        <div className="flex flex-1 items-center px-2 font-display text-label-caps uppercase tracking-widest text-on-surface-variant">
          Task
        </div>
        <div
          className="flex shrink-0 items-center justify-end px-2 font-display text-label-caps uppercase tracking-widest text-on-surface-variant"
          style={{ width: DATE_RANGE_COL_WIDTH }}
        >
          Dates
        </div>
      </div>
      <div>
        {rows.map((row) => (
          <GanttListRow
            key={row.id}
            row={row}
            canEdit={canEdit}
            hovered={hoveredRowId === row.id}
            onToggleSection={onToggleSection}
            onTaskClick={onTaskClick}
            onUpdateDates={onUpdateDates}
            onHoverChange={onHoverChange}
          />
        ))}
      </div>
    </div>
  );
}
