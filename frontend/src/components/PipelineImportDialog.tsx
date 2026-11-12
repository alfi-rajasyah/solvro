// Excel/CSV import dialog for the Pipeline board (PRD §2.9, M4.18). Three
// steps — upload, preview, done — mirroring the reference app's
// `ImportExcelDialog` (../VeloraApp components/import-excel-dialog.tsx,
// read-only oracle): download a client-generated template, send the chosen
// file to the server for parsing and per-row validation
// (`previewImportFile`), then POST the valid rows through
// `useImportOpportunities` and show the server's per-row results.
//
// The browser never parses an uploaded workbook
// (docs/archive/plans/application-review-2026-10-22.md, B-18). `exceljs` is
// imported lazily (`loadExcelJs()`) only to write the template, so it never
// lands in the main bundle for users who never open this dialog.
//
// Errors render inline via `reui/alert.tsx` — Solvro has no toast system
// (frontend/CLAUDE.md / PRD §2.11).
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Modal } from "./Modal";
import { Alert, AlertDescription } from "@/components/reui/alert";
import {
  IMPORT_FILE_MAX_BYTES,
  IMPORT_ROW_CAP,
  IMPORTABLE_STAGES,
  TEMPLATE_HEADERS,
  type ParsedRow,
} from "@/components/pipeline/importParse";
import { Chip } from "@/components/StatusChip";
import { ApiError } from "@/lib/api";
import { EXCELJS_LOAD_ERROR, ExcelJsLoadError, loadExcelJs, type ExcelJsModule } from "@/lib/loadExcelJs";
import { formatIDR, type PipelineStage } from "@/lib/pipelineFormat";
import {
  previewImportFile,
  useImportOpportunities,
  type ImportOpportunitiesResult,
  type ImportOpportunityRow,
} from "@/lib/queries";
import { EMPTY_VALUE } from "@/lib/emptyValue";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Step = "upload" | "preview" | "done";

/**
 * Generates and downloads the import template workbook, client-side. A failed
 * chunk load (old tab after a deploy) is reported through `onLoadError`
 * instead of surfacing as an uncaught rejection
 * (docs/archive/plans/application-review-2026-10-22.md, F-40).
 */
