import type { Priority, TaskStatus } from "@/lib/queries";

// Single source of truth for Gantt bar colors. The UI applies these via
// Tailwind classes (see GanttBar.tsx); the Excel/PDF exports read the hex
// values directly so output matches what the user sees on screen.

export const STATUS_FILL_HEX: Record<TaskStatus, string> = {
  TODO: "#bae6fd",        // sky-200
  IN_PROGRESS: "#60a5fa", // blue-400
  DONE: "#34d399",        // emerald-400
};

export const PRIORITY_BORDER_HEX: Record<Priority, string> = {
  LOW: "#94a3b8",     // slate-400
  MEDIUM: "#3b82f6",  // blue-500
  HIGH: "#f59e0b",    // amber-500
  URGENT: "#ef4444",  // red-500
};

export const WEEKEND_HEX = "#e2e8f0";  // slate-200, very subtle
export const HOLIDAY_HEX = "#fecaca";  // rose-200
export const TODAY_HEX = "#3aae51";    // primary green — Gantt v2 today line/pill

// Neutral fallback for tasks/sections without a Section.color. Mirrors the
// `--phase` CSS fallback in index.css and geometry.ts's DEFAULT_SECTION_COLOR.
export const DEFAULT_SECTION_COLOR = "#94a3b8"; // slate-400

// Opacity used for the "track" portion of a bar (unfilled progress) —
// the base bar renders at this opacity over the section color, and the
// progress fill renders solid from the left up to progressPct.
export const BAR_TRACK_OPACITY = 0.28;

export type ColorByMode = "status" | "section" | "priority";

// Single fill resolver for live bars AND both exports — keeps the screen and
// generated documents in agreement whichever mode is active. TaskStatus and
// Priority are already imported at the top of this file, and the two Records
// are strictly keyed — hence the enum-typed opts (not string).
export function barFillHex(
  opts: {
    status?: TaskStatus | null;
    priority?: Priority | null;
    sectionColor?: string | null;
  },
  mode: ColorByMode,
): string {
  if (mode === "status") return STATUS_FILL_HEX[opts.status ?? "TODO"];
  if (mode === "priority") return PRIORITY_BORDER_HEX[opts.priority ?? "MEDIUM"];
  return opts.sectionColor ?? DEFAULT_SECTION_COLOR;
}

export function legendEntries(mode: ColorByMode): Array<[string, string]> {
  if (mode === "status") {
    return [
      ["To Do", STATUS_FILL_HEX.TODO],
      ["In Progress", STATUS_FILL_HEX.IN_PROGRESS],
      ["Done", STATUS_FILL_HEX.DONE],
    ];
  }
  if (mode === "priority") {
    return [
      ["Low", PRIORITY_BORDER_HEX.LOW],
      ["Medium", PRIORITY_BORDER_HEX.MEDIUM],
      ["High", PRIORITY_BORDER_HEX.HIGH],
      ["Urgent", PRIORITY_BORDER_HEX.URGENT],
    ];
  }
  // Section mode: the colored dots on section rows are the legend.
  return [];
}

// Preset swatches for the section color picker (Task 6). First entry is the
// schema default. Curated set that reads on both light and dark surfaces.
export const SECTION_COLOR_PRESETS = [
  "#94a3b8", // slate (default)
  "#3b82f6", // blue
  "#0ea5e9", // sky
  "#14b8a6", // teal
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // rose
  "#8b5cf6", // violet
] as const;
