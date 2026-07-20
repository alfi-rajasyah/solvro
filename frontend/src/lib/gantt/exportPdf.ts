import { addDays, parseISODate, startOfDay, type Row } from "./geometry";
import {
  HOLIDAY_HEX,
  PRIORITY_BORDER_HEX,
  WEEKEND_HEX,
  barFillHex,
  type ColorByMode,
} from "./palette";
import type { Holiday } from "@/lib/queries";

interface ExportPdfOpts {
  projectName: string;
  rows: Row[];
  exportStart: Date;
  exportEnd: Date;
  holidays: Holiday[];
  colorBy: ColorByMode;
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

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace(/^#/, "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [r, g, b];
}

export async function exportGanttToPdf(opts: ExportPdfOpts): Promise<void> {
  const { projectName, rows, exportStart, exportEnd, holidays, colorBy, tabWindow } = opts;

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
  // Column width is computed to fit either one page (preferred) or paginate
  // horizontally if the project is so wide that minimum-readable columns
  // wouldn't fit.
  const labelColW = 160;
  const axisH = 22;
  const minColW = 11;
  const idealColW = 18;

  const chartAreaW = usableW - labelColW;
  let colW: number;
  let daysPerPage: number;
  let pageCount: number;
  if (days.length * idealColW <= chartAreaW) {
    colW = chartAreaW / days.length;
    daysPerPage = days.length;
    pageCount = 1;
  } else if (days.length * minColW <= chartAreaW) {
    colW = chartAreaW / days.length;
    daysPerPage = days.length;
    pageCount = 1;
  } else {
    colW = minColW;
    daysPerPage = Math.floor(chartAreaW / colW);
    pageCount = Math.ceil(days.length / daysPerPage);
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
    pdf.setTextColor(15);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text(projectName, margin, margin + 14);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(95);
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

    // ────────── Axis: month band (top half) + day numbers (bottom half) ──
    const axisTop = margin + headerSpace;

    // Month bands
    pdf.setFillColor(241, 245, 249);
    let runStart = 0;
    let runMonth = pageDays[0]?.getMonth() ?? -1;
    let runYear = pageDays[0]?.getFullYear() ?? -1;
    function flushMonthRun(toIdx: number) {
      const x = chartLeft + runStart * colW;
      const w = (toIdx - runStart) * colW;
      if (w <= 0) return;
      pdf.setFillColor(241, 245, 249);
      pdf.rect(x, axisTop, w, axisH / 2, "F");
      pdf.setDrawColor(220);
      pdf.setLineWidth(0.3);
      pdf.rect(x, axisTop, w, axisH / 2);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(50);
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

    // Day numbers
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(80);
    for (let i = 0; i < pageDays.length; i++) {
      const d = pageDays[i];
      const cx = chartLeft + i * colW;
      // Subtle vertical column line
      pdf.setDrawColor(232);
      pdf.setLineWidth(0.2);
      pdf.line(cx, axisTop + axisH / 2, cx, chartBottom);
      pdf.setTextColor(80);
      pdf.text(
        String(d.getDate()).padStart(2, "0"),
        cx + colW / 2,
        axisTop + axisH - 4,
        { align: "center" },
      );
    }
    // Right edge of grid
    pdf.line(chartLeft + pageDaysW, axisTop + axisH / 2, chartLeft + pageDaysW, chartBottom);

    // ────────── Weekend / holiday tints (full body) ──────────
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

    // ────────── Today line (only on the page that contains today) ──────────
    const todayIdx = pageDays.findIndex((d) => d.getTime() === today.getTime());
    if (todayIdx >= 0) {
      const tx = chartLeft + todayIdx * colW + colW / 2;
      pdf.setDrawColor(239, 68, 68); // red-500
      pdf.setLineWidth(1.2);
      pdf.line(tx, chartTop, tx, chartBottom);
    }

    // ────────── Rows: label column + bars ──────────
    for (let r = 0; r < visualRows.length; r++) {
      const row = visualRows[r];
      const ry = chartTop + r * rowH;

      // Section header row: tinted background spanning full row.
      if (row.kind === "section") {
        pdf.setFillColor(241, 245, 249);
        pdf.rect(margin, ry, labelColW + pageDaysW, rowH, "F");
      }

      // Label cell
      pdf.setFontSize(rowH < 14 ? 7 : 8);
      pdf.setTextColor(15);
      const fontStyle = row.kind === "section" ? "bold" : "normal";
      pdf.setFont("helvetica", fontStyle);
      const indent =
        row.kind === "subtask" ? "    " : row.kind === "task" ? "  " : "";
      const prefix = row.kind === "section" ? "" : indent;
      // Truncate label if too long for the column.
      const labelText = `${prefix}${row.name}`;
      const maxLabelChars = Math.max(8, Math.floor(labelColW / 4));
      const drawLabel =
        labelText.length > maxLabelChars
          ? labelText.slice(0, maxLabelChars - 1) + "…"
          : labelText;
      pdf.text(drawLabel, margin + 4, ry + rowH / 2 + 2.5);

      // Row separator (bottom)
      pdf.setDrawColor(225);
      pdf.setLineWidth(0.3);
      pdf.line(margin, ry + rowH, chartLeft + pageDaysW, ry + rowH);
      // Vertical separator between label col and grid
      pdf.line(chartLeft, ry, chartLeft, ry + rowH);

      // Bar (tasks/subtasks only).
      if (
        row.start &&
        row.end &&
        (row.kind === "task" || row.kind === "subtask")
      ) {
        const startMs = startOfDay(row.start).getTime();
        const endMs = startOfDay(row.end).getTime();
        // Map start/end into this page's day range, clamping if the bar
        // straddles the page boundary.
        const pageFromMs = pageDays[0].getTime();
        const pageToMs = pageDays[pageDays.length - 1].getTime();
        if (endMs < pageFromMs || startMs > pageToMs) continue;

        const clampedStartMs = Math.max(startMs, pageFromMs);
        const clampedEndMs = Math.min(endMs, pageToMs);
        const startIdx =
          (clampedStartMs - pageFromMs) / (1000 * 60 * 60 * 24);
        const endIdx =
          (clampedEndMs - pageFromMs) / (1000 * 60 * 60 * 24);
        const bx = chartLeft + startIdx * colW + 1;
        const bw = (endIdx - startIdx + 1) * colW - 2;
        const padY = Math.max(2, rowH * 0.18);
        const by = ry + padY;
        const bh = rowH - padY * 2;

        const status = row.status ?? "TODO";
        const priority = row.priority ?? "MEDIUM";
        const [fr, fg, fb] = hexToRgb(
          barFillHex(
            { status, priority, sectionColor: row.sectionColor },
            colorBy,
          ),
        );
        const [pr, pg, pb] = hexToRgb(PRIORITY_BORDER_HEX[priority]);
        pdf.setFillColor(fr, fg, fb);
        pdf.rect(bx, by, Math.max(1, bw), bh, "F");
        // Priority border (left edge), only if the bar's start is on this page.
        if (startMs >= pageFromMs) {
          pdf.setFillColor(pr, pg, pb);
          pdf.rect(bx, by, 2, bh, "F");
        }

        // Bar label (only if there's room and we're on the page where the
        // bar starts — avoid duplicating the label across slabs).
        if (bw > 60 && startMs >= pageFromMs) {
          pdf.setFontSize(rowH < 14 ? 6.5 : 7.5);
          pdf.setTextColor(15);
          pdf.setFont("helvetica", "normal");
          const labelMax = Math.max(4, Math.floor(bw / 4));
          const barLabel =
            row.name.length > labelMax
              ? row.name.slice(0, labelMax - 1) + "…"
              : row.name;
          pdf.text(barLabel, bx + 4, by + bh / 2 + 2);
        }
      }
    }

    // Outer chart border
    pdf.setDrawColor(190);
    pdf.setLineWidth(0.4);
    pdf.rect(chartLeft, chartTop, pageDaysW, visualRows.length * rowH);
    pdf.rect(margin, chartTop, labelColW, visualRows.length * rowH);
  }

  // ────────── Final page: task table ──────────
  pdf.addPage();
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(15);
  pdf.text(`${projectName} — Tasks`, margin, margin + 14);

  const taskRows = rows.filter((r) => r.kind === "task" || r.kind === "subtask");
  const sectionLookup = new Map<string, string>();
  for (const r of rows) {
    if (r.kind === "section") sectionLookup.set(r.id, r.name);
  }

  const tableRows = taskRows.map((r) => {
    const t = r.task;
    const sectionName = r.parentRowId ? sectionLookup.get(r.parentRowId) ?? "" : "";
    const indent = r.kind === "subtask" ? "  └ " : "";
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
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [226, 232, 240], textColor: 30, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
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
    // Browser-viewer path: bypasses the download pipeline, which hangs on
    // Safe Browsing finalization on the plain-HTTP prod origin (see
    // docs/plans/gantt-ux-and-export-fixes-plan.md appendix).
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
