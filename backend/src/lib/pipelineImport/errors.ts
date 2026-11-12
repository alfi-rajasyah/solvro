// The one error type the import-file readers throw. `code` is the API error
// code the preview route answers with; `message` is shown in the dialog as is.
export type ImportFileErrorCode = "unreadable_file" | "legacy_xls" | "empty_file" | "too_many_rows";

export class ImportFileError extends Error {
  constructor(
    readonly code: ImportFileErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ImportFileError";
  }
}

export const UNREADABLE_FILE_MESSAGE = "Could not read the file. Make sure it is a valid .xlsx or .csv export.";

/** Most data rows one file may hold, header excluded. The import itself takes 500 per call. */
export const MAX_FILE_ROWS = 5000;

/**
 * Most `<row>` and `<c>` elements one sheet may hold, blank ones included,
 * so a sheet of empty or out-of-range cells cannot keep the reader busy.
 */
export const MAX_SHEET_ROW_ELEMENTS = 50_000;
export const MAX_SHEET_CELL_ELEMENTS = 200_000;

/** Columns read from each row. The template has 10; the rest are ignored. */
export const MAX_COLUMNS = 16;

export function tooManyRows(): ImportFileError {
  return new ImportFileError(
    "too_many_rows",
    `The file has more than ${MAX_FILE_ROWS} rows. Split it into smaller files.`,
  );
}
