// Left (task table) pane layout. The pane itself is user-resizable (see
// GanttFrame's `listPaneWidth` state) — these are just the fixed sub-column
// widths and the starting/min/max bounds for the draggable divider.
export const AVATAR_COL_WIDTH = 22;
export const NAME_COL_WIDTH = 220;
export const DATE_RANGE_COL_WIDTH = 92;
export const ROW_PAD_X = 8;
export const DEFAULT_LIST_PANE_WIDTH =
  AVATAR_COL_WIDTH + NAME_COL_WIDTH + DATE_RANGE_COL_WIDTH + ROW_PAD_X * 3;
export const MIN_LIST_PANE_WIDTH = 180;
export const MAX_LIST_PANE_WIDTH = 560;
export const DIVIDER_WIDTH = 4;

export const AXIS_HEIGHT = 44;
export const ROW_HEIGHT = 30;
export const BAR_HEIGHT = 14;
export const RESIZE_HANDLE_PX = 6;
export const MILESTONE_SIZE = 12;

export const COLUMN_MIN_WIDTH = { day: 36, week: 80, month: 120, quarter: 160 } as const;
// Fixed rendered column width per view mode. The chart always uses
// these values — never stretches to fit. This guarantees horizontal
// scroll on any project longer than the viewport, and avoids the
// pathological case where natural-content-width happens to land at
// (available ± a few px) and silently collapses the chart.
export const COLUMN_DEFAULT_WIDTH = { day: 60, week: 140, month: 220, quarter: 260 } as const;
