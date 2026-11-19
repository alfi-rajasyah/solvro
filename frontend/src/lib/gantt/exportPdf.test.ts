import { resolveObjectURL } from "node:buffer";
import { describe, expect, it } from "vitest";
import { buildTaskTable, doneWidthOnPage, exportGanttToPdf } from "./exportPdf";
import type { Row } from "./geometry";

// The chart sheet is cut to the chart's own size (see exportPdf.ts's "Page
// size follows the chart" block). These tests read the page dimensions back
// out of the produced PDF's /MediaBox entries, so a regression to a fixed A4
// chart sheet — which squeezed long projects onto the 11pt row floor — fails
// here rather than only in a rendered export.

const A4_LANDSCAPE: [number, number] = [842, 595];
const MARGIN = 24;
const HEADER_SPACE = 28;
const AXIS_H = 22;
const IDEAL_ROW_H = 18;
const IDEAL_DAY_COL_W = 18;
const LABEL_COL_W = 160;
const LABEL_LINE_H = 9.5;
const LABEL_PAD_Y = 4;
/** Height of a row whose label wraps onto `n` lines. */
const wrappedRowH = (n: number) => Math.max(IDEAL_ROW_H, n * LABEL_LINE_H + LABEL_PAD_Y * 2);
const CHROME_H = MARGIN * 2 + HEADER_SPACE + AXIS_H;

const START = new Date(2026, 7, 1);

function mkRows(taskCount: number, spanDays: number, taskName?: (i: number) => string): Row[] {
  const rows: Row[] = [
    {
      id: "s1",
      kind: "section",
      depth: 0,
      name: "Phase 1",
      start: START,
      end: new Date(2026, 7, 1 + spanDays),
      parentRowId: null,
      sectionId: 1,
    },
  ];
  for (let i = 0; i < taskCount; i++) {
    rows.push({
      id: `t${i}`,
      kind: "task",
      depth: 1,
      name: taskName ? taskName(i) : `Setup and Config Task ${i}`,
      start: new Date(2026, 7, 1 + (i % spanDays)),
      end: new Date(2026, 7, 3 + (i % spanDays)),
      parentRowId: "s1",
      taskId: i + 1,
      sectionId: 1,
      status: "TODO",
      priority: "MEDIUM",
    });
  }
  return rows;
}

/** Every page's [width, height] in the produced PDF, in page order. */
async function pageSizes(
  rows: Row[],
  spanDays: number,
): Promise<Array<[number, number]>> {
  let url = "";
  // The tabWindow path assigns a blob URL onto `location.href` instead of
  // downloading — the only branch that yields the bytes outside a browser.
  const win = {
    location: {
      set href(v: string) {
        url = v;
      },
      get href() {
        return url;
      },
    },
  };
  await exportGanttToPdf({
    projectName: "Probe",
    rows,
    exportStart: START,
    exportEnd: new Date(2026, 7, 1 + spanDays),
    holidays: [],
    colorBy: "status",
    tabWindow: win as unknown as Window,
  });
  const blob = resolveObjectURL(url);
  if (!blob) throw new Error(`could not resolve blob url: ${url}`);
  const text = Buffer.from(await blob.arrayBuffer()).toString("latin1");
  const out: Array<[number, number]> = [];
  const re = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push([Number(m[1]), Number(m[2])]);
  return out;
}

