import { GanttBar } from "./GanttBar";
import { GanttSectionBar } from "./GanttSectionBar";
import { type Row, type ViewMode } from "@/lib/gantt/geometry";
import { ROW_HEIGHT } from "@/lib/gantt/constants";

interface GanttRowProps {
  row: Row;
  chartStart: Date;
  viewMode: ViewMode;
  columnWidth: number;
  contentWidth: number;
  canEdit: boolean;
  onCommit: (taskId: number, startDate: Date, dueDate: Date) => void;
  onTaskClick: (taskId: number) => void;
  onConnectStart?: (
    sourceTaskId: number,
    side: "right" | "left",
    clientX: number,
    clientY: number,
  ) => void;
}

export function GanttRow({
  row,
  chartStart,
  viewMode,
  columnWidth,
  contentWidth,
  canEdit,
  onCommit,
  onTaskClick,
  onConnectStart,
}: GanttRowProps) {
  return (
    <div
      className="group relative border-b border-outline-variant"
      style={{ height: ROW_HEIGHT, width: contentWidth }}
    >
      {row.kind === "section" && (
        <GanttSectionBar
          row={row}
          chartStart={chartStart}
          viewMode={viewMode}
          columnWidth={columnWidth}
        />
      )}
      {(row.kind === "task" || row.kind === "subtask") && (
        <GanttBar
          row={row}
          chartStart={chartStart}
          viewMode={viewMode}
          columnWidth={columnWidth}
          canEdit={canEdit}
          onCommit={onCommit}
          onClick={onTaskClick}
          onConnectStart={onConnectStart}
        />
      )}
    </div>
  );
}
