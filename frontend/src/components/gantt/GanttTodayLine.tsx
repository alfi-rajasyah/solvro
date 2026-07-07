import { type ViewMode, positionFor, startOfDay } from "@/lib/gantt/geometry";

interface GanttTodayLineProps {
  chartStart: Date;
  chartEnd: Date;
  viewMode: ViewMode;
  columnWidth: number;
  bodyHeight: number;
}

export function GanttTodayLine({
  chartStart,
  chartEnd,
  viewMode,
  columnWidth,
  bodyHeight,
}: GanttTodayLineProps) {
  const today = startOfDay(new Date());
  if (today < chartStart || today > chartEnd) return null;
  const { x, width } = positionFor(today, chartStart, viewMode, columnWidth);
  const centerX = x + width / 2;
  return (
    <div
      className="pointer-events-none absolute top-0"
      style={{ left: centerX - 1, width: 2, height: bodyHeight, zIndex: 5 }}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-primary" />
    </div>
  );
}
