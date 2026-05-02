import type { Section, Task } from "@/lib/queries";

export type ViewMode = "day" | "week" | "month";
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
  collapsed?: boolean;
  task?: Task;
  status?: Task["status"];
  priority?: Task["priority"];
}

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
  }
  return startOfDay(addDays(chartStart, Math.round(days)));
}

export interface Column {
  date: Date;
  isWeekend: boolean;
  weekNumber?: number;
  monthLabel?: string;
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

  const sortedSections = [...sections].sort(
    (a, b) => a.position - b.position || a.id - b.id,
  );

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
    rows.push({
      id: rowId,
      kind: "section",
      depth: 0,
      name,
      start,
      end,
      parentRowId: null,
      sectionId,
      collapsed: isCollapsed,
    });
    if (isCollapsed || group.length === 0) return;

    const parents = group.filter((t) => t.parentTaskId === null);
    const childrenByParent = new Map<number, Task[]>();
    for (const t of group) {
      if (t.parentTaskId !== null) {
        const arr = childrenByParent.get(t.parentTaskId) ?? [];
        arr.push(t);
        childrenByParent.set(t.parentTaskId, arr);
      }
    }
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
        task: p,
        status: p.status,
        priority: p.priority,
      });
      for (const c of childrenByParent.get(p.id) ?? []) {
        rows.push({
          id: `task-${c.id}`,
          kind: "subtask",
          depth: 2,
          name: c.title,
          start: c.startDate ? parseISODate(c.startDate) : null,
          end: c.dueDate ? parseISODate(c.dueDate) : null,
          parentRowId: `task-${p.id}`,
          taskId: c.id,
          sectionId,
          task: c,
          status: c.status,
          priority: c.priority,
        });
      }
    }
    for (const t of group) {
      if (t.parentTaskId !== null && !parents.some((p) => p.id === t.parentTaskId)) {
        rows.push({
          id: `task-${t.id}`,
          kind: "subtask",
          depth: 2,
          name: t.title,
          start: t.startDate ? parseISODate(t.startDate) : null,
          end: t.dueDate ? parseISODate(t.dueDate) : null,
          parentRowId: rowId,
          taskId: t.id,
          sectionId,
          task: t,
          status: t.status,
          priority: t.priority,
        });
      }
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
