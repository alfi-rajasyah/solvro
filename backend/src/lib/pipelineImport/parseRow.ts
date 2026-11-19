// Row parsing and validation for the Pipeline Excel/CSV import (PRD §2.9).
// Moved from the browser (frontend importParse.ts) to the backend so the
// browser never parses a workbook (docs/archive/plans/application-review-2026-10-22.md,
// B-18). `POST /opportunities/import/preview` returns these rows; the dialog
// shows them and sends the valid ones to `POST /opportunities/import`, which
// validates every field again. Mirrors the reference app's client-side
// parsing (../VeloraApp components/import-excel-dialog.tsx, read-only):
// trim/lowercase/underscore stage normalization, DD/MM/YYYY or Excel-serial
// deadline parsing, and PIC matching by username.
import { PipelineStage } from "@prisma/client";

/** Stages the template accepts, in board order: every `PipelineStage`. */
export const IMPORTABLE_STAGES: PipelineStage[] = [
  PipelineStage.ASSESSMENT,
  PipelineStage.TECHNICAL_CLARIFICATION,
  PipelineStage.POC,
  PipelineStage.RFP,
  PipelineStage.DELIVER_PROPOSAL,
  PipelineStage.WAITING_RESPONSE,
];

// Days between Excel's 1900 and 1904 date systems.
const DATE_1904_OFFSET = 1462;

export interface ParsedRow {
  rowNum: number;
  title: string;
  customerName: string;
  dealValue: number;
  // Uppercased candidate stage token. It may not be a valid PipelineStage;
  // `status`/`errors` decide whether the row is ever submitted.
  stage: string;
  picName: string;
  picId: number | null;
  deadline: string | null; // "yyyy-MM-dd" day string, never an ISO instant
  productSolution: string;
  winProbability: number;
  leadSource: string;
  activityLog: string;
  status: "valid" | "invalid";
  errors: string[];
}

/**
 * Cell value -> "yyyy-MM-dd" day string. Handles both a "DD/MM/YYYY" string
 * (the template's own format) and an Excel serial date number, matching the
 * reference's `parseExcelDate` — Excel serials carry no timezone of their
 * own, so the UTC-getter math below is exact, not a TZ-drift shortcut.
 */
