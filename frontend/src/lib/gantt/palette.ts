import type { Priority, Section, TaskStatus } from "@/lib/queries";

// Single source of truth for Gantt bar colors. The UI applies these via
// inline styles (see GanttBar.tsx); the Excel/PDF exports read the hex
// values directly so output matches what the user sees on screen.

export const STATUS_FILL_HEX: Record<TaskStatus, string> = {
  TODO: "#94a3b8",        // slate-400 — visibly "not started", solid
  IN_PROGRESS: "#3b82f6", // blue-500
  DONE: "#10b981",        // emerald-500
};

export const PRIORITY_BORDER_HEX: Record<Priority, string> = {
  LOW: "#64748b",     // slate-500 — distinct from TODO-status slate-400
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

// Bars render solid in their resolved Color-by color. Progress is shown as a
// darker overlay (black at this opacity) anchored to the left edge, covering
// the completed portion of the bar — only drawn when 0% < progress < 100%,
// so not-yet-started and fully-done bars stay clean solid fills.
export const PROGRESS_OVERLAY_ALPHA = 0.28;

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

// Preset swatches for the section color picker (Task 6). Vivid, dark+light-safe
// set. Deliberately omits slate `#94a3b8`: that hex stays the Section.color
// schema default (backend untouched) and is treated as the "never customized"
// sentinel — geometry.ts's fallback resolution keys on it to assign one of
// these presets deterministically. Excluding it from the picker means an
// explicit user pick can never collide with the sentinel. Order matters: it
// is also the fallback cycling order.
export const SECTION_COLOR_PRESETS = [
  "#8b5cf6", // violet
  "#14b8a6", // teal
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#f43f5e", // rose
  "#0ea5e9", // sky
  "#10b981", // emerald
  "#d946ef", // fuchsia
] as const;

// Single resolution point for section colors, shared by geometry.ts's
// buildRows and the toolbar legend so the two can never disagree. Sections
// whose stored color is missing or still the schema-default slate sentinel
// (#94a3b8) have never been through the color picker and get a vivid preset
// assigned deterministically by (position, id) order; explicit picks always
// win — the sentinel is excluded from SECTION_COLOR_PRESETS so a user pick
// can never collide with it.
export function resolveSectionColors(
  sections: ReadonlyArray<Pick<Section, "id" | "position" | "color">>,
): Map<number, string> {
  const sorted = [...sections].sort((a, b) => a.position - b.position || a.id - b.id);
  const map = new Map<number, string>();
  sorted.forEach((s, index) => {
    const stored = s.color?.trim();
    const isUnset = !stored || stored.toLowerCase() === DEFAULT_SECTION_COLOR.toLowerCase();
    map.set(
      s.id,
      isUnset ? SECTION_COLOR_PRESETS[index % SECTION_COLOR_PRESETS.length] : stored,
    );
  });
  return map;
}

export function legendEntries(
  mode: ColorByMode,
  sections: ReadonlyArray<Pick<Section, "id" | "name" | "position" | "color">> = [],
): Array<[string, string]> {
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
  // Section mode: one entry per section in board order, resolved through the
  // same fallback cycling the bars use.
  const colors = resolveSectionColors(sections);
  return [...sections]
    .sort((a, b) => a.position - b.position || a.id - b.id)
    .map((s): [string, string] => [s.name, colors.get(s.id) ?? DEFAULT_SECTION_COLOR]);
}
