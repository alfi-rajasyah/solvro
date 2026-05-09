import { useMemo } from "react";
import {
  type Column,
  type ViewMode,
  fmtMonthYear,
  iterColumns,
  positionFor,
  startOfDay,
} from "@/lib/gantt/geometry";
import { AXIS_HEIGHT } from "@/lib/gantt/constants";

interface GanttDateAxisProps {
  chartStart: Date;
  chartEnd: Date;
  viewMode: ViewMode;
  columnWidth: number;
  contentWidth: number;
}

export function GanttDateAxis({
  chartStart,
  chartEnd,
  viewMode,
  columnWidth,
  contentWidth,
}: GanttDateAxisProps) {
  const columns: Column[] = useMemo(
    () => iterColumns(chartStart, chartEnd, viewMode),
    [chartStart, chartEnd, viewMode],
  );

  const monthGroups = useMemo(() => {
    const groups: { label: string; start: number; span: number }[] = [];
    let cur: { label: string; start: number; span: number } | null = null;
    columns.forEach((col, i) => {
      const label = fmtMonthYear(col.date);
      if (cur && cur.label === label) {
        cur.span += 1;
      } else {
        if (cur) groups.push(cur);
        cur = { label, start: i, span: 1 };
      }
    });
    if (cur) groups.push(cur);
    return groups;
  }, [columns]);

  const halfHeight = AXIS_HEIGHT / 2;

  const today = startOfDay(new Date());
  const todayInRange = today >= chartStart && today <= chartEnd;
  const todayPos = todayInRange
    ? positionFor(today, chartStart, viewMode, columnWidth)
    : null;
  const todayCenterX = todayPos ? todayPos.x + todayPos.width / 2 : 0;

  return (
    <div
      className="sticky top-0 z-20 border-b border-outline-variant bg-surface-container-lowest"
      style={{ height: AXIS_HEIGHT, width: contentWidth }}
    >
      <div
        className="relative border-b border-outline-variant"
        style={{ height: halfHeight }}
      >
        {monthGroups.map((g, i) => (
          <div
            key={i}
            className="absolute top-0 flex h-full items-center justify-center border-r border-outline-variant/60 font-display text-[12px] font-semibold uppercase tracking-wider text-on-surface-variant"
            style={{ left: g.start * columnWidth, width: g.span * columnWidth }}
          >
            {g.label}
          </div>
        ))}
      </div>
      <div className="relative" style={{ height: halfHeight }}>
        {columns.map((col, i) => (
          <div
            key={i}
            className={[
              "absolute top-0 flex h-full items-center justify-center border-r border-outline-variant/40 text-[11px]",
              col.isWeekend ? "text-on-surface-variant/60" : "text-on-surface-variant",
            ].join(" ")}
            style={{ left: i * columnWidth, width: columnWidth }}
          >
            {viewMode === "day" && (
              <span className="font-mono">
                {String(col.date.getDate()).padStart(2, "0")}
              </span>
            )}
            {viewMode === "week" && (
              <span className="font-display font-semibold">
                W{col.weekNumber}
              </span>
            )}
            {viewMode === "month" && (
              <span className="font-display font-semibold">
                {col.date.toLocaleString(undefined, { month: "short" })}
              </span>
            )}
          </div>
        ))}
        {todayPos && (
          <div
            className="pointer-events-none absolute -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-rose-500 text-[12px] font-bold text-white shadow"
            style={{ left: todayCenterX - 14, zIndex: 6 }}
            aria-hidden="true"
          >
            {today.getDate()}
          </div>
        )}
      </div>
    </div>
  );
}