export function parseExcelDate(val: unknown, date1904 = false): string | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "string") {
    const trimmed = val.trim();
    const parts = trimmed.split("/");
    if (parts.length === 3) {
      const [d, m, y] = parts;
      if (y.length === 4) return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    if (trimmed.includes("-")) return trimmed.split("T")[0];
    return null;
  }
  if (typeof val === "number") {
    const serial = date1904 ? val + DATE_1904_OFFSET : val;
    const ms = Math.round((serial - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return null;
}

/**
 * Real calendar validity check for a "yyyy-MM-dd" day string — month 1-12,
 * day valid for that month (leap-year-aware for February). Deliberately
 * NOT delegated to `new Date(...)`: JS Date silently rolls an
 * out-of-range day into the next month (`new Date("2026-02-30")` becomes
 * 2026-03-02) rather than rejecting it, which is exactly the class of
 * impossible date `parseImportRow`'s deadline check exists to catch
 * (review finding S1) — `parseExcelDate` above only reformats digits, it
 * never validates them.
 */
function isValidCalendarDay(day: string): boolean {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!parts) return false;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const date = Number(parts[3]);
  if (month < 1 || month > 12) return false;
  if (date < 1) return false;
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return date <= daysInMonth[month - 1];
}

/**
 * Deal Value cell -> a plain number, handling Indonesian-style grouped
 * digits ("1.500.000.000" -> 1500000000) as well as a trailing decimal
 * fraction ("1.500,75" -> 1500.75), by a purely positional rule: any run of
 * exactly three digits between separators (`.` or `,`, either works — the
 * template is Indonesian but a pasted Western export shouldn't corrupt
 * either) is a thousands group; a final run that ISN'T exactly three digits
 * is the decimal fraction instead. A run that fits neither — a non-trailing
 * group that isn't exactly three digits, e.g. "1.50.000" — is rejected as
 * ambiguous rather than guessed at (review finding S2; this is what used to
 * make `"1.500.000.000"` parse as `1.5`, `Number.parseFloat` stopping at
 * the second "."). A leading "-" is preserved rather than stripped, so a
 * negative cell parses to a negative number and trips `parseImportRow`'s
 * own `>= 0` check instead of silently becoming positive.
 *
 * Returns null for a blank cell (`parseImportRow` decides blank semantics —
 * see finding N3) or an unparseable/ambiguous one.
 */
export function parseDealValueCell(raw: unknown): number | null {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") return null;

  const negative = trimmed.startsWith("-");
  const cleaned = (negative ? trimmed.slice(1) : trimmed).replace(/[^0-9.,]/g, "");
  if (cleaned === "") return null;

  let magnitude: number;
  if (!/[.,]/.test(cleaned)) {
    if (!/^\d+$/.test(cleaned)) return null;
    magnitude = Number(cleaned);
  } else {
    const groups = cleaned.split(/[.,]/);
    const first = groups[0];
    const last = groups[groups.length - 1];
    const middle = groups.slice(1, -1);

    if (!/^\d{1,3}$/.test(first)) return null;
    if (middle.some((g) => !/^\d{3}$/.test(g))) return null;

    if (/^\d{3}$/.test(last)) {
      magnitude = Number(first + middle.join("") + last);
    } else if (/^\d+$/.test(last)) {
      magnitude = Number(`${first}${middle.join("")}.${last}`);
    } else {
      return null;
    }
  }

  if (!Number.isFinite(magnitude)) return null;
  return negative ? -magnitude : magnitude;
}

/**
 * The rows of a sheet (array of cell arrays, header first), minus the header row and any "note" row (starts with "*", the
 * same convention the generated template itself writes its hints with) or
 * fully-blank row.
 */
export function extractDataRows(rows: unknown[][]): unknown[][] {
  return rows.slice(1).filter((r) => {
    const hasData = r.some((cell) => String(cell).trim() !== "");
    const isNote = String(r[0] ?? "").trim().startsWith("*");
    return hasData && !isNote;
  });
}

/**
 * Parses and validates one data row (positional cells, `TEMPLATE_HEADERS`
 * order) into a `ParsedRow`. `idx` is the row's 0-based position within the
 * already-`extractDataRows`-filtered list; `rowNum` (`idx + 2`) reconstructs
 * the workbook row a user would see in Excel (1 for the header, 1-based
 * counting) purely for display — it plays no role in validation.
 * `picByUsername` maps a lowercased `User.username` to its id, mirroring
 * the reference's full_name-keyed PIC lookup; an unmatched name leaves
 * `picId` null WITHOUT invalidating the row (same as the oracle) — a PIC is
 * a convenience match, not a required field.
 */
export function parseImportRow(
  cells: unknown[],
  idx: number,
  picByUsername: Map<string, number>,
  date1904 = false,
): ParsedRow {
  const errors: string[] = [];
  const title = String(cells[0] ?? "").trim();
  const customerName = String(cells[1] ?? "").trim();
  const dealValueRaw = cells[2];
  const stageRaw = String(cells[3] ?? "")
    .trim()
    .toLowerCase()
    .replace(/ /g, "_");
  const picNameRaw = String(cells[4] ?? "").trim();
  const deadlineRaw = cells[5];
  const productSolution = String(cells[6] ?? "").trim();
  const winProbRaw = cells[7];
  const leadSource = String(cells[8] ?? "").trim();
  const activityLog = String(cells[9] ?? "").trim();

  if (!title) errors.push("Title is required.");
  if (!customerName) errors.push("Company is required.");

  const dealValueCell = String(dealValueRaw ?? "").trim();
  let dealValue: number;
  if (dealValueCell === "") {
    // N3: a blank Deal Value cell defaults to 0 (server parity), not a
    // validation error.
    dealValue = 0;
  } else {
    const parsedDealValue = parseDealValueCell(dealValueRaw);
    if (parsedDealValue === null || parsedDealValue < 0) {
      errors.push("Deal Value must be a number.");
      dealValue = 0;
    } else {
      dealValue = parsedDealValue;
    }
  }

  const stageUpper = stageRaw.toUpperCase();
  if (!(IMPORTABLE_STAGES as string[]).includes(stageUpper)) {
    errors.push(
      `Invalid stage "${String(cells[3] ?? "")}". Use one of: ${IMPORTABLE_STAGES.map((s) => s.toLowerCase()).join(", ")}.`,
    );
  }

  // A blank cell keeps the 50 default; a filled cell that is not a whole
  // number is a row error rather than a silent 50.
  const winProbCell = String(winProbRaw ?? "").trim();
  let winProbability = 50;
  if (winProbCell !== "") {
    // Whole numbers only, with an optional trailing %: "0.7", "12abc" and
    // "1e2" are errors, not a silently truncated or rescaled value.
    const winProbParsed = /^\d{1,3}%?$/.test(winProbCell) ? Number(winProbCell.replace("%", "")) : Number.NaN;
    if (!Number.isFinite(winProbParsed)) {
      errors.push("Win Probability must be a number between 0 and 100.");
    } else if (winProbParsed < 0 || winProbParsed > 100) {
      errors.push("Win Probability must be between 0 and 100.");
    } else {
      winProbability = winProbParsed;
    }
  }

  const deadlineCell = String(deadlineRaw ?? "").trim();
  const deadline = parseExcelDate(deadlineRaw, date1904);
  // S1: a non-empty deadline cell that fails to parse OR fails a real
  // calendar check (`31/13/2026`, `30/02/2026`) is invalid — `parseExcelDate`
  // only reformats digits, it doesn't validate them (it previously produced
  // "2026-13-31" for `31/13/2026` and passed it straight through as-if valid).
  if (deadlineCell !== "" && (deadline === null || !isValidCalendarDay(deadline))) {
    errors.push("Deadline must be DD/MM/YYYY.");
  }
  const picId = picNameRaw ? (picByUsername.get(picNameRaw.toLowerCase()) ?? null) : null;

  return {
    rowNum: idx + 2,
    title,
    customerName,
    dealValue,
    stage: stageUpper,
    picName: picNameRaw,
    picId,
    deadline,
    productSolution,
    winProbability,
    leadSource,
    activityLog,
    status: errors.length > 0 ? "invalid" : "valid",
    errors,
  };
}
