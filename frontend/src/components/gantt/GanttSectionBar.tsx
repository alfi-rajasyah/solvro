import { type Row, type ViewMode, addDays, positionFor } from "@/lib/gantt/geometry";
import { ROW_HEIGHT } from "@/lib/gantt/constants";

interface GanttSectionBarProps {
  row: Row;
  chartStart: Date;
  viewMode: ViewMode;
  columnWidth: number;
}

export function GanttSectionBar({
  row,
  chartStart,
  viewMode,
  columnWidth,
}: GanttSectionBarProps) {
  if (!row.start || !row.end) return null;
  const left = positionFor(row.start, chartStart, viewMode, columnWidth).x;
  const endPos = positionFor(addDays(row.end, 1), chartStart, viewMode, columnWidth).x;
  const width = Math.max(8, endPos - left);
  const lineColor = "#1f2937"; // slate-800
  const lineY = ROW_HEIGHT / 2 - 1;
  const capH = 6;

  return (
    <div
      className="pointer-events-none absolute"
      style={{ left, top: 0, width, height: ROW_HEIGHT, zIndex: 2 }}
      aria-hidden="true"
    >
      <div
        className="absolute"
        style={{
          left: 0,
          top: lineY,
          width,
          height: 2,
          background: lineColor,
        }}
      />
      <div
        className="absolute"
        style={{
          left: 0,
          top: lineY,
          width: 2,
          height: capH,
          background: lineColor,
        }}
      />
      <div
        className="absolute"
        style={{
          left: width - 2,
          top: lineY,
          width: 2,
          height: capH,
          background: lineColor,
        }}
      />
    </div>
  );
}
