import { ROW_HEIGHT } from "@/lib/gantt/constants";
import { DEFAULT_SECTION_COLOR } from "@/lib/gantt/palette";
import { addDays, positionFor, type Row, type ViewMode } from "@/lib/gantt/geometry";

interface GanttSectionBandProps {
  color?: string;
  contentWidth: number;
}

// Shared by GanttSectionBand and GanttSectionSummaryBar — both need an rgba()
// derived from the section's resolved hex (band at low tint, summary pill at
// near-solid opacity).
function hexToRgbTuple(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * Full-width, very subtle section-color tint behind a section header row —
 * matches the mockup's `rgba(color, .06)` row bands (see docs/mockups
 * "2 · Gantt v2"). Purely decorative.
 */
export function GanttSectionBand({ color, contentWidth }: GanttSectionBandProps) {
  const hex = color ?? DEFAULT_SECTION_COLOR;
  const [r, g, b] = hexToRgbTuple(hex);
  return (
    <div
      className="pointer-events-none absolute inset-y-0 left-0"
      style={{
        width: contentWidth,
        height: ROW_HEIGHT,
        backgroundColor: `rgba(${r}, ${g}, ${b}, 0.07)`,
      }}
      aria-hidden="true"
    />
  );
}

interface GanttSectionSummaryBarProps {
  row: Row;
  chartStart: Date;
  viewMode: ViewMode;
  columnWidth: number;
}

const SUMMARY_BAR_HEIGHT = 6;
const SUMMARY_BAR_OPACITY = 0.85;

/**
 * Rollup pill on a section header row spanning the date range of its
 * children — `row.start`/`row.end`, computed by geometry's `rangeFor` inside
 * `pushGroup` before the collapsed early-return, so this renders for
 * collapsed sections too (that's when it's most useful — the child bars
 * themselves aren't visible). Sections with no dated children (`start`/`end`
 * null, e.g. an empty section) render nothing. Same coordinate space as
 * GanttBar's task bars; min width matches GanttBar's `columnWidth / 7` floor
 * so a single-day span stays visible.
 */
export function GanttSectionSummaryBar({
  row,
  chartStart,
  viewMode,
  columnWidth,
}: GanttSectionSummaryBarProps) {
  if (!row.start || !row.end) return null;
  const hex = row.sectionColor ?? DEFAULT_SECTION_COLOR;
  const [r, g, b] = hexToRgbTuple(hex);
  const left = positionFor(row.start, chartStart, viewMode, columnWidth).x;
  const endPos = positionFor(addDays(row.end, 1), chartStart, viewMode, columnWidth).x;
  const width = Math.max(columnWidth / 7, endPos - left);
  const top = (ROW_HEIGHT - SUMMARY_BAR_HEIGHT) / 2;
  return (
    <div
      className="pointer-events-none absolute rounded-full"
      style={{
        left,
        width,
        top,
        height: SUMMARY_BAR_HEIGHT,
        backgroundColor: `rgba(${r}, ${g}, ${b}, ${SUMMARY_BAR_OPACITY})`,
        zIndex: 2,
      }}
      aria-hidden="true"
    />
  );
}
