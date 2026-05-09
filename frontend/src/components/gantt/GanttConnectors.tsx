import { useMemo } from "react";
import { ROW_HEIGHT } from "@/lib/gantt/constants";
import { type Row, type ViewMode, addDays, positionFor } from "@/lib/gantt/geometry";
import type { TaskDependency } from "@/lib/queries";

interface GanttConnectorsProps {
  rows: Row[];
  chartStart: Date;
  viewMode: ViewMode;
  columnWidth: number;
  contentWidth: number;
  bodyHeight: number;
  dependencies: TaskDependency[];
}

interface Connector {
  id: number;
  type: "HARD" | "SOFT";
  /** Stepped path, ready for an SVG `<path d>`. */
  d: string;
  /** Coords of the arrowhead tip (used by the marker). */
  tipX: number;
  tipY: number;
}

const FORWARD_NUDGE = 8; // horizontal step out from the predecessor's right edge
const BACK_NUDGE = 8;    // horizontal step into the successor's left edge
const ARROW_INSET = 2;   // pull the tip back so the arrowhead doesn't overshoot

/**
 * Per-row Y center (rows are stacked top-to-bottom at fixed ROW_HEIGHT).
 * Returns null when the row isn't currently visible (e.g. its section
 * is collapsed and the task row was filtered out by buildRows).
 */
function rowCenterY(rows: Row[], taskId: number): number | null {
  const idx = rows.findIndex((r) => r.taskId === taskId);
  if (idx < 0) return null;
  return idx * ROW_HEIGHT + ROW_HEIGHT / 2;
}

/**
 * X position of the right edge of a task's bar. Mirrors the Gantt's
 * "render from start to dueDate INCLUSIVE" convention by treating the
 * day after dueDate as the bar's right edge.
 */
function barRightX(
  row: Row,
  chartStart: Date,
  viewMode: ViewMode,
  columnWidth: number,
): number | null {
  if (!row.end) return null;
  const after = addDays(row.end, 1);
  return positionFor(after, chartStart, viewMode, columnWidth).x;
}

function barLeftX(
  row: Row,
  chartStart: Date,
  viewMode: ViewMode,
  columnWidth: number,
): number | null {
  if (!row.start) return null;
  return positionFor(row.start, chartStart, viewMode, columnWidth).x;
}

export function GanttConnectors({
  rows,
  chartStart,
  viewMode,
  columnWidth,
  contentWidth,
  bodyHeight,
  dependencies,
}: GanttConnectorsProps) {
  const connectors = useMemo<Connector[]>(() => {
    const rowByTask = new Map<number, Row>();
    for (const r of rows) {
      if (r.taskId !== undefined) rowByTask.set(r.taskId, r);
    }

    const out: Connector[] = [];
    for (const dep of dependencies) {
      const predRow = rowByTask.get(dep.predecessorTaskId);
      const succRow = rowByTask.get(dep.successorTaskId);
      if (!predRow || !succRow) continue;

      const predRight = barRightX(predRow, chartStart, viewMode, columnWidth);
      const succLeft = barLeftX(succRow, chartStart, viewMode, columnWidth);
      const predY = rowCenterY(rows, dep.predecessorTaskId);
      const succY = rowCenterY(rows, dep.successorTaskId);
      if (predRight == null || succLeft == null || predY == null || succY == null) continue;

      // Stepped path: out of predecessor right → vertical to successor row →
      // approach the successor's left edge with a small back-nudge so the
      // arrowhead lands neatly on the bar.
      const sx = predRight;
      const sy = predY;
      const tx = succLeft - ARROW_INSET;
      const ty = succY;

      // If the successor is to the right of the predecessor, we route
      // forward → vertical → forward. If it's behind (or directly above),
      // route forward → up/down → backward → over → forward.
      let pathD: string;
      if (tx >= sx + FORWARD_NUDGE) {
        const midX = Math.max(sx + FORWARD_NUDGE, tx - BACK_NUDGE);
        pathD = `M ${sx} ${sy} H ${midX} V ${ty} H ${tx}`;
      } else {
        const out1 = sx + FORWARD_NUDGE;
        const back = tx - BACK_NUDGE;
        // Use successor row band's vertical buffer (above/below) so the
        // back-route doesn't overlap the source bar.
        const detourY = ty + (ty < sy ? ROW_HEIGHT / 2 : -ROW_HEIGHT / 2);
        pathD = `M ${sx} ${sy} H ${out1} V ${detourY} H ${back} V ${ty} H ${tx}`;
      }

      out.push({ id: dep.id, type: dep.type, d: pathD, tipX: tx, tipY: ty });
    }
    return out;
  }, [rows, chartStart, viewMode, columnWidth, dependencies]);

  if (connectors.length === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={contentWidth}
      height={bodyHeight}
      style={{ zIndex: 2 }}
    >
      <defs>
        <marker
          id="gantt-conn-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
        </marker>
      </defs>
      <g style={{ color: "rgb(var(--primary))" }}>
        {connectors.map((c) => (
          <path
            key={c.id}
            d={c.d}
            stroke="currentColor"
            strokeWidth={1.5}
            strokeDasharray={c.type === "SOFT" ? "5 4" : undefined}
            fill="none"
            opacity={0.85}
            markerEnd="url(#gantt-conn-arrow)"
          />
        ))}
      </g>
    </svg>
  );
}
