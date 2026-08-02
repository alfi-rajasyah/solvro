import {
  addDays,
  isoWeekNumber,
  parseISODate,
  startOfDay,
  type Row,
} from "./geometry";
import {
  HOLIDAY_HEX,
  PROGRESS_OVERLAY_ALPHA,
  WEEKEND_HEX,
  barFillHex,
  type ColorByMode,
} from "./palette";
import {
  buildConnectorRoute,
  type ConnectorRoute,
  type Rect,
} from "@/components/gantt-v2/connector-paths";
import type { Holiday, TaskDependency } from "@/lib/queries";
import type { jsPDF as JsPDFInstance } from "jspdf";

// F4 (2026-07-25, walkthrough finding) — PDF export redesigned to match the
// ReUI-engined Gantt's on-screen visual language (SolvroBar.tsx,
// GanttOverlay.tsx, SolvroGantt.tsx's F3 axis system). Plan B Task 7
// originally froze this export layer at "re-register on the new geometry
// data, zero visual rebuild" — the user explicitly directed this redesign
// afterward, superseding that freeze (recorded in CHANGELOG.md). See
// task-f4-report.md for the full screen→PDF design-mapping table.

interface ExportPdfOpts {
  projectName: string;
  rows: Row[];
  exportStart: Date;
  exportEnd: Date;
  holidays: Holiday[];
  colorBy: ColorByMode;
  /** Dependency edges, drawn as stepped connector arrows between bars —
   *  mirrors GanttOverlay.tsx. Plan B Task 7 registered this export off
   *  Row[] alone (no dependency data reached it); F4 extends the input with
   *  the same data the live overlay already fetches (SolvroGantt.tsx's
   *  useProjectDependencies), threaded through the registration call.
   *  Optional (defaults to `[]`) so the old hand-rolled engine's own
   *  registration call (GanttFrame.tsx — untouched by this task, still
   *  live until Plan B Task 9 removes it) keeps compiling unchanged. */
  dependencies?: TaskDependency[];
  /** When set, render into this window instead of triggering a download. */
  tabWindow?: Window | null;
}

const STATUS_LABEL: Record<string, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const DAY_MS = 1000 * 60 * 60 * 24;

function fmtIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 60) || "project";
}

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const h = hex.replace(/^#/, "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [r, g, b];
}

// ────────── Theme (light palette — the PDF stays print-appropriate light
// background regardless of the app's dark-default theme; DESIGN.md is
// binding for this). Hexes ported verbatim from index.css's `:root` block
// (the LIGHT theme values — `.dark` overrides don't apply here). ──────────
const THEME_HEX = {
  surfaceContainerLowest: "#ffffff",
  surfaceContainerLow: "#f2f2ee",
  surfaceContainer: "#ebebe7",
  onSurface: "#1a1a18",
  onSurfaceVariant: "#4a4a47",
  outline: "#9a9a97",
  outlineVariant: "#d0d0cc",
  // index.css :root --primary: 45 144 66 (light theme) — DESIGN.md's
  // Behavioral Rules table: "Primary is Elitery Green — never blue: #3aae51
  // dark / #2d9042 light." PDF is light-background, so the light value wins.
  primary: "#2d9042",
} as const;

// Ported from SolvroBar.tsx (itself ported from the old GanttBar.tsx:56-74)
// — decides whether a bar's resolved fill needs light or dark label text.
const LABEL_LUMINANCE_THRESHOLD = 0.6;

function hexLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Inside-label text color by fill luminance — ported from SolvroBar.tsx's
 * `insideLabelTextColor`. The dark branch there is `rgba(0,0,0,0.75)`; print
 * has no backdrop texture for the alpha to matter against, so on-surface
 * (`#1a1a18`) is the direct solid stand-in.
 */
function insideLabelRgb(fillHex: string): RGB {
  return hexLuminance(fillHex) > LABEL_LUMINANCE_THRESHOLD
    ? hexToRgb(THEME_HEX.onSurface)
    : [255, 255, 255];
}

