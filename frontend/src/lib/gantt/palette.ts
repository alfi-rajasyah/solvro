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
