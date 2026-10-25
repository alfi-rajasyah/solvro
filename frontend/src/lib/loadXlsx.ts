// `xlsx` is code-split (~600KB), so loading it can fail like any lazy chunk:
// an old tab after a deploy asks for a chunk hash that no longer exists. Turn
// that into a message the dialog can show instead of an uncaught rejection
// (docs/archive/plans/application-review-2026-10-22.md, F-40).

export const XLSX_LOAD_ERROR = "Could not load the import module. Reload the page and try again.";

export class XlsxLoadError extends Error {
  constructor() {
    super(XLSX_LOAD_ERROR);
    this.name = "XlsxLoadError";
  }
}

export type XlsxModule = typeof import("xlsx");

/** `importer` is the test seam; production always uses the default dynamic import. */
export async function loadXlsx(importer: () => Promise<XlsxModule> = () => import("xlsx")): Promise<XlsxModule> {
  try {
    return await importer();
  } catch {
    throw new XlsxLoadError();
  }
}
