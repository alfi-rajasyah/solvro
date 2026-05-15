import { useMemo, useState } from "react";
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
  /**
   * When provided, connectors become hover-highlightable and show an
   * inline × to delete them. Omitted for read-only users.
   */
  onDeleteDependency?: (id: number) => void;
}

interface Connector {
  id: number;
  type: "HARD" | "SOFT";
  /** Stepped path, ready for an SVG `<path d>`. */
  d: string;
  /**
   * Same route as `d` but trimmed back from both bar edges, used for the
   * transparent pointer hit path. Keeps the fat (14px) hit strip clear of
   * the bars' resize handles + connector dots at each end so it doesn't
   * shadow those interactions. `null` when the connector is too short to
   * trim — then the hit path falls back to the full route.
   */
  dHit: string | null;
  /** Coords of the arrowhead tip (used by the marker). */
  tipX: number;
  tipY: number;
  /** Anchor for the × delete control — midpoint of the path's main run. */
  ax: number;
  ay: number;
}

const FORWARD_NUDGE = 8; // horizontal step out from the predecessor's right edge
const BACK_NUDGE = 8;    // horizontal step into the successor's left edge
const ARROW_INSET = 2;   // pull the tip back so the arrowhead doesn't overshoot
// Arc-length trimmed off each end of the hit path. Clears the 6px resize
// handle + the ~12px connector dot at each bar edge (plus margin) so the
// fat hit strip can't intercept resize/connect pointer-downs.
const HIT_TRIM = 14;

type Pt = [number, number];

function polylineToPath(pts: Pt[]): string {
  if (pts.length === 0) return "";
  const [h, ...rest] = pts;
  return `M ${h[0]} ${h[1]}` + rest.map((p) => ` L ${p[0]} ${p[1]}`).join("");
}

/**
 * Trim `trim` px of arc length off both ends of an axis-aligned polyline,
 * keeping interior vertices. Returns null if the polyline is too short to
 * trim from both ends (caller falls back to the untrimmed route).
 */
function trimPolyline(pts: Pt[], trim: number): Pt[] | null {
  const n = pts.length;
  if (n < 2) return null;
  const cum: number[] = [0];
  for (let i = 1; i < n; i++) {
    cum.push(
      cum[i - 1] +
        Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]),
    );
  }
  const total = cum[n - 1];
  if (total <= 2 * trim + 1) return null;
  const at = (s: number): Pt => {
    let i = 1;
    while (i < n && cum[i] < s) i++;
    const segStart = cum[i - 1];
    const segEnd = cum[i];
    const t = segEnd === segStart ? 0 : (s - segStart) / (segEnd - segStart);
    return [
      pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
      pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t,
    ];
  };
  const a = trim;
  const b = total - trim;
  const mid: Pt[] = [];
  for (let i = 0; i < n; i++) {
    if (cum[i] > a && cum[i] < b) mid.push(pts[i]);
  }
  return [at(a), ...mid, at(b)];
}

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
  onDeleteDependency,
}: GanttConnectorsProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);

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
      let points: Pt[];
      let ax: number;
      let ay: number;
      if (tx >= sx + FORWARD_NUDGE) {
        const midX = Math.max(sx + FORWARD_NUDGE, tx - BACK_NUDGE);
        points = [
          [sx, sy],
          [midX, sy],
          [midX, ty],
          [tx, ty],
        ];
        // × sits on the vertical run between the two rows.
        ax = midX;
        ay = (sy + ty) / 2;
      } else {
        const out1 = sx + FORWARD_NUDGE;
        const back = tx - BACK_NUDGE;
        // Use successor row band's vertical buffer (above/below) so the
        // back-route doesn't overlap the source bar.
        const detourY = ty + (ty < sy ? ROW_HEIGHT / 2 : -ROW_HEIGHT / 2);
        points = [
          [sx, sy],
          [out1, sy],
          [out1, detourY],
          [back, detourY],
          [back, ty],
          [tx, ty],
        ];
        // × sits on the final vertical run into the successor.
        ax = back;
        ay = (detourY + ty) / 2;
      }

      const trimmed = trimPolyline(points, HIT_TRIM);
      out.push({
        id: dep.id,
        type: dep.type,
        d: polylineToPath(points),
        dHit: trimmed ? polylineToPath(trimmed) : null,
        tipX: tx,
        tipY: ty,
        ax,
        ay,
      });
    }
    return out;
  }, [rows, chartStart, viewMode, columnWidth, dependencies]);

  if (connectors.length === 0) return null;

  const interactive = !!onDeleteDependency;

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={contentWidth}
      height={bodyHeight}
      style={{ zIndex: 5, overflow: "visible" }}
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
        {connectors.map((c) => {
          const hovered = interactive && hoveredId === c.id;
          return (
            <g
              key={c.id}
              onMouseEnter={
                interactive ? () => setHoveredId(c.id) : undefined
              }
              onMouseLeave={
                interactive
                  ? () =>
                      setHoveredId((prev) => (prev === c.id ? null : prev))
                  : undefined
              }
            >
              <path
                d={c.d}
                stroke="currentColor"
                strokeWidth={hovered ? 2.5 : 1.5}
                strokeDasharray={c.type === "SOFT" ? "5 4" : undefined}
                fill="none"
                opacity={hovered ? 1 : 0.85}
                markerEnd="url(#gantt-conn-arrow)"
              />
              {interactive && (
                <path
                  d={c.dHit ?? c.d}
                  stroke="transparent"
                  strokeWidth={14}
                  fill="none"
                  style={{ pointerEvents: "stroke", cursor: "pointer" }}
                />
              )}
              {hovered && (
                <g
                  role="button"
                  aria-label="Delete dependency"
                  tabIndex={0}
                  style={{ pointerEvents: "all", cursor: "pointer" }}
                  onClick={() => onDeleteDependency?.(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onDeleteDependency?.(c.id);
                    }
                  }}
                >
                  <title>Delete dependency</title>
                  <circle
                    cx={c.ax}
                    cy={c.ay}
                    r={8}
                    fill="rgb(var(--primary))"
                    stroke="white"
                    strokeWidth={1.5}
                  />
                  <path
                    d={`M ${c.ax - 3} ${c.ay - 3} L ${c.ax + 3} ${c.ay + 3} M ${c.ax - 3} ${c.ay + 3} L ${c.ax + 3} ${c.ay - 3}`}
                    stroke="white"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    fill="none"
                  />
                </g>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
