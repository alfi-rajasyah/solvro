import { type Row, type ViewMode } from "@/lib/gantt/geometry";
import { ROW_HEIGHT } from "@/lib/gantt/constants";
import type { Holiday } from "@/lib/queries";
import { GanttColumnGrid } from "./GanttColumnGrid";
import { GanttDateAxis } from "./GanttDateAxis";
import { GanttRow } from "./GanttRow";
import { GanttTodayLine } from "./GanttTodayLine";

interface GanttChartPaneProps {
  rows: Row[];
  chartStart: Date;
  chartEnd: Date;
  viewMode: ViewMode;
  columnWidth: number;
  contentWidth: number;
  holidays: Holiday[];
  canEdit: boolean;
  onCommit: (taskId: number, startDate: Date, dueDate: Date) => void;
  onTaskClick: (taskId: number) => void;
}

export function GanttChartPane({
  rows,
  chartStart,
  chartEnd,
  viewMode,
  columnWidth,
  contentWidth,
  holidays,
  canEdit,
  onCommit,
  onTaskClick,
}: GanttChartPaneProps) {
  const bodyHeight = rows.length * ROW_HEIGHT;
  return (
    <>
      <GanttDateAxis
        chartStart={chartStart}
        chartEnd={chartEnd}
        viewMode={viewMode}
        columnWidth={columnWidth}
        contentWidth={contentWidth}
      />
      <div
        className="relative"
        style={{ width: contentWidth, height: bodyHeight }}
      >
        <GanttColumnGrid
          chartStart={chartStart}
          chartEnd={chartEnd}
          viewMode={viewMode}
          columnWidth={columnWidth}
          contentWidth={contentWidth}
          bodyHeight={bodyHeight}
          holidays={holidays}
        />
        <div className="relative" style={{ zIndex: 1 }}>
          {rows.map((row) => (
            <GanttRow
              key={row.id}
              row={row}
              chartStart={chartStart}
              viewMode={viewMode}
              columnWidth={columnWidth}
              contentWidth={contentWidth}
              canEdit={canEdit}
              onCommit={onCommit}
              onTaskClick={onTaskClick}
            />
          ))}
        </div>
        <GanttTodayLine
          chartStart={chartStart}
          chartEnd={chartEnd}
          viewMode={viewMode}
          columnWidth={columnWidth}
          bodyHeight={bodyHeight}
        />
      </div>
    </>
  );
}
