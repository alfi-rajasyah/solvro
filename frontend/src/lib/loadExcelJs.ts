// `exceljs` is code-split, so loading it can fail like any lazy chunk: an
// old tab after a deploy asks for a chunk hash that no longer exists. Turn
// that into a message the import dialog can show instead of an uncaught
// rejection (docs/archive/plans/application-review-2026-10-22.md, F-40).
// The import dialog only writes the template with it; reading an uploaded
// file happens on the backend (B-18).

export const EXCELJS_LOAD_ERROR = "Could not load the template module. Reload the page and try again.";

export class ExcelJsLoadError extends Error {
  constructor() {
    super(EXCELJS_LOAD_ERROR);
    this.name = "ExcelJsLoadError";
  }
}

const importExcelJs = () => import("exceljs");

export type ExcelJsModule = Awaited<ReturnType<typeof importExcelJs>>;

/** `importer` is the test seam; production always uses the default dynamic import. */
export async function loadExcelJs(importer: () => Promise<ExcelJsModule> = importExcelJs): Promise<ExcelJsModule> {
  try {
    return await importer();
  } catch {
    throw new ExcelJsLoadError();
  }
}