describe("exportGanttToPdf page size", () => {
  it("grows the chart sheet vertically for a long task list", async () => {
    const spanDays = 90; // > 60 days → week grain
    const rowCount = 45; // 1 section + 44 tasks
    const [chart, ...rest] = await pageSizes(mkRows(rowCount - 1, spanDays), spanDays);
    expect(chart[1]).toBe(CHROME_H + rowCount * IDEAL_ROW_H);
    expect(chart[1]).toBeGreaterThan(A4_LANDSCAPE[1]);
    // 13 weeks at the 34pt week budget + label column stays under the A4 floor.
    expect(chart[0]).toBe(A4_LANDSCAPE[0]);
    // One chart sheet only — no horizontal pagination. The remaining pages are
    // the task table's own A4 landscape sheets.
    expect(rest.length).toBeGreaterThanOrEqual(1);
    for (const p of rest) expect(p).toEqual(A4_LANDSCAPE);
  });

  it("grows the chart sheet horizontally for a wide day-grain range", async () => {
    const spanDays = 59; // <= 60 days → day grain, 60 columns
    const [chart, ...rest] = await pageSizes(mkRows(6, spanDays), spanDays);
    expect(chart[0]).toBe(MARGIN * 2 + LABEL_COL_W + 60 * IDEAL_DAY_COL_W);
    expect(chart[0]).toBeGreaterThan(A4_LANDSCAPE[0]);
    expect(chart[1]).toBe(A4_LANDSCAPE[1]); // 7 rows fit inside the A4 floor
    for (const p of rest) expect(p).toEqual(A4_LANDSCAPE);
  });

  it("keeps the A4 landscape floor for a small project", async () => {
    const spanDays = 10;
    const [chart] = await pageSizes(mkRows(4, spanDays), spanDays);
    expect(chart).toEqual(A4_LANDSCAPE);
  });

  it("gives a row extra height when its label wraps to two lines", async () => {
    const spanDays = 90;
    const taskCount = 40;
    // 49 characters — wider than the 142pt label column allows on one line at
    // 8pt helvetica, and the exact case from the reported export.
    const long = () => "Setup and Config Amazon Elastic Container Registry";
    const [short] = await pageSizes(mkRows(taskCount, spanDays), spanDays);
    const [wrapped] = await pageSizes(mkRows(taskCount, spanDays, long), spanDays);
    expect(short[1]).toBe(CHROME_H + (taskCount + 1) * wrappedRowH(1));
    // The section row's own name is short, so only the task rows grow.
    expect(wrapped[1]).toBe(CHROME_H + wrappedRowH(1) + taskCount * wrappedRowH(2));
    expect(wrapped[1]).toBeGreaterThan(short[1]);
  });
});

// Critical Path mark (plan critical-path-mark.md §3): the final-page task
// table gains a "Critical Path" column only when at least one exported row
// is marked (the empty-project rule). `buildTaskTable` is the pure head/body
// builder `exportGanttToPdf` feeds to autoTable — asserted directly here
// rather than parsing autoTable's rendered PDF content stream.
describe("buildTaskTable", () => {
  const section: Row = {
    id: "s1",
    kind: "section",
    depth: 0,
    name: "Phase 1",
    start: START,
    end: START,
    parentRowId: null,
    sectionId: 1,
  };

  function taskRow(id: string, isCriticalPath = false): Row {
    return {
      id,
      kind: "task",
      depth: 1,
      name: `Task ${id}`,
      start: START,
      end: START,
      parentRowId: "s1",
      taskId: 1,
      sectionId: 1,
      isCriticalPath,
    };
  }

  it("adds a Critical Path column when one task is marked — the marked row reads \"Yes\", the unmarked row \"\"", () => {
    const { head, body, hasCriticalPath } = buildTaskTable([
      section,
      taskRow("t1", true),
      taskRow("t2", false),
    ]);
    expect(hasCriticalPath).toBe(true);
    expect(head).toEqual([
      "Section",
      "Title",
      "Status",
      "Priority",
      "Critical Path",
      "Start",
      "Due",
    ]);
    // The section row never enters the task table.
    expect(body).toHaveLength(2);
    expect(body[0][4]).toBe("Yes");
    expect(body[1][4]).toBe("");
  });

  it("omits the Critical Path column when no task is marked — header list unchanged (empty-project rule)", () => {
    const { head, body, hasCriticalPath } = buildTaskTable([
      section,
      taskRow("t1", false),
      taskRow("t2", false),
    ]);
    expect(hasCriticalPath).toBe(false);
    expect(head).toEqual(["Section", "Title", "Status", "Priority", "Start", "Due"]);
    for (const line of body) expect(line).toHaveLength(6);
  });
});