async function downloadTemplate(onLoadError: (message: string) => void) {
  let ExcelJS: ExcelJsModule["default"];
  try {
    ExcelJS = (await loadExcelJs()).default;
  } catch (err) {
    onLoadError(err instanceof ExcelJsLoadError ? err.message : EXCELJS_LOAD_ERROR);
    return;
  }
  const example = [
    "Implementasi ERP",
    "PT. Maju Jaya",
    "500000000",
    "Technical Clarification",
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

  const widths = [30, 25, 18, 24, 20, 15, 25, 16, 18, 30];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Opportunities");
  ws.columns = widths.map((width) => ({ width }));
  ws.addRows([[...TEMPLATE_HEADERS], example, note]);

  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "solvro-pipeline-import-template.xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const IMPORT_FILE_MAX_MB = IMPORT_FILE_MAX_BYTES / (1024 * 1024);

export function PipelineImportDialog({ open, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const importMutation = useImportOpportunities();

  // S5: focused on every step transition so a screen reader announces the
  // new step (upload/preview/done) — only one of the three step containers
  // below is ever mounted at a time, so one ref/effect pair covers all
  // three.
  const stepRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    stepRef.current?.focus();
  }, [step]);

  // The preview request in flight, aborted when the dialog resets so a late
  // answer never lands in a closed or restarted dialog.
  const previewAbort = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    previewAbort.current?.abort();
    previewAbort.current = null;
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

    let controller: AbortController | null = null;
    try {
      // Checked here too, so a large file fails before the upload, not after.
      if (file.size > IMPORT_FILE_MAX_BYTES) {
        setParseError(`The file is larger than ${IMPORT_FILE_MAX_MB} MB. Split it into smaller files.`);
        return;
      }
      previewAbort.current?.abort();
      controller = new AbortController();
      previewAbort.current = controller;
      const { rows: parsed } = await previewImportFile(file, controller.signal);
      if (controller.signal.aborted) return;
      setRows(parsed);
      setStep("preview");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      // The server's message names the problem (unreadable file, old .xls,
      // too many rows); a network failure has its own readable message.
      setParseError(
        err instanceof ApiError && err.status === 413
          ? `The file is larger than ${IMPORT_FILE_MAX_MB} MB. Split it into smaller files.`
          : err instanceof ApiError
            ? err.message
            : "Could not read the file. Make sure it is a valid .xlsx or .csv export.",
      );
    } finally {
      // A request that was replaced or reset leaves the state to its successor.
      if (!controller || previewAbort.current === controller) setParsing(false);
      // N4: without this, re-picking the SAME file (e.g. fixed externally
      // and re-uploaded under the same name) doesn't fire another `change`
      // event — the input's value is unchanged from the browser's
      // perspective, so nothing re-triggers `handleFile`.
      if (fileRef.current) fileRef.current.value = "";
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
              className="rounded-sm border border-outline-variant px-4 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={validCount === 0 || importMutation.isPending}
              className="rounded-sm bg-primary px-4 py-1.5 text-xs font-bold text-on-primary hover:bg-primary/90 disabled:opacity-60"
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
            className="rounded-sm bg-primary px-4 py-1.5 text-xs font-bold text-on-primary hover:bg-primary/90"
          >
            Done
          </button>
        ) : (
          <button
            type="button"
            onClick={handleClose}
            className="rounded-sm border border-outline-variant px-4 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container"
          >
            Cancel
          </button>
        )
      }
    >
      {step === "upload" && (
        <div ref={stepRef} tabIndex={-1} className="space-y-4 focus:outline-hidden">
          <div className="rounded-sm border border-dashed border-outline-variant bg-surface-container-low p-4">
            <p className="mb-1 text-sm font-semibold text-on-surface">Don't have a template yet?</p>
            <p className="mb-3 text-xs text-on-surface-variant">
              Download the Excel template, fill it in, then upload it back here.
            </p>
            <button
              type="button"
              onClick={() => void downloadTemplate(setParseError)}
              className="inline-flex items-center gap-1.5 rounded-sm border border-outline-variant px-3 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-container"
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                download
              </span>
              Download template
            </button>
          </div>

          <div className="rounded-sm bg-surface-container-low p-3">
            <p className="mb-1.5 text-label-caps uppercase text-on-surface-variant">
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
            aria-disabled={parsing}
            tabIndex={parsing ? -1 : 0}
            onClick={() => {
              if (parsing) return;
              fileRef.current?.click();
            }}
            onKeyDown={(e) => {
              if (parsing) return;
              if (e.key === "Enter" || e.key === " ") {
                // N5: without this, Space also scrolls the modal body (the
                // browser's default action for Space on a non-native,
                // focusable element) on top of opening the file picker.
                e.preventDefault();
                fileRef.current?.click();
              }
            }}
            className={`rounded-sm border-2 border-dashed border-outline-variant p-8 text-center transition-colors ${
              parsing ? "cursor-wait" : "cursor-pointer hover:border-primary"
            }`}
          >
            {parsing ? (
              <div role="status" aria-live="polite" className="flex flex-col items-center gap-2">
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
                <p className="text-xs text-on-surface-variant">Format: .xlsx or .csv, up to {IMPORT_FILE_MAX_MB} MB</p>
                {fileName && <p className="mt-1 text-xs font-medium text-primary">{fileName}</p>}
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            disabled={parsing}
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
        <div ref={stepRef} tabIndex={-1} className="space-y-4 focus:outline-hidden">
          <div className="flex flex-wrap items-center gap-3">
            {/* S5: live region covers just the summary chips, not the
                "Change file" button — a screen reader shouldn't re-announce
                the button's own (unchanging) label every time the chip
                counts update. */}
            <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-3">
              <Chip tone="emerald">{validCount} valid</Chip>
              {invalidCount > 0 && <Chip tone="rose">{invalidCount} invalid</Chip>}
            </div>
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
                first {IMPORT_ROW_CAP} will be imported. Split the rest into another file.
              </AlertDescription>
            </Alert>
          )}

          <div className="max-h-72 overflow-auto rounded-sm border border-outline-variant text-xs">
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
                      {row.title || EMPTY_VALUE}
                    </td>
                    <td className="max-w-[120px] truncate px-3 py-2 text-on-surface-variant">
                      {row.customerName || EMPTY_VALUE}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-on-surface">
                      {row.dealValue > 0 ? formatIDR(row.dealValue) : EMPTY_VALUE}
                    </td>
                    <td className="px-3 py-2 text-on-surface-variant">{row.stage.toLowerCase() || EMPTY_VALUE}</td>
                    <td className="px-3 py-2 text-on-surface-variant">
                      {row.picName ? (
                        <span className={row.picId ? "" : "italic text-warning"}>
                          {row.picName}
                          {!row.picId && " (not found)"}
                        </span>
                      ) : (
                        EMPTY_VALUE
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
        <div ref={stepRef} tabIndex={-1} className="space-y-4 focus:outline-hidden">
          <div className="flex flex-wrap justify-center gap-6 py-2 text-center">
            <div>
              <p className="text-2xl font-bold text-on-surface">{result.totalRows}</p>
              {/* S3: relabeled from "Total rows" — `result.totalRows` is the
                  count of rows POSTed to the server (client-valid rows only,
                  capped at IMPORT_ROW_CAP), not every row in the workbook.
                  The old "Total rows" label read as "every row we saw", which
                  silently hid however many rows `invalidCount` (below) never
                  made it past the client-side preview at all. */}
              <p className="mt-0.5 text-xs text-on-surface-variant">Rows submitted</p>
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
            <div>
              {/* S3: `invalidCount` here is the OUTER component-scope value
                  (rows.filter(status === "invalid").length) computed from the
                  preview's full parsed set, which is still around unchanged —
                  NOT `result.invalidCount` (that one only counts rows the
                  SERVER rejected among the ones actually submitted). These
                  rows never left the browser, so the server's response has
                  no record of them at all; this tile is the only place they
                  stay visible instead of silently vanishing between the
                  preview and done steps. */}
              <p className="text-2xl font-bold text-on-surface-variant">{invalidCount}</p>
              <p className="mt-0.5 text-xs text-on-surface-variant">Rejected before upload</p>
            </div>
          </div>

          {result.results.length > 0 && (
            <div className="max-h-64 overflow-auto rounded-sm border border-outline-variant text-xs">
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
                    // `r.row` is 1-based into the rows THIS DIALOG SUBMITTED
                    // (client-valid rows only) — used here purely to look up
                    // `submittedRows[r.row - 1]`, never rendered directly.
                    const submitted = submittedRows[r.row - 1];
                    return (
                      <tr key={`${r.row}-${i}`}>
                        {/* S3: the workbook row number (matches the preview
                            step's own "#" column), not `r.row` — `r.row` is
                            an index into the submitted subset, so on a
                            workbook where earlier rows were rejected
                            client-side, it would relabel e.g. workbook row 4
                            as "#1" here, disagreeing with what the preview
                            step showed for that same row. */}
                        <td className="px-3 py-2 text-on-surface-variant">
                          {submitted?.rowNum ?? r.row}
                        </td>
                        <td className="max-w-[150px] truncate px-3 py-2 text-on-surface">
                          {submitted?.title || EMPTY_VALUE}
                        </td>
                        <td className="max-w-[120px] truncate px-3 py-2 text-on-surface-variant">
                          {submitted?.customerName || EMPTY_VALUE}
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
