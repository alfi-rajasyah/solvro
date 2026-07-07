import type { Section, Task } from "@/lib/queries";

export type ViewMode = "day" | "week" | "month" | "quarter";
export type RowKind = "section" | "task" | "subtask";

export interface Row {
  id: string;
  kind: RowKind;
  depth: 0 | 1 | 2;
  name: string;
  start: Date | null;
  end: Date | null;
  parentRowId: string | null;
  taskId?: number;
  sectionId: number | null;
  /** Hex color for this row's section band / bar fill. Neutral default when unset. */
  sectionColor?: string;
  collapsed?: boolean;
  task?: Task;
  status?: Task["status"];
  priority?: Task["priority"];
  /** True when the task has only a due date, or startDate === dueDate. */
  isMilestone?: boolean;
  /** 0-100. DONE tasks are 100; parents with subtasks use done/total; else 0. */
  progressPct?: number;
}

// Neutral fallback color for tasks/sections without an explicit color —
// matches the `--phase` CSS fallback used elsewhere in the app (index.css).
export const DEFAULT_SECTION_COLOR = "#94a3b8";

const DAY_MS = 1000 * 60 * 60 * 24;

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("T")[0].split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// Encode a local-timezone Date as the ISO string for UTC midnight on the same
// calendar date. Plain `startOfDay(d).toISOString()` would shift the date
// backward in any positive-UTC timezone (e.g. local 2026-05-15T00:00:00+07:00
// → 2026-05-14T17:00:00Z), and parseISODate splits on "T" so the round-trip
// would silently lose a day. UTC midnight round-trips losslessly.
export function toUtcMidnightISO(d: Date): string {
  return new Date(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()),
  ).toISOString();
}

export function startOfMondayWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay();
  const offsetToMonday = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - offsetToMonday);
  return x;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function startOfQuarter(d: Date): Date {
  const qMonth = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), qMonth, 1);
}

export function quarterNumber(d: Date): number {
  return Math.floor(d.getMonth() / 3) + 1;
}

