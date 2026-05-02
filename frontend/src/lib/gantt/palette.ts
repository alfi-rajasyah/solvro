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
export const TODAY_HEX = "#ef4444";    // red-500, used as a border highlight
