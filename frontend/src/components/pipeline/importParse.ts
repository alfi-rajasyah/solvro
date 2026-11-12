// Shared shapes for the Pipeline Excel/CSV import dialog
// (`../PipelineImportDialog.tsx`, PRD §2.9). The file itself is parsed and
// validated on the backend (`POST /opportunities/import/preview`,
// backend/src/lib/pipelineImport/parseRow.ts), so the browser never parses a
// workbook (docs/archive/plans/application-review-2026-10-22.md, B-18).
import { STAGE_ORDER, type PipelineStage } from "@/lib/pipelineFormat";

/** Stages the template accepts: every `PipelineStage`, in board order. */
export const IMPORTABLE_STAGES: PipelineStage[] = STAGE_ORDER;

// Mirrors backend/src/routes/opportunities.ts's `IMPORT_ROW_CAP`. The server
// answers 400 for the whole call above this, so the dialog caps what it
// sends in one request.
export const IMPORT_ROW_CAP = 500;

/** The import file's size limit, as enforced by the preview route. */
export const IMPORT_FILE_MAX_BYTES = 1024 * 1024;

export const TEMPLATE_HEADERS = [
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
] as const;

/** One row of the preview, as `POST /opportunities/import/preview` returns it. */
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
