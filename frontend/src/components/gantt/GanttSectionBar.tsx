import { ROW_HEIGHT } from "@/lib/gantt/constants";
import { DEFAULT_SECTION_COLOR } from "@/lib/gantt/palette";

interface GanttSectionBandProps {
  color?: string;
  contentWidth: number;
}

/**
 * Full-width, very subtle section-color tint behind a section header row —
 * matches the mockup's `rgba(color, .06)` row bands (see docs/mockups
 * "2 · Gantt v2"). Purely decorative.
 */
export function GanttSectionBand({ color, contentWidth }: GanttSectionBandProps) {
  const hex = color ?? DEFAULT_SECTION_COLOR;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
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
