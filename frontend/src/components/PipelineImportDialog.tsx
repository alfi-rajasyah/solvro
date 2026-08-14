// Excel/CSV import dialog for the Pipeline board (PRD §2.9, M4.18). Three
// steps — upload, preview, done — mirroring the reference app's
// `ImportExcelDialog` (../VeloraApp components/import-excel-dialog.tsx,
// read-only oracle): download a client-generated template, parse the
// workbook client-side with per-row validation, then POST the valid rows
// through `useImportOpportunities` and show the server's per-row results.
//
// `xlsx` (SheetJS) is imported lazily (`await import("xlsx")`), both here
// and in `downloadTemplate` below, so the ~600KB parser never lands in the
// main bundle for users who never open this dialog — the only approved new
// frontend dependency this program introduces (root CLAUDE.md Guardrails).
//
// Errors render inline via `reui/alert.tsx` — Solvro has no toast system
// (frontend/CLAUDE.md / PRD §2.11).
import { useCallback, useRef, useState, type ChangeEvent } from "react";
import { Modal } from "./Modal";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { Chip } from "@/components/StatusChip";
import { ApiError } from "@/lib/api";
import { formatIDR, STAGE_ORDER, type PipelineStage } from "@/lib/pipelineFormat";
import {
  useImportOpportunities,
  useUsers,
  type ImportOpportunitiesResult,
  type ImportOpportunityRow,
} from "@/lib/queries";

interface Props {
  open: boolean;
  onClose: () => void;
}

// Stages the import template accepts — mirrors the reference's
// `VALID_STAGES` (../VeloraApp components/import-excel-dialog.tsx) and
// backend/src/routes/opportunities.ts's own rule that HOLD is reached only
// through the board's move flow, never on create (and by extension, import).
const IMPORTABLE_STAGES: PipelineStage[] = STAGE_ORDER.filter((s) => s !== "HOLD");

// Mirrors backend/src/routes/opportunities.ts's `IMPORT_ROW_CAP` — the
// server 400s the whole call above this, so the dialog caps what it sends
// in one request rather than letting a large workbook silently fail.
const IMPORT_ROW_CAP = 500;

const TEMPLATE_HEADERS = [
  "Title",
  "Company",
  "Deal Value",
  "Stage",
  "PIC",
  "Deadline",
  "Product / Solution",
  "Win Probability",
  "Lead Source",
  "Activity Log",
];

type Step = "upload" | "preview" | "done";