// Guardrail: document links (ProjectLink / TaskLink) never reach an export.
describe("buildTaskTable — document links never exported", () => {
  it("emits no link label or URL even when a row's task carries links", () => {
    const section: Row = {
      id: "s1", kind: "section", depth: 0, name: "Phase 1",
      start: START, end: START, parentRowId: null, sectionId: 1,
    };
    const task = {
      id: 1,
      links: [{ id: "l1", label: "SECRET-TASK-LINK-LABEL", url: "https://docs.internal.example/SECRET-TASK-LINK-URL" }],
    } as unknown as NonNullable<Row["task"]>;
    const row: Row = {
      id: "t1", kind: "task", depth: 1, name: "Task t1",
      start: START, end: START, parentRowId: "s1", taskId: 1, sectionId: 1, task,
    };
    const { head, body } = buildTaskTable([section, row]);
    const raw = JSON.stringify({ head, body });
    expect(raw).not.toContain("SECRET");
    expect(raw).not.toContain("docs.internal.example");
    expect(head).not.toContain("Links");
  });
});

async function pdfText(rows: Row[], spanDays: number): Promise<string> {
  let url = "";
  const win = {
    location: {
      set href(v: string) {
        url = v;
      },
      get href() {
        return url;
      },
    },
  };
  await exportGanttToPdf({
    projectName: "Probe",
    rows,
    exportStart: START,
    exportEnd: new Date(2026, 7, 1 + spanDays),
    holidays: [],
    colorBy: "status",
    tabWindow: win as unknown as Window,
  });
  const blob = resolveObjectURL(url);
  if (!blob) throw new Error(`could not resolve blob url: ${url}`);
  return Buffer.from(await blob.arrayBuffer()).toString("latin1");
}

describe("exportGanttToPdf bar treatments", () => {
  const withProgress = (progressPct: number | undefined, status = "TODO"): Row[] => {
    const rows = mkRows(1, 10);
    rows[1] = { ...rows[1], status: status as Row["status"], progressPct };
    return rows;
  };

  it("clips a hatch to an incomplete bar and leaves a complete one flat", async () => {
    const hatched = await pdfText(withProgress(0), 10);
    const flat = await pdfText(withProgress(100), 10);
    // Hatched bars paint inside a clip path (`W n`); flat ones need none.
    expect(hatched).toMatch(/\nW\nn\n/);
    expect(flat).not.toMatch(/\nW\nn\n/);
  });

  it("keeps cancelled and progress-less bars flat", async () => {
    expect(await pdfText(withProgress(0, "CANCELLED"), 10)).not.toMatch(/\nW\nn\n/);
    expect(await pdfText(withProgress(undefined), 10)).not.toMatch(/\nW\nn\n/);
  });
});

describe("doneWidthOnPage", () => {
  const DAY = 86_400_000;
  const t0 = Date.UTC(2026, 7, 1);
  // A 10-day bar at 12pt/day: full width 118pt, 60% done = 70.8pt, split across
  // two 5-day pages.
  const base = { progress: 60, startMs: t0, endMs: t0 + 9 * DAY, colW: 12 };

  it("fills the starting page's visible part up to the done edge", () => {
    const w = doneWidthOnPage({ ...base, clampedStartMs: t0, pageFromMs: t0, visibleW: 5 * 12 - 2 });
    expect(w).toBeCloseTo(58, 5);
  });

  it("carries the remainder onto the next page instead of hatching it fully", () => {
    const pageFromMs = t0 + 5 * DAY;
    const w = doneWidthOnPage({ ...base, clampedStartMs: pageFromMs, pageFromMs, visibleW: 5 * 12 - 2 });
    expect(w).toBeCloseTo(118 * 0.6 - 60, 5);
    expect(w).toBeGreaterThan(0);
  });

  it("is 0 on a page the done edge has not reached", () => {
    const pageFromMs = t0 + 5 * DAY;
    const w = doneWidthOnPage({ ...base, progress: 40, clampedStartMs: pageFromMs, pageFromMs, visibleW: 58 });
    expect(w).toBe(0);
  });
});
