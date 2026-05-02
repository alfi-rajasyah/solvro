export const CHECKBOX_COL_WIDTH = 32;
export const NAME_COL_WIDTH = 220;
export const DATE_COL_WIDTH = 76;
export const PCT_COL_WIDTH = 56;
export const LIST_PANE_WIDTH =
  CHECKBOX_COL_WIDTH + NAME_COL_WIDTH + DATE_COL_WIDTH * 2 + PCT_COL_WIDTH;
export const AXIS_HEIGHT = 56;
export const ROW_HEIGHT = 30;
export const BAR_HEIGHT = 18;
export const RESIZE_HANDLE_PX = 6;
export const COLUMN_MIN_WIDTH = { day: 36, week: 80, month: 120 } as const;
// Fixed rendered column width per view mode. The chart always uses
// these values — never stretches to fit. This guarantees horizontal
// scroll on any project longer than the viewport, and avoids the
// pathological case where natural-content-width happens to land at
// (available ± a few px) and silently collapses the chart.
export const COLUMN_DEFAULT_WIDTH = { day: 60, week: 140, month: 220 } as const;
