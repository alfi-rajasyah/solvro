import { type Row, type ViewMode } from "@/lib/gantt/geometry";
import { ROW_HEIGHT } from "@/lib/gantt/constants";
import type { Holiday, TaskDependency } from "@/lib/queries";
import { GanttColumnGrid } from "./GanttColumnGrid";
import { GanttConnectors } from "./GanttConnectors";
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
  showBaseline: boolean;
  dependencies: TaskDependency[];
  hoveredRowId: string | null;
  onHoverChange: (rowId: string | null) => void;
  /**
   * Active connect-drag state for the rubber-band line. `null` when no
   * drag is in progress.
   */
  connectDrag: { startX: number; startY: number; cursorX: number; cursorY: number } | null;
  onCommit: (taskId: number, startDate: Date, dueDate: Date) => void;
  onTaskClick: (taskId: number) => void;
  onConnectStart?: (
    sourceTaskId: number,
    side: "right" | "left",
    clientX: number,
    clientY: number,
  ) => void;
  onDeleteDependency?: (id: number) => void;
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
  showBaseline,
  dependencies,
  hoveredRowId,
  onHoverChange,
  connectDrag,
  onCommit,
  onTaskClick,
  onConnectStart,
  onDeleteDependency,
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
              showBaseline={showBaseline}
              hovered={hoveredRowId === row.id}
              onCommit={onCommit}
              onTaskClick={onTaskClick}
              onHoverChange={onHoverChange}
              onConnectStart={onConnectStart}
            />
          ))}
        </div>
        <GanttConnectors
          rows={rows}
          chartStart={chartStart}
          viewMode={viewMode}
          columnWidth={columnWidth}
          contentWidth={contentWidth}
          bodyHeight={bodyHeight}
          dependencies={dependencies}
          onDeleteDependency={onDeleteDependency}
        />
        {connectDrag && (
          <svg
            className="pointer-events-none absolute left-0 top-0"
            width={contentWidth}
            height={bodyHeight}
            style={{ zIndex: 4, overflow: "visible" }}
          >
            <line
              x1={connectDrag.startX}
              y1={connectDrag.startY}
              x2={connectDrag.cursorX}
              y2={connectDrag.cursorY}
              stroke="rgb(var(--primary))"
              strokeWidth={2}
              strokeDasharray="4 4"
              strokeLinecap="round"
            />
            <circle
              cx={connectDrag.cursorX}
              cy={connectDrag.cursorY}
              r={4}
              fill="rgb(var(--primary))"
            />
          </svg>
        )}
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
