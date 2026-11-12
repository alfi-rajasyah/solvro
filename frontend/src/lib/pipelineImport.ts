// Wire shapes of POST /opportunities/import/preview, shared by the query
// layer and the import dialog. The server parses the file
// (backend/src/lib/pipelineImport/), never the browser
// (docs/archive/plans/application-review-2026-10-22.md, B-18).

/** The import file's size limit, as enforced by the preview route. */
export const IMPORT_FILE_MAX_BYTES = 1024 * 1024;

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