/**
 * Measured-fit text truncation — the PDF analogue of GH #58 (SolvroBar.tsx's
 * `useLabelFits`): uses the PDF's own font metrics (`pdf.getTextWidth`, at
 * whatever font/size is CURRENTLY set on `pdf` — callers must `setFont`/
 * `setFontSize` first) rather than a guessed character-count cutoff (the
 * pre-F4 version of this file used `Math.floor(width / 4)`). Binary-searches
 * the longest prefix + "…" that fits `maxWidth`.
 */
function fitText(pdf: JsPDFInstance, text: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (pdf.getTextWidth(text) <= maxWidth) return text;
  const ellipsisW = pdf.getTextWidth("…");
  if (ellipsisW > maxWidth) return "";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidateW = pdf.getTextWidth(text.slice(0, mid)) + ellipsisW;
    if (candidateW <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? `${text.slice(0, lo)}…` : "…";
}

/** Diamond of half-diagonal `r` centered at (cx, cy), filled with the
 *  current fill color. jsPDF has no primitive diamond — traced as a closed
 *  3-segment path (the 4th edge is implied by `closed: true`). */
function drawDiamond(pdf: JsPDFInstance, cx: number, cy: number, r: number): void {
  pdf.lines(
    [
      [r, r],
      [-r, r],
      [-r, -r],
    ],
    cx,
    cy - r,
    [1, 1],
    "F",
    true,
  );
}

/** Clamps the corner radius so `roundedRect` never receives rx/ry larger
 *  than the rect itself (degenerates a near-zero-width clamped bar into a
 *  plain rect instead of a jsPDF geometry glitch). */
function fillRoundedRect(
  pdf: JsPDFInstance,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (rr <= 0) {
    pdf.rect(x, y, Math.max(0, w), Math.max(0, h), "F");
  } else {
    pdf.roundedRect(x, y, w, h, rr, rr, "F");
  }
}

/** Runs `draw` with a temporary fill/stroke opacity, matching the CSS
 *  `opacity` semantics SolvroBar.tsx uses for the progress overlay (true
 *  alpha via jsPDF's GState, not a manual color blend — jsPDF v4 supports
 *  this natively). */
function withOpacity(pdf: JsPDFInstance, alpha: number, draw: () => void): void {
  pdf.setGState(pdf.GState({ opacity: alpha }));
  draw();
  pdf.setGState(pdf.GState({ opacity: 1 }));
}

/**
 * `buildConnectorRoute` (reused verbatim from
 * frontend/src/components/gantt-v2/connector-paths.ts — the same pure route
 * math GanttOverlay.tsx uses on screen) returns an SVG `<path d>` string,
 * not a point list — jsPDF draws line segments, not SVG paths. This parses
 * the "M x y L x y L x y…" format `polylineToPath` (connector-paths.ts)
 * always produces back into the points jsPDF needs.
 */
function parsePathPoints(d: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const re = /[ML]\s*(-?[\d.]+)\s+(-?[\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    out.push([Number(m[1]), Number(m[2])]);
  }
  return out;
}

/**
 * Draws one stepped connector: line segments + a small arrowhead at the
 * route's tip. `buildConnectorRoute`'s two branches (connector-paths.ts:
 * forward-nudge vs. back-detour) both always end with a horizontal run
 * INTO `[tipX, tipY]` moving in +x (traced in the task report) — the
 * arrowhead is a fixed right-pointing triangle, not direction-computed.
 */
function drawConnector(
  pdf: JsPDFInstance,
  route: ConnectorRoute,
  type: TaskDependency["type"],
  strokeRgb: RGB,
): void {
  const pts = parsePathPoints(route.d);
  if (pts.length < 2) return;
  pdf.setDrawColor(strokeRgb[0], strokeRgb[1], strokeRgb[2]);
  pdf.setLineWidth(0.75);
  pdf.setLineDashPattern(type === "SOFT" ? [2, 1.5] : [], 0);
  for (let i = 1; i < pts.length; i++) {
    pdf.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  }
  pdf.setLineDashPattern([], 0); // reset — dash state persists across draws otherwise
  pdf.setFillColor(strokeRgb[0], strokeRgb[1], strokeRgb[2]);
  pdf.triangle(
    route.tipX, route.tipY,
    route.tipX - 4, route.tipY - 2.5,
    route.tipX - 4, route.tipY + 2.5,
    "F",
  );
}

interface BarRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function exportGanttToPdf(opts: ExportPdfOpts): Promise<void> {
  const {
    projectName,
    rows,
    exportStart,
    exportEnd,
    holidays,
    colorBy,
    dependencies = [],
    tabWindow,
  } = opts;

  const jsPdfMod = await import("jspdf");
  const jsPDF = jsPdfMod.default;
  const autoTableMod = await import("jspdf-autotable");
  const autoTable = autoTableMod.default;

  // A4 landscape in points: 842 × 595.
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const headerSpace = 28;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2 - headerSpace;

  const onSurfaceRgb = hexToRgb(THEME_HEX.onSurface);
  const onSurfaceVariantRgb = hexToRgb(THEME_HEX.onSurfaceVariant);
  const outlineRgb = hexToRgb(THEME_HEX.outline);
  const outlineVariantRgb = hexToRgb(THEME_HEX.outlineVariant);
  const surfaceContainerLowRgb = hexToRgb(THEME_HEX.surfaceContainerLow);
  const surfaceContainerRgb = hexToRgb(THEME_HEX.surfaceContainer);
  const primaryRgb = hexToRgb(THEME_HEX.primary);

  // ────────── Build day list and basic geometry ──────────
  const days: Date[] = [];
  let cur = startOfDay(exportStart);
  const endDay = startOfDay(exportEnd);
  while (cur <= endDay) {
    days.push(new Date(cur));
    cur = addDays(cur, 1);
  }
  const today = startOfDay(new Date());
  const holidayDates = new Set(holidays.map((h) => h.date));

  // Layout: a label column for task names on the left, then the date grid.
  const labelColW = 160;
  const axisH = 22;
  const chartAreaW = usableW - labelColW;

  // F3-consistent axis grain: sub-columns are DAYS (with day numbers) when
  // the exported range is narrow enough to stay readable; beyond that they
  // coarsen to WEEKS, mirroring the on-screen scale system's own
  // coarsening (SolvroGantt.tsx's SCALES comment: the "Week" pill is
  // day-grain over a ~1-month window, the "Month" pill is week-grain over a
  // ~1-quarter window). 60 days (~2 months) is the threshold — roughly the
  // point where a day-grain view would already have prompted a TAM to zoom
  // out to "Month" on screen. The tight ±7-day export window (SolvroGantt's
  // registration, unchanged by this task) keeps most real exports well
  // under this, so day-grain is the common case in practice; week-grain
  // exists for projects whose task range genuinely spans months.
  const WEEK_GRAIN_THRESHOLD_DAYS = 60;
  const totalDays = days.length;
  const grain: "day" | "week" = totalDays > WEEK_GRAIN_THRESHOLD_DAYS ? "week" : "day";

  const idealDayColW = 18;
  const minDayColW = 11;
  const idealWeekColW = 34; // width budget per 7-day block
  const minWeekColW = 20;

  // `colW` is always px(pt)-per-DAY regardless of grain — bar/milestone/
  // connector geometry stays day-precise either way; grain only changes
  // what the axis draws (day ticks+numbers vs. week dividers+ISO week
  // labels) and, in week-grain, what width budget drives pagination.
  let colW: number;
  let daysPerPage: number;
  let pageCount: number;
  if (grain === "day") {
    if (totalDays * idealDayColW <= chartAreaW) {
      colW = chartAreaW / totalDays;
      daysPerPage = totalDays;
      pageCount = 1;
    } else if (totalDays * minDayColW <= chartAreaW) {
      colW = chartAreaW / totalDays;
      daysPerPage = totalDays;
      pageCount = 1;
    } else {
      colW = minDayColW;
      daysPerPage = Math.floor(chartAreaW / colW);
      pageCount = Math.ceil(totalDays / daysPerPage);
    }
  } else {
    const totalWeeks = Math.ceil(totalDays / 7);
    if (totalWeeks * idealWeekColW <= chartAreaW) {
      colW = chartAreaW / totalWeeks / 7;
      daysPerPage = totalDays;
      pageCount = 1;
    } else if (totalWeeks * minWeekColW <= chartAreaW) {
      colW = chartAreaW / totalWeeks / 7;
      daysPerPage = totalDays;
      pageCount = 1;
    } else {
      const weekColW = minWeekColW;
      colW = weekColW / 7;
      const weeksPerPage = Math.max(1, Math.floor(chartAreaW / weekColW));
      daysPerPage = weeksPerPage * 7;
      pageCount = Math.ceil(totalDays / daysPerPage);
    }
  }

  // Vertical: scale row height so all rows fit on one page; clamp to a
  // sane minimum / maximum.
  const visualRows = rows; // includes section header rows for context
  const rowsHeightAvail = usableH - axisH;
  const idealRowH = 18;
  const minRowH = 11;
  let rowH = idealRowH;
  if (visualRows.length * idealRowH > rowsHeightAvail) {
    rowH = Math.max(minRowH, rowsHeightAvail / visualRows.length);
  }

  function drawHeader(pageIdx: number): void {
    pdf.setTextColor(onSurfaceRgb[0], onSurfaceRgb[1], onSurfaceRgb[2]);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text(projectName, margin, margin + 14);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(onSurfaceVariantRgb[0], onSurfaceVariantRgb[1], onSurfaceVariantRgb[2]);
    const right =
      pageCount > 1
        ? `Gantt · ${fmtIsoDate(new Date())} · page ${pageIdx + 1} of ${pageCount}`
        : `Gantt · ${fmtIsoDate(new Date())}`;
    pdf.text(right, pageW - margin, margin + 14, { align: "right" });
  }

  for (let p = 0; p < pageCount; p++) {
    if (p > 0) pdf.addPage();
    drawHeader(p);

    const dayFrom = p * daysPerPage;
    const dayTo = Math.min(dayFrom + daysPerPage, days.length);
    const pageDays = days.slice(dayFrom, dayTo);

    const chartLeft = margin + labelColW;
    const chartTop = margin + headerSpace + axisH;
    const chartBottom = chartTop + visualRows.length * rowH;
    const pageDaysW = pageDays.length * colW;
    const pageFromMs = pageDays[0].getTime();
    const pageToMs = pageDays[pageDays.length - 1].getTime();

    // ────────── Axis: month band (top half) + day/week sub-band (bottom half) ──
    const axisTop = margin + headerSpace;

    // Month bands (grain-independent — always the coarsest band).
    let runStart = 0;
    let runMonth = pageDays[0]?.getMonth() ?? -1;
    let runYear = pageDays[0]?.getFullYear() ?? -1;
    function flushMonthRun(toIdx: number) {
      const x = chartLeft + runStart * colW;
      const w = (toIdx - runStart) * colW;
      if (w <= 0) return;
      pdf.setFillColor(surfaceContainerLowRgb[0], surfaceContainerLowRgb[1], surfaceContainerLowRgb[2]);
      pdf.rect(x, axisTop, w, axisH / 2, "F");
      pdf.setDrawColor(outlineVariantRgb[0], outlineVariantRgb[1], outlineVariantRgb[2]);
      pdf.setLineWidth(0.3);
      pdf.rect(x, axisTop, w, axisH / 2);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(onSurfaceVariantRgb[0], onSurfaceVariantRgb[1], onSurfaceVariantRgb[2]);
      pdf.text(
        `${MONTHS[runMonth]} ${runYear}`,
        x + w / 2,
        axisTop + axisH / 2 - 3,
        { align: "center" },
      );
    }
    for (let i = 1; i < pageDays.length; i++) {
      const d = pageDays[i];
      if (d.getMonth() !== runMonth || d.getFullYear() !== runYear) {
        flushMonthRun(i);
        runStart = i;
        runMonth = d.getMonth();
        runYear = d.getFullYear();
      }
    }
    flushMonthRun(pageDays.length);

    // Sub-band: day ticks+numbers, or week dividers+ISO week labels.
    if (grain === "day") {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      for (let i = 0; i < pageDays.length; i++) {
        const d = pageDays[i];
        const cx = chartLeft + i * colW;
        pdf.setDrawColor(outlineVariantRgb[0], outlineVariantRgb[1], outlineVariantRgb[2]);
        pdf.setLineWidth(0.2);
        pdf.line(cx, axisTop + axisH / 2, cx, chartBottom);
        pdf.setTextColor(onSurfaceVariantRgb[0], onSurfaceVariantRgb[1], onSurfaceVariantRgb[2]);
        pdf.text(
          String(d.getDate()).padStart(2, "0"),
          cx + colW / 2,
          axisTop + axisH - 4,
          { align: "center" },
        );
      }
    } else {
      const boundaries: number[] = [0];
      for (let i = 1; i < pageDays.length; i++) {
        if (pageDays[i].getDay() === 1) boundaries.push(i); // Monday, weekStartsOn=1 (matches SolvroGantt.tsx)
      }
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7);
      for (let k = 0; k < boundaries.length; k++) {
        const startIdx = boundaries[k];
        const endIdx = k + 1 < boundaries.length ? boundaries[k + 1] : pageDays.length;
        const x = chartLeft + startIdx * colW;
        pdf.setDrawColor(outlineRgb[0], outlineRgb[1], outlineRgb[2]);
        pdf.setLineWidth(0.4);
        pdf.line(x, axisTop + axisH / 2, x, chartBottom);
        const segW = (endIdx - startIdx) * colW;
        pdf.setTextColor(onSurfaceVariantRgb[0], onSurfaceVariantRgb[1], onSurfaceVariantRgb[2]);
        pdf.text(`W${isoWeekNumber(pageDays[startIdx])}`, x + segW / 2, axisTop + axisH - 4, {
          align: "center",
        });
      }
    }
    // Right edge of grid
    pdf.setDrawColor(outlineVariantRgb[0], outlineVariantRgb[1], outlineVariantRgb[2]);
    pdf.setLineWidth(0.2);
    pdf.line(chartLeft + pageDaysW, axisTop + axisH / 2, chartLeft + pageDaysW, chartBottom);

    // ────────── Weekend / holiday tints (full body, grain-independent) ──────────
    for (let i = 0; i < pageDays.length; i++) {
      const d = pageDays[i];
      const iso = fmtIsoDate(d);
      const dow = d.getDay();
      const cx = chartLeft + i * colW;
      if (holidayDates.has(iso)) {
        const [r, g, b] = hexToRgb(HOLIDAY_HEX);
        pdf.setFillColor(r, g, b);
        pdf.rect(cx, chartTop, colW, visualRows.length * rowH, "F");
      } else if (dow === 0 || dow === 6) {
        const [r, g, b] = hexToRgb(WEEKEND_HEX);
        pdf.setFillColor(r, g, b);
        pdf.rect(cx, chartTop, colW, visualRows.length * rowH, "F");
      }
    }

    // ────────── Today line (primary green, only on the page containing today) ──
    const todayIdx = pageDays.findIndex((d) => d.getTime() === today.getTime());
    if (todayIdx >= 0) {
      const tx = chartLeft + todayIdx * colW + colW / 2;
      pdf.setDrawColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
      pdf.setLineWidth(1.2);
      pdf.line(tx, chartTop, tx, chartBottom);
    }

    // ────────── Rows: label column + bars/milestones/rollups ──────────
    const barRectsByTaskId = new Map<number, BarRect>();

    for (let r = 0; r < visualRows.length; r++) {
      const row = visualRows[r];
      const ry = chartTop + r * rowH;

      if (row.kind === "section") {
        // Header band: subtler surface-container-low tint (was a raw slate
        // literal pre-F4).
        pdf.setFillColor(surfaceContainerLowRgb[0], surfaceContainerLowRgb[1], surfaceContainerLowRgb[2]);
        pdf.rect(margin, ry, labelColW + pageDaysW, rowH, "F");
      }

      // Label cell — measured-fit truncation (fitText) at an x-offset by
      // depth, replacing the old literal-space-prefix + char-count cutoff.
      const labelFontSize = rowH < 14 ? 7 : 8;
      pdf.setFontSize(labelFontSize);
      pdf.setTextColor(onSurfaceRgb[0], onSurfaceRgb[1], onSurfaceRgb[2]);
      pdf.setFont("helvetica", row.kind === "section" ? "bold" : "normal");
      const indentPx = row.depth * 10;
      const labelMaxW = labelColW - 8 - indentPx;
      const drawLabel = fitText(pdf, row.name, labelMaxW);
      pdf.text(drawLabel, margin + 4 + indentPx, ry + rowH / 2 + 2.5);

      // Row separator (bottom) + vertical separator between label col and grid
      pdf.setDrawColor(outlineVariantRgb[0], outlineVariantRgb[1], outlineVariantRgb[2]);
      pdf.setLineWidth(0.3);
      pdf.line(margin, ry + rowH, chartLeft + pageDaysW, ry + rowH);
      pdf.line(chartLeft, ry, chartLeft, ry + rowH);

      if (row.kind === "section") {
        // Slim rollup pill (~3pt), spanning the section's children date
        // range in the section color, drawn on the section's own resource
        // row (same placement as the live UI's rollup). SolvroBar.tsx's
        // on-screen `data-rollup` was restyled from a pill to a thin bar
        // with squared end caps in the Gantt visual refresh (Task 3); this
        // export still draws the rounded pill below — an accepted,
        // unsynced screen/PDF divergence, not a bug.
        if (row.start && row.end) {
          const startMs = startOfDay(row.start).getTime();
          const endMs = startOfDay(row.end).getTime();
          if (endMs >= pageFromMs && startMs <= pageToMs) {
            const clampedStartMs = Math.max(startMs, pageFromMs);
            const clampedEndMs = Math.min(endMs, pageToMs);
            const startIdx = (clampedStartMs - pageFromMs) / DAY_MS;
            const endIdx = (clampedEndMs - pageFromMs) / DAY_MS;
            const px = chartLeft + startIdx * colW + 1;
            const pw = Math.max(1, (endIdx - startIdx + 1) * colW - 2);
            const [pr, pg, pb] = hexToRgb(row.sectionColor ?? THEME_HEX.outline);
            pdf.setFillColor(pr, pg, pb);
            fillRoundedRect(pdf, px, ry + rowH / 2 - 1.5, pw, 3, 1.5);
          }
        }
        continue;
      }

      // Bars/milestones (tasks/subtasks only).
      if (row.taskId == null) continue;

      let drawnRect: BarRect | null = null;

      if (row.isMilestone && row.end) {
        // Anchored on the due date only (never a stub range rect) — fixes a
        // pre-F4 gap where due-only milestones (no startDate) drew nothing
        // at all, since the old code gated on `row.start && row.end` and
        // geometry.ts's taskDates() leaves `start` null for a milestone
        // with no explicit startDate.
        const dayMs = startOfDay(row.end).getTime();
        if (dayMs >= pageFromMs && dayMs <= pageToMs) {
          const idx = (dayMs - pageFromMs) / DAY_MS;
          const padY = Math.max(2, rowH * 0.18);
          const dr = Math.min(5, Math.max(3, rowH * 0.25));
          const cx = chartLeft + idx * colW + 6;
          const cy = ry + rowH / 2;
          // Primary green, not the resolved Color-by hex — parity with
          // SolvroBar.tsx's milestone branch, which hardcodes `bg-primary`
          // regardless of colorBy mode (an explicit "not section color"
          // choice ported from the old engine).
          pdf.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
          drawDiamond(pdf, cx, cy, dr);
          // Label in on-surface (near-black), NOT the luminance-derived
          // insideLabelRgb SolvroBar.tsx uses for this text: on screen that
          // color is computed from the bar's resolved fill color even
          // though the milestone branch renders no colored backdrop behind
          // the label (just the diamond + text on the page/row background)
          // — porting it literally risks white-on-white text for any
          // colorBy mode whose fill luminance is under the 0.6 threshold
          // (e.g. IN_PROGRESS blue). Print legibility wins over literal
          // fidelity for this one spot; see task-f4-report.md.
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(rowH < 14 ? 6.5 : 7.5);
          pdf.setTextColor(onSurfaceRgb[0], onSurfaceRgb[1], onSurfaceRgb[2]);
          const labelX = cx + dr + 4;
          const labelMaxW = Math.max(0, chartLeft + pageDaysW - labelX - 2);
          pdf.text(fitText(pdf, row.name, labelMaxW), labelX, cy + 2.5);

          drawnRect = { x: cx - dr, y: ry + padY, width: dr * 2, height: rowH - padY * 2 };
        }
      } else if (row.start && row.end) {
        const startMs = startOfDay(row.start).getTime();
        const endMs = startOfDay(row.end).getTime();
        if (endMs >= pageFromMs && startMs <= pageToMs) {
          const clampedStartMs = Math.max(startMs, pageFromMs);
          const clampedEndMs = Math.min(endMs, pageToMs);
          const startIdx = (clampedStartMs - pageFromMs) / DAY_MS;
          const endIdx = (clampedEndMs - pageFromMs) / DAY_MS;
          const bx = chartLeft + startIdx * colW + 1;
          const bw = Math.max(1, (endIdx - startIdx + 1) * colW - 2);
          const padY = Math.max(2, rowH * 0.18);
          const by = ry + padY;
          const bh = rowH - padY * 2;
          const startsOnPage = startMs >= pageFromMs;

          const status = row.status ?? "TODO";
          const priority = row.priority ?? "MEDIUM";
          const fillHex = barFillHex(
            { status, priority, sectionColor: row.sectionColor },
            colorBy,
          );
          const [fr, fg, fb] = hexToRgb(fillHex);
          pdf.setFillColor(fr, fg, fb);
          fillRoundedRect(pdf, bx, by, bw, bh, 1.5);

          // Progress overlay — darker fill on the completed fraction, only
          // for 0%<p<100%, and only on the page where the bar STARTS (a
          // multi-page-spanning bar is a rare edge case for the tight
          // ±7-day export window; the % is computed against the bar's
          // FULL — not page-clamped — duration so a right-clipped bar on a
          // very wide export still shows the correct fraction).
          const progress = row.progressPct;
          if (
            startsOnPage &&
            typeof progress === "number" &&
            progress > 0 &&
            progress < 100
          ) {
            const trueEndIdx = (endMs - pageFromMs) / DAY_MS;
            const fullBw = (trueEndIdx - startIdx + 1) * colW - 2;
            const progressW = Math.min(bw, Math.max(0, fullBw * (progress / 100)));
            if (progressW > 0) {
              withOpacity(pdf, PROGRESS_OVERLAY_ALPHA, () => {
                pdf.setFillColor(0, 0, 0);
                fillRoundedRect(pdf, bx, by, progressW, bh, 1.5);
              });
            }
          }

          // Label: inside if it fits (GH #58-style measured fit), else
          // immediately right of the bar in on-surface-variant gray. Only
          // on the page where the bar starts, matching the pre-F4 file's
          // own no-duplicate-across-pages guard.
          if (startsOnPage) {
            const labelSize = rowH < 14 ? 6.5 : 7.5;
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(labelSize);
            const insidePad = 6;
            const fitsInside = pdf.getTextWidth(row.name) + insidePad <= bw;
            if (fitsInside) {
              const [tr, tg, tb] = insideLabelRgb(fillHex);
              pdf.setTextColor(tr, tg, tb);
              pdf.text(row.name, bx + insidePad / 2, by + bh / 2 + 2);
            } else {
              pdf.setTextColor(onSurfaceVariantRgb[0], onSurfaceVariantRgb[1], onSurfaceVariantRgb[2]);
              const labelX = bx + bw + 4;
              const labelMaxW = Math.max(0, chartLeft + pageDaysW - labelX - 2);
              pdf.text(fitText(pdf, row.name, labelMaxW), labelX, by + bh / 2 + 2);
            }
          }

          drawnRect = { x: bx, y: by, width: bw, height: bh };
        }
      }

      if (drawnRect) {
        // Baseline ghosts are intentionally NOT rendered in the PDF (user
        // direction, 2026-07-25 — see CHANGELOG.md) even though the project
        // may have a locked baseline; the on-screen `showBaseline` toggle
        // and its ghosts (GanttOverlay.tsx) are unaffected by this.
        barRectsByTaskId.set(row.taskId, drawnRect);
      }
    }

    // ────────── Dependency connectors — stepped routes reused from the
    // live overlay's own route builder, drawn once bar/milestone rects for
    // this page are all known. A dependency whose predecessor or successor
    // isn't drawn on THIS page (off-window, or clipped past the page's day
    // range) is simply skipped for that page — same acceptance GanttOverlay
    // itself documents for a collapsed-away endpoint. ──────────
    for (const dep of dependencies) {
      const predRect: Rect | undefined = barRectsByTaskId.get(dep.predecessorTaskId);
      const succRect: Rect | undefined = barRectsByTaskId.get(dep.successorTaskId);
      if (!predRect || !succRect) continue;
      const route = buildConnectorRoute(predRect, succRect);
      drawConnector(pdf, route, dep.type, onSurfaceVariantRgb);
    }

    // Outer chart border
    pdf.setDrawColor(outlineRgb[0], outlineRgb[1], outlineRgb[2]);
    pdf.setLineWidth(0.4);
    pdf.rect(chartLeft, chartTop, pageDaysW, visualRows.length * rowH);
    pdf.rect(margin, chartTop, labelColW, visualRows.length * rowH);
  }

  // ────────── Final page: task table ──────────
  pdf.addPage();
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(onSurfaceRgb[0], onSurfaceRgb[1], onSurfaceRgb[2]);
  pdf.text(`${projectName} — Tasks`, margin, margin + 14);

  const taskRows = rows.filter((r) => r.kind === "task" || r.kind === "subtask");
  const sectionLookup = new Map<string, string>();
  for (const r of rows) {
    if (r.kind === "section") sectionLookup.set(r.id, r.name);
  }

  const tableRows = taskRows.map((r) => {
    const t = r.task;
    const sectionName = r.parentRowId ? sectionLookup.get(r.parentRowId) ?? "" : "";
    // ASCII-safe indent — not a WinAnsi-encoding-representable glyph like
    // "└" (U+2514), which jsPDF's core helvetica font renders as mojibake
    // (confirmed against the F4 sample render: showed up as a stray "%").
    // Pre-existing bug (this string predates F4), fixed opportunistically
    // since this section was already being restyled.
    const indent = r.kind === "subtask" ? "    - " : "";
    return [
      sectionName,
      `${indent}${r.name}`,
      t ? STATUS_LABEL[t.status] ?? t.status : "",
      t?.priority ?? "",
      t?.startDate ? fmtIsoDate(parseISODate(t.startDate)) : "",
      t?.dueDate ? fmtIsoDate(parseISODate(t.dueDate)) : "",
    ];
  });

  autoTable(pdf, {
    startY: margin + 28,
    margin: { left: margin, right: margin },
    head: [["Section", "Title", "Status", "Priority", "Start", "Due"]],
    body: tableRows,
    styles: { fontSize: 8, cellPadding: 3, textColor: onSurfaceRgb },
    headStyles: {
      fillColor: surfaceContainerRgb,
      textColor: onSurfaceRgb,
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: surfaceContainerLowRgb },
    columnStyles: {
      0: { cellWidth: 100 },
      1: { cellWidth: "auto" },
      2: { cellWidth: 70 },
      3: { cellWidth: 60 },
      4: { cellWidth: 70 },
      5: { cellWidth: 70 },
    },
  });

  if (tabWindow !== undefined) {
    // Browser-viewer path: renders the PDF in a tab instead of downloading it.
    // Chromium-family browsers block downloads that originate from a
    // non-trustworthy origin, and prod is served over plain HTTP — a tab
    // navigation never enters the download pipeline, so it is unaffected.
    const blobUrl = String(pdf.output("bloburl"));
    if (tabWindow) {
      tabWindow.location.href = blobUrl;
    } else {
      const w = window.open(blobUrl, "_blank");
      if (!w) {
        throw new Error(
          "Pop-up blocked — allow pop-ups for this site to view the PDF.",
        );
      }
    }
  } else {
    pdf.save(`${slugify(projectName)}_gantt_${fmtIsoDate(new Date())}.pdf`);
  }
}