export function isoWeekNumber(d: Date): number {
  const target = startOfDay(d);
  target.setDate(target.getDate() + 4 - (target.getDay() || 7));
  const yearStart = new Date(target.getFullYear(), 0, 1);
  return Math.ceil(((target.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
}

// Default padding around the project's actual task range, so the timeline
// renders at least 1 year before the earliest task and 1 year after the
// latest task. Each side is then snapped to the appropriate unit boundary
// for the current view mode.
const PAD_YEARS = 1;

export function computeChartStart(min: Date, mode: ViewMode): Date {
  const padded = new Date(min);
  padded.setFullYear(padded.getFullYear() - PAD_YEARS);
  switch (mode) {
    case "day":
      return startOfDay(padded);
    case "week":
      return startOfMondayWeek(padded);
    case "month":
      return new Date(padded.getFullYear(), padded.getMonth(), 1);
    case "quarter":
      return startOfQuarter(padded);
  }
}

export function computeChartEnd(max: Date, mode: ViewMode): Date {
  const padded = new Date(max);
  padded.setFullYear(padded.getFullYear() + PAD_YEARS);
  switch (mode) {
    case "day":
      return addDays(startOfDay(padded), 1);
    case "week":
      return addDays(startOfMondayWeek(padded), 7);
    case "month":
      return new Date(padded.getFullYear(), padded.getMonth() + 1, 1);
    case "quarter": {
      const qStart = startOfQuarter(padded);
      return new Date(qStart.getFullYear(), qStart.getMonth() + 3, 1);
    }
  }
}

export function positionFor(
  date: Date,
  chartStart: Date,
  mode: ViewMode,
  colW: number,
): { x: number; width: number } {
  const days = (date.getTime() - chartStart.getTime()) / DAY_MS;
  switch (mode) {
    case "day":
      return { x: days * colW, width: colW };
    case "week":
      return { x: (days / 7) * colW, width: colW / 7 };
    case "month": {
      const months =
        (date.getFullYear() - chartStart.getFullYear()) * 12 +
        (date.getMonth() - chartStart.getMonth());
      const daysInMonth = new Date(
        date.getFullYear(),
        date.getMonth() + 1,
        0,
      ).getDate();
      const dayOffset = (date.getDate() - 1) / daysInMonth;
      return {
        x: (months + dayOffset) * colW,
        width: colW / daysInMonth,
      };
    }
    case "quarter": {
      const qStart = startOfQuarter(chartStart);
      const monthsFromChartQStart =
        (date.getFullYear() - qStart.getFullYear()) * 12 +
        (date.getMonth() - qStart.getMonth());
      const quarters = monthsFromChartQStart / 3;
      const quartersWhole = Math.floor(quarters);
      const thisQStart = new Date(
        qStart.getFullYear(),
        qStart.getMonth() + quartersWhole * 3,
        1,
      );
      const nextQStart = new Date(
        thisQStart.getFullYear(),
        thisQStart.getMonth() + 3,
        1,
      );
      const daysInQuarter =
        (nextQStart.getTime() - thisQStart.getTime()) / DAY_MS;
      const dayOffset =
        (date.getTime() - thisQStart.getTime()) / DAY_MS / daysInQuarter;
      return {
        x: (quartersWhole + dayOffset) * colW,
        width: colW / daysInQuarter,
      };
    }
  }
}

export function dateFromX(
  x: number,
  chartStart: Date,
  mode: ViewMode,
  colW: number,
): Date {
  let days: number;
  switch (mode) {
    case "day":
      days = x / colW;
      break;
    case "week":
      days = (x / colW) * 7;
      break;
    case "month": {
      const monthsExact = x / colW;
      const wholeMonths = Math.floor(monthsExact);
      const frac = monthsExact - wholeMonths;
      const monthStart = new Date(
        chartStart.getFullYear(),
        chartStart.getMonth() + wholeMonths,
        1,
      );
      const daysInMonth = new Date(
        monthStart.getFullYear(),
        monthStart.getMonth() + 1,
        0,
      ).getDate();
      const result = addDays(monthStart, Math.round(frac * daysInMonth));
      return startOfDay(result);
    }
    case "quarter": {
      const qStart = startOfQuarter(chartStart);
      const quartersExact = x / colW;
      const wholeQuarters = Math.floor(quartersExact);
      const frac = quartersExact - wholeQuarters;
      const thisQStart = new Date(
        qStart.getFullYear(),
        qStart.getMonth() + wholeQuarters * 3,
        1,
      );
      const nextQStart = new Date(
        thisQStart.getFullYear(),
        thisQStart.getMonth() + 3,
        1,
      );
      const daysInQuarter =
        (nextQStart.getTime() - thisQStart.getTime()) / DAY_MS;
      const result = addDays(thisQStart, Math.round(frac * daysInQuarter));
      return startOfDay(result);
    }
  }
  return startOfDay(addDays(chartStart, Math.round(days)));
}

export interface Column {
  date: Date;
  isWeekend: boolean;
  weekNumber?: number;
  monthLabel?: string;
  quarterNumber?: number;
}

export function iterColumns(
  chartStart: Date,
  chartEnd: Date,
  mode: ViewMode,
): Column[] {
  const cols: Column[] = [];
  const cur = new Date(chartStart);
  while (cur < chartEnd) {
    switch (mode) {
      case "day": {
        const d = startOfDay(cur);
        const day = d.getDay();
        cols.push({ date: d, isWeekend: day === 0 || day === 6 });
        cur.setDate(cur.getDate() + 1);
        break;
      }
      case "week": {
        const d = startOfMondayWeek(cur);
        cols.push({ date: d, isWeekend: false, weekNumber: isoWeekNumber(d) });
        cur.setDate(cur.getDate() + 7);
        break;
      }
      case "month": {
        const d = startOfMonth(cur);
        cols.push({ date: d, isWeekend: false });
        cur.setMonth(cur.getMonth() + 1);
        break;
      }
      case "quarter": {
        const d = startOfQuarter(cur);
        cols.push({ date: d, isWeekend: false, quarterNumber: quarterNumber(d) });
        cur.setMonth(cur.getMonth() + 3);
        break;
      }
    }
  }
  return cols;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function fmtDateDDMM(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  return `${dd} ${MONTHS[d.getMonth()]}`;
}

export function fmtDateRangeDDMM(start: Date | null, end: Date | null): string {
  if (!start && !end) return "—";
  if (start && !end) return fmtDateDDMM(start);
  if (!start && end) return fmtDateDDMM(end);
  return `${fmtDateDDMM(start!)} – ${fmtDateDDMM(end!)}`;
}

export function fmtMonthYear(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

interface BuildRowsOpts {
  tasks: Task[];
  sections: Section[];
  collapsed: Set<string>;
}

/**
 * Progress for a single task row: DONE tasks are always 100%. A task with
 * subtasks reports done/total across its direct children. A task with no
 * subtasks and not DONE reports 0%.
 */
function progressForTask(task: Task, childrenById: Map<number, Task[]>): number {
  if (task.status === "DONE") return 100;
  const children = childrenById.get(task.id) ?? [];
  if (children.length === 0) return 0;
  const done = children.filter((c) => c.status === "DONE").length;
  return Math.round((done / children.length) * 100);
}

function isMilestoneTask(task: Task): boolean {
  if (task.startDate && task.dueDate) {
    return parseISODate(task.startDate).getTime() === parseISODate(task.dueDate).getTime();
  }
  return Boolean(task.dueDate) && !task.startDate;
}

export function buildRows({ tasks, sections, collapsed }: BuildRowsOpts): Row[] {
  if (tasks.length === 0 && sections.length === 0) return [];

  const rows: Row[] = [];
  const bySection = new Map<number | "none", Task[]>();
  for (const t of tasks) {
    const key = t.sectionId ?? "none";
    const arr = bySection.get(key) ?? [];
    arr.push(t);
    bySection.set(key, arr);
  }

  // Global (project-wide) parent -> children map, so subtask progress roll-up
  // is correct even if a parent and child end up in different section groups
  // (shouldn't normally happen, but stay defensive).
  const childrenById = new Map<number, Task[]>();
  for (const t of tasks) {
    if (t.parentTaskId !== null) {
      const arr = childrenById.get(t.parentTaskId) ?? [];
      arr.push(t);
      childrenById.set(t.parentTaskId, arr);
    }
  }

  const sortedSections = [...sections].sort(
    (a, b) => a.position - b.position || a.id - b.id,
  );
  const colorBySection = new Map<number, string>();
  for (const s of sortedSections) colorBySection.set(s.id, s.color || DEFAULT_SECTION_COLOR);

  function rangeFor(group: Task[]): { start: Date | null; end: Date | null } {
    const stamps = group
      .flatMap((t) => [t.startDate, t.dueDate])
      .filter((d): d is string => Boolean(d))
      .map((d) => parseISODate(d).getTime());
    if (stamps.length === 0) return { start: null, end: null };
    return {
      start: new Date(Math.min(...stamps)),
      end: new Date(Math.max(...stamps)),
    };
  }

  function pushGroup(rowId: string, sectionId: number | null, name: string, group: Task[]) {
    const { start, end } = rangeFor(group);
    const isCollapsed = collapsed.has(rowId);
    const sectionColor = sectionId !== null
      ? colorBySection.get(sectionId) ?? DEFAULT_SECTION_COLOR
      : DEFAULT_SECTION_COLOR;
    rows.push({
      id: rowId,
      kind: "section",
      depth: 0,
      name,
      start,
      end,
      parentRowId: null,
      sectionId,
      sectionColor,
      collapsed: isCollapsed,
    });
    if (isCollapsed || group.length === 0) return;

    // Subtasks (parentTaskId !== null) are intentionally excluded from Gantt
    // rows — their parent bars already roll up subtask progress via
    // progressForTask, and rendering them as flat rows here (previously under
    // a "(No section)" group when a subtask's own section diverged from its
    // parent's) misrepresented the hierarchy.
    const parents = group.filter((t) => t.parentTaskId === null);
    for (const p of parents) {
      rows.push({
        id: `task-${p.id}`,
        kind: "task",
        depth: 1,
        name: p.title,
        start: p.startDate ? parseISODate(p.startDate) : null,
        end: p.dueDate ? parseISODate(p.dueDate) : null,
        parentRowId: rowId,
        taskId: p.id,
        sectionId,
        sectionColor,
        task: p,
        status: p.status,
        priority: p.priority,
        isMilestone: isMilestoneTask(p),
        progressPct: progressForTask(p, childrenById),
      });
    }
  }

  for (const s of sortedSections) {
    pushGroup(`sec-${s.id}`, s.id, s.name, bySection.get(s.id) ?? []);
  }
  if ((bySection.get("none") ?? []).length > 0) {
    pushGroup("sec-none", null, "(No section)", bySection.get("none") ?? []);
  }
  return rows;
}

export function rowsDateRange(rows: Row[]): { min: Date; max: Date } | null {
  const stamps: number[] = [];
  for (const r of rows) {
    if (r.start) stamps.push(r.start.getTime());
    if (r.end) stamps.push(r.end.getTime());
  }
  if (stamps.length === 0) return null;
  return { min: new Date(Math.min(...stamps)), max: new Date(Math.max(...stamps)) };
}