interface ParsedRow {
  rowNum: number;
  title: string;
  customerName: string;
  dealValue: number;
  // Uppercased candidate stage token — may not be a valid PipelineStage;
  // `status`/`errors` below are what gates whether it's ever submitted.
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
function parseExcelDate(val: unknown): string | null {
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
    const ms = Math.round((val - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return null;
}

/** Generates and downloads the import template workbook, client-side. */
function downloadTemplate() {
  void import("xlsx").then((XLSX) => {
    const example = [
      "Implementasi ERP",
      "PT. Maju Jaya",
      "500000000",
      "assessment",
      "",
      "30/06/2026",
      "ERP Implementation",
      "70",
      "Referral",
      "Initial meeting done, client is interested in the finance module",
    ];
    const note = [
      `* Valid stages: ${IMPORTABLE_STAGES.map((s) => s.toLowerCase()).join(", ")}`,
      "",
      "",
      "",
      "",
      "* Format: DD/MM/YYYY",
      "",
      "* Number 0-100",
      "",
      "* Optional: seeds the deal's first activity note",
    ];

    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, example, note]);
    ws["!cols"] = [
      { wch: 30 },
      { wch: 25 },
      { wch: 18 },
      { wch: 24 },
      { wch: 20 },
      { wch: 15 },
      { wch: 25 },
      { wch: 16 },
      { wch: 18 },
      { wch: 30 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Opportunities");
    XLSX.writeFile(wb, "solvro-pipeline-import-template.xlsx");
  });
}

export function PipelineImportDialog({ open, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: users } = useUsers();
  const importMutation = useImportOpportunities();

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [result, setResult] = useState<ImportOpportunitiesResult | null>(null);
  // The rows actually POSTed (client-valid rows, capped at IMPORT_ROW_CAP),
  // kept around so the "done" step can show title/company next to each
  // result — the server's response only echoes back `row`/`status`/`reason`
  // /`id` (backend/src/routes/opportunities.ts's ImportRowResult), not the
  // submitted fields, and `results[i]` corresponds 1:1 by array position to
  // `submittedRows[i]` since the server iterates `rows` in call order.
  const [submittedRows, setSubmittedRows] = useState<ParsedRow[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep("upload");
    setFileName("");
    setParsing(false);
    setParseError(null);
    setRows([]);
    setResult(null);
    setSubmittedRows([]);
    setSubmitError(null);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParsing(true);
    setParseError(null);
    setRows([]);

    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const firstSheet = wb.SheetNames[0];
      if (!firstSheet) throw new Error("Empty workbook");
      const ws = wb.Sheets[firstSheet];
      const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

      const picByUsername = new Map<string, number>();
      for (const u of users ?? []) picByUsername.set(u.username.toLowerCase(), u.id);

      // Skip the header row and any note row (starts with "*", same
      // convention the template itself writes its hints with).
      const dataRows = raw.slice(1).filter((r) => {
        const hasData = r.some((cell) => String(cell).trim() !== "");
        const isNote = String(r[0] ?? "").trim().startsWith("*");
        return hasData && !isNote;
      });

      const parsed: ParsedRow[] = dataRows.map((r, idx) => {
        const errors: string[] = [];
        const title = String(r[0] ?? "").trim();
        const customerName = String(r[1] ?? "").trim();
        const dealValueRaw = r[2];
        const stageRaw = String(r[3] ?? "")
          .trim()
          .toLowerCase()
          .replace(/ /g, "_");
        const picNameRaw = String(r[4] ?? "").trim();
        const deadlineRaw = r[5];
        const productSolution = String(r[6] ?? "").trim();
        const winProbRaw = r[7];
        const leadSource = String(r[8] ?? "").trim();
        const activityLog = String(r[9] ?? "").trim();

        if (!title) errors.push("Title is required.");
        if (!customerName) errors.push("Company is required.");

        const dealValue = Number.parseFloat(String(dealValueRaw).replace(/[^0-9.]/g, ""));
        if (!Number.isFinite(dealValue) || dealValue < 0) {
          errors.push("Deal Value must be a number.");
        }

        const stageUpper = stageRaw.toUpperCase();
        if (!IMPORTABLE_STAGES.includes(stageUpper as PipelineStage)) {
          errors.push(
            `Invalid stage "${String(r[3] ?? "")}" — use one of: ${IMPORTABLE_STAGES.map((s) => s.toLowerCase()).join(", ")}.`,
          );
        }

        const winProbParsed = Number.parseInt(String(winProbRaw), 10);
        const winProbability = Number.isFinite(winProbParsed) ? winProbParsed : 50;
        if (String(winProbRaw).trim() !== "" && (winProbability < 0 || winProbability > 100)) {
          errors.push("Win Probability must be between 0 and 100.");
        }

        const deadline = parseExcelDate(deadlineRaw);
        const picId = picNameRaw ? (picByUsername.get(picNameRaw.toLowerCase()) ?? null) : null;

        return {
          rowNum: idx + 2,
          title,
          customerName,
          dealValue: Number.isFinite(dealValue) ? dealValue : 0,
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
      });

      setRows(parsed);
      setStep("preview");
    } catch {
      setParseError("Could not read the file. Make sure it's a valid .xlsx or .csv export.");
    } finally {
      setParsing(false);
    }
  }

  async function handleImport() {
    // Capped at IMPORT_ROW_CAP — see that constant's comment. A workbook
    // with more valid rows than the cap still imports the first
    // IMPORT_ROW_CAP of them rather than failing the whole call.
    const validRows = rows.filter((r) => r.status === "valid").slice(0, IMPORT_ROW_CAP);
    if (validRows.length === 0) return;
    setSubmitError(null);

    const payload: ImportOpportunityRow[] = validRows.map((r) => ({
      title: r.title,
      customerName: r.customerName,
      dealValue: r.dealValue,
      stage: r.stage as PipelineStage,
      picId: r.picId,
      deadline: r.deadline,
      productSolution: r.productSolution || undefined,
      winProbability: r.winProbability,
      leadSource: r.leadSource || null,
      activityLog: r.activityLog || null,
    }));

    try {
      const res = await importMutation.mutateAsync(payload);
      setSubmittedRows(validRows);
      setResult(res);
      setStep("done");
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Import failed.");
    }
  }

  function handleChangeFile() {
    setRows([]);
    setParseError(null);
    setStep("upload");
    if (fileRef.current) fileRef.current.value = "";
  }

  const validCount = rows.filter((r) => r.status === "valid").length;
  const invalidCount = rows.filter((r) => r.status === "invalid").length;
  const importCount = Math.min(validCount, IMPORT_ROW_CAP);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Import opportunities"
      widthClass="max-w-3xl"
      footer={
        step === "preview" ? (
          <>
            <button
              type="button"
              onClick={handleClose}
              disabled={importMutation.isPending}
              className="rounded-lg border border-outline-variant px-4 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={validCount === 0 || importMutation.isPending}
              className="rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-on-primary hover:bg-primary/90 disabled:opacity-60"
            >
              {importMutation.isPending
                ? "Importing…"
                : `Import ${importCount} valid row${importCount === 1 ? "" : "s"}`}
            </button>
          </>
        ) : step === "done" ? (
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-on-primary hover:bg-primary/90"
          >
            Done
          </button>
        ) : (
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-outline-variant px-4 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container"
          >
            Cancel
          </button>
        )
      }
    >
      {step === "upload" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-dashed border-outline-variant bg-surface-container-low p-4">
            <p className="mb-1 text-sm font-semibold text-on-surface">Don't have a template yet?</p>
            <p className="mb-3 text-xs text-on-surface-variant">
              Download the Excel template, fill it in, then upload it back here.
            </p>
            <button
              type="button"
              onClick={downloadTemplate}
              className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-container"
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                download
              </span>
              Download template
            </button>
          </div>

          <div className="rounded-lg bg-surface-container-low p-3">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              Valid stages
            </p>
            <div className="flex flex-wrap gap-1.5">
              {IMPORTABLE_STAGES.map((s) => (
                <Chip key={s} tone="gray">
                  {s.toLowerCase()}
                </Chip>
              ))}
            </div>
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
            }}
            className="cursor-pointer rounded-lg border-2 border-dashed border-outline-variant p-8 text-center transition-colors hover:border-primary"
          >
            {parsing ? (
              <div className="flex flex-col items-center gap-2">
                <span className="material-symbols-outlined animate-spin text-3xl text-primary" aria-hidden="true">
                  progress_activity
                </span>
                <p className="text-sm text-on-surface-variant">Reading file…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <span className="material-symbols-outlined text-3xl text-on-surface-variant" aria-hidden="true">
                  upload_file
                </span>
                <p className="text-sm font-medium text-on-surface">Click to upload a file</p>
                <p className="text-xs text-on-surface-variant">Format: .xlsx or .csv</p>
                {fileName && <p className="mt-1 text-xs font-medium text-primary">{fileName}</p>}
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={handleFile}
          />

          {parseError && (
            <Alert variant="destructive">
              <AlertDescription>{parseError}</AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Chip tone="emerald">{validCount} valid</Chip>
            {invalidCount > 0 && <Chip tone="rose">{invalidCount} invalid</Chip>}
            <button
              type="button"
              onClick={handleChangeFile}
              className="ml-auto flex items-center gap-1 text-xs text-on-surface-variant hover:text-on-surface"
            >
              <span className="material-symbols-outlined text-sm" aria-hidden="true">
                close
              </span>
              Change file
            </button>
          </div>

          {validCount > IMPORT_ROW_CAP && (
            <Alert variant="warning">
              <AlertDescription>
                {validCount} rows are valid, but a single import is capped at {IMPORT_ROW_CAP}. Only the
                first {IMPORT_ROW_CAP} will be imported — split the rest into another file.
              </AlertDescription>
            </Alert>
          )}

          <div className="max-h-72 overflow-auto rounded-lg border border-outline-variant text-xs">
            <table className="w-full">
              <thead className="sticky top-0 bg-surface-container-low">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">#</th>
                  <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">Status</th>
                  <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">Title</th>
                  <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">Company</th>
                  <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">Deal value</th>
                  <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">Stage</th>
                  <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">PIC</th>
                  <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">Reason</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.rowNum}
                    className={
                      row.status === "invalid"
                        ? "border-l-2 border-l-error bg-error-container/20"
                        : "border-l-2 border-l-transparent"
                    }
                  >
                    <td className="px-3 py-2 text-on-surface-variant">{row.rowNum}</td>
                    <td className="px-3 py-2">
                      {row.status === "valid" ? (
                        <Chip tone="emerald">Valid</Chip>
                      ) : (
                        <Chip tone="rose">Invalid</Chip>
                      )}
                    </td>
                    <td className="max-w-[150px] truncate px-3 py-2 font-medium text-on-surface">
                      {row.title || "—"}
                    </td>
                    <td className="max-w-[120px] truncate px-3 py-2 text-on-surface-variant">
                      {row.customerName || "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-on-surface">
                      {row.dealValue > 0 ? formatIDR(row.dealValue) : "—"}
                    </td>
                    <td className="px-3 py-2 text-on-surface-variant">{row.stage.toLowerCase() || "—"}</td>
                    <td className="px-3 py-2 text-on-surface-variant">
                      {row.picName ? (
                        <span className={row.picId ? "" : "italic text-warning"}>
                          {row.picName}
                          {!row.picId && " (not found)"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="max-w-[180px] px-3 py-2 text-error">
                      {row.status === "invalid" && row.errors.join("; ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {submitError && (
            <Alert variant="destructive">
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {step === "done" && result && (
        <div className="space-y-4">
          <div className="flex flex-wrap justify-center gap-6 py-2 text-center">
            <div>
              <p className="text-2xl font-bold text-on-surface">{result.totalRows}</p>
              <p className="mt-0.5 text-xs text-on-surface-variant">Total rows</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-primary">{result.validCount}</p>
              <p className="mt-0.5 text-xs text-on-surface-variant">Imported</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-warning">{result.skipCount}</p>
              <p className="mt-0.5 text-xs text-on-surface-variant">Skipped</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-error">{result.invalidCount}</p>
              <p className="mt-0.5 text-xs text-on-surface-variant">Invalid</p>
            </div>
          </div>

          {result.results.length > 0 && (
            <div className="max-h-64 overflow-auto rounded-lg border border-outline-variant text-xs">
              <table className="w-full">
                <thead className="sticky top-0 bg-surface-container-low">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">#</th>
                    <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">Title</th>
                    <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">Company</th>
                    <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">Result</th>
                    <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((r, i) => {
                    {/* `row` is 1-based into the rows this dialog submitted —
                        cross-reference it to show what the user recognizes. */}
                    const submitted = submittedRows[r.row - 1];
                    return (
                      <tr key={`${r.row}-${i}`}>
                        <td className="px-3 py-2 text-on-surface-variant">{r.row}</td>
                        <td className="max-w-[150px] truncate px-3 py-2 text-on-surface">
                          {submitted?.title || "—"}
                        </td>
                        <td className="max-w-[120px] truncate px-3 py-2 text-on-surface-variant">
                          {submitted?.customerName || "—"}
                        </td>
                        <td className="px-3 py-2">
                          <Chip
                            tone={
                              r.status === "valid" ? "emerald" : r.status === "skipped" ? "amber" : "rose"
                            }
                          >
                            {r.status === "valid" ? "imported" : r.status}
                          </Chip>
                        </td>
                        <td className="max-w-[180px] px-3 py-2 text-on-surface-variant">{r.reason ?? ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
