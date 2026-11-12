// Entry point for the Pipeline import preview: file bytes in, parsed and
// validated rows out. The format is decided from the bytes, never from the
// file name: a ZIP header means .xlsx, an OLE header means a legacy .xls
// (or a password-protected workbook), and any other text is CSV.
import { readCsv } from "./csv.js";
import { ImportFileError, UNREADABLE_FILE_MESSAGE } from "./errors.js";
import { extractDataRows, parseImportRow, type ParsedRow } from "./parseRow.js";
import { readXlsx } from "./xlsx.js";

export { ImportFileError } from "./errors.js";
export { IMPORTABLE_STAGES, type ParsedRow } from "./parseRow.js";

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

interface FileRows {
  rows: unknown[][];
  date1904: boolean;
}

export function readImportFile(buf: Buffer): FileRows {
  if (buf.length === 0) throw new ImportFileError("empty_file", "The file is empty.");
  if (buf.subarray(0, 4).equals(ZIP_MAGIC)) return readXlsx(buf);
  if (buf.subarray(0, 8).equals(OLE_MAGIC)) {
    throw new ImportFileError(
      "legacy_xls",
      "This is an old .xls workbook or a password-protected file. Save it as .xlsx without a password, or as .csv, then upload it again.",
    );
  }
  // A NUL byte means binary data or UTF-16 text, neither of which is a CSV
  // this importer reads.
  if (buf.includes(0)) {
    const utf16 = (buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff);
    throw new ImportFileError(
      "unreadable_file",
      utf16 ? "This CSV is saved as UTF-16. Save it as CSV UTF-8, then upload it again." : UNREADABLE_FILE_MESSAGE,
    );
  }
  return { rows: readCsv(decodeCsv(buf)), date1904: false };
}

/**
 * UTF-8 when the bytes are valid UTF-8, else Windows-1252: Excel's plain
 * "CSV (Comma delimited)" save uses the Windows code page, and decoding it
 * as UTF-8 would turn every accented letter into U+FFFD.
 */
export function decodeCsv(buf: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

/** `picByUsername` maps a lowercased username to a user id. */
export function parseImportFile(buf: Buffer, picByUsername: Map<string, number>): ParsedRow[] {
  const { rows, date1904 } = readImportFile(buf);
  return extractDataRows(rows).map((r, idx) => parseImportRow(r, idx, picByUsername, date1904));
}
