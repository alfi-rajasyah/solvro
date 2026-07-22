import { GanttBar } from "./GanttBar";
import { GanttSectionBand, GanttSectionSummaryBar } from "./GanttSectionBar";
import { type Row, type ViewMode } from "@/lib/gantt/geometry";
import { ROW_HEIGHT } from "@/lib/gantt/constants";
import type { ColorByMode } from "@/lib/gantt/palette";

interface GanttRowProps {
  row: Row;
  chartStart: Date;
  viewMode: ViewMode;
  columnWidth: number;
  contentWidth: number;
  canEdit: boolean;
  showBaseline: boolean;
  colorBy: ColorByMode;
  hovered: boolean;
  onCommit: (taskId: number, startDate: Date, dueDate: Date) => void;
  onTaskClick: (taskId: number) => void;
  onHoverChange: (rowId: string | null) => void;
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
  showBaseline,
  colorBy,
  hovered,
  onCommit,
  onTaskClick,
  onHoverChange,
  onConnectStart,
}: GanttRowProps) {
  return (
    <div
      className={[
        "group relative border-b border-outline-variant",
        hovered ? "bg-surface-container-low/70" : "",
      ].join(" ")}
      style={{ height: ROW_HEIGHT, width: contentWidth }}
      onMouseEnter={() => onHoverChange(row.id)}
      onMouseLeave={() => onHoverChange(null)}
    >
      {row.kind === "section" && (
        <>
          <GanttSectionBand color={row.sectionColor} contentWidth={contentWidth} />
          <GanttSectionSummaryBar
            row={row}
            chartStart={chartStart}
            viewMode={viewMode}
            columnWidth={columnWidth}
          />
        </>
      )}
      {(row.kind === "task" || row.kind === "subtask") && (
        <GanttBar
          row={row}
          chartStart={chartStart}
          viewMode={viewMode}
          columnWidth={columnWidth}
          canEdit={canEdit}
          showBaseline={showBaseline}
          colorBy={colorBy}
          onCommit={onCommit}
          onClick={onTaskClick}
          onConnectStart={onConnectStart}
        />
      )}
    </div>
  );
}
