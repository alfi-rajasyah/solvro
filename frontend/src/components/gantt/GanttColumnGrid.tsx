import { useMemo } from "react";
import {
  type Column,
  type ViewMode,
  iterColumns,
  positionFor,
  startOfDay,
} from "@/lib/gantt/geometry";
import type { Holiday } from "@/lib/queries";

interface GanttColumnGridProps {
  chartStart: Date;
  chartEnd: Date;
  viewMode: ViewMode;
  columnWidth: number;
  contentWidth: number;
  bodyHeight: number;
  holidays: Holiday[];
}

const DAY_MS = 1000 * 60 * 60 * 24;

export function GanttColumnGrid({
  chartStart,
  chartEnd,
  viewMode,
  columnWidth,
  contentWidth,
  bodyHeight,
  holidays,
}: GanttColumnGridProps) {
  const columns: Column[] = useMemo(
    () => iterColumns(chartStart, chartEnd, viewMode),
    [chartStart, chartEnd, viewMode],
  );

  const dayMarkers = useMemo(() => {
    const out: { x: number; width: number; kind: "weekend" | "holiday"; key: string; title?: string }[] = [];
    const holidayByDate = new Map(holidays.map((h) => [h.date, h]));
    const cursor = startOfDay(new Date(chartStart));
    const end = startOfDay(new Date(chartEnd));
    while (cursor <= end) {
      const day = cursor.getDay();
      const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
      const holiday = holidayByDate.get(iso);
      const { x, width } = positionFor(cursor, chartStart, viewMode, columnWidth);
      if (holiday) {
        out.push({
          x,
          width,
          kind: "holiday",
          key: `h-${iso}`,
          title: `${holiday.name} — ${iso}`,
        });
      } else if (day === 0 || day === 6) {
        out.push({ x, width, kind: "weekend", key: `w-${iso}` });
      }
      cursor.setTime(cursor.getTime() + DAY_MS);
    }
    return out;
  }, [chartStart, chartEnd, viewMode, columnWidth, holidays]);

  return (
    <div
      className="absolute inset-0"
      style={{ width: contentWidth, height: bodyHeight, zIndex: 0 }}
      aria-hidden="true"
    >
      {columns.map((_, i) => (
        <div
          key={i}
          className="absolute top-0 border-r border-outline-variant/40"
          style={{
            left: i * columnWidth,
            width: columnWidth,
            height: bodyHeight,
          }}
        />
      ))}
      {dayMarkers.map((m) => (
        <div
          key={m.key}
          title={m.title}
          className={
            m.kind === "weekend"
              ? "absolute top-0 bg-slate-900/[0.04]"
              : "absolute top-0 bg-rose-500/10"
          }
          style={{
            left: m.x,
            width: m.width,
            height: bodyHeight,
            mixBlendMode: "multiply",
          }}
        />
      ))}
    </div>
  );
}
