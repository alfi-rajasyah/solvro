// Reads the first worksheet of an .xlsx into rows of cell values, the shape
// SheetJS's `sheet_to_json(ws, { header: 1, defval: "" })` gave the old
// browser-side import: strings for text, numbers for numeric cells (dates
// stay Excel serial numbers), booleans for TRUE/FALSE, "" for a blank cell.
// Only non-blank rows are returned; the first one is the header.
import { openZip, ZipError, type ZipArchive } from "./zip.js";
import {
  ImportFileError,
  MAX_COLUMNS,
  MAX_FILE_ROWS,
  MAX_SHEET_CELL_ELEMENTS,
  MAX_SHEET_ROW_ELEMENTS,
  tooManyRows,
  UNREADABLE_FILE_MESSAGE,
} from "./errors.js";
import { attrByLocalName, decodeXmlText, elements, firstInner, parseAttrs, rootPrefix, stripElements } from "./xml.js";

export type CellValue = string | number | boolean;

export interface SheetRows {
  rows: CellValue[][];
  /** The workbook counts dates from 1904 (old Mac Excel), not 1900. */
  date1904: boolean;
}

// An import file is at most 1 MB on the wire; its XML may not expand past
// this. A full 5000-row sheet with its shared strings is a few MB.
const ZIP_LIMITS = { maxEntries: 2000, maxTotalBytes: 16 * 1024 * 1024 };

function unreadable(): ImportFileError {
  return new ImportFileError("unreadable_file", UNREADABLE_FILE_MESSAGE);
}

function readText(zip: ZipArchive, path: string): string | null {
  const buf = zip.read(path);
  return buf === null ? null : buf.toString("utf8");
}

function resolveTarget(baseDir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = baseDir ? baseDir.split("/") : [];
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== "." && seg !== "") parts.push(seg);
  }
  return parts.join("/");
}

function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

interface Rel {
  type: string;
  target: string;
}

function readRels(zip: ZipArchive, partPath: string): Map<string, Rel> {
  const dir = dirOf(partPath);
  const name = partPath.slice(dir ? dir.length + 1 : 0);
  const relsPath = `${dir ? `${dir}/` : ""}_rels/${name}.rels`;
  const xml = readText(zip, relsPath);
  const out = new Map<string, Rel>();
  if (xml === null) return out;
  const p = rootPrefix(xml);
  for (const el of elements(xml, `${p}Relationship`)) {
    const a = parseAttrs(el.attrs);
    const id = a.get("Id");
    const target = a.get("Target");
    if (id && target && a.get("TargetMode") !== "External") {
      out.set(id, { type: a.get("Type") ?? "", target: resolveTarget(dir, target) });
    }
  }
  return out;
}

function textOf(xml: string, p: string): string {
  let s = "";
  for (const t of elements(stripElements(xml, `${p}rPh`), `${p}t`)) s += decodeXmlText(t.inner ?? "");
  return s;
}

function readSharedStrings(zip: ZipArchive, path: string): string[] {
  const xml = readText(zip, path);
  if (xml === null) return [];
  const p = rootPrefix(xml);
  const out: string[] = [];
  for (const si of elements(xml, `${p}si`)) out.push(si.inner === null ? "" : textOf(si.inner, p));
  return out;
}

/** "BC12" -> zero-based column 54; null when the reference has no letters. */
function columnOf(ref: string): number | null {
  let col = 0;
  let i = 0;
  while (i < ref.length) {
    const c = ref.charCodeAt(i);
    if (c >= 65 && c <= 90) col = col * 26 + (c - 64);
    else if (c >= 97 && c <= 122) col = col * 26 + (c - 96);
    else break;
    i++;
    if (col > 16384) return null;
  }
  return i === 0 ? null : col - 1;
}

function cellValue(attrs: Map<string, string>, inner: string | null, p: string, shared: string[]): CellValue {
  if (inner === null) return "";
  const type = attrs.get("t") ?? "n";
  if (type === "inlineStr") {
    const is = firstInner(inner, `${p}is`);
    return is === null ? "" : textOf(is, p);
  }
  const vRaw = firstInner(inner, `${p}v`);
  if (vRaw === null) return "";
  const v = decodeXmlText(vRaw);
  switch (type) {
    case "s":
      return shared[Number.parseInt(v, 10)] ?? "";
    case "b":
      return v.trim() === "1" || v.trim().toLowerCase() === "true";
    case "e":
      // An error cell (#N/A, #REF!) reads as blank, as SheetJS gave it.
      return "";
    case "str":
    case "d":
      return v;
    default: {
      if (v.trim() === "") return "";
      const n = Number(v);
      return Number.isFinite(n) ? n : v;
    }
  }
}

function isBlank(row: CellValue[]): boolean {
  return row.every((c) => String(c).trim() === "");
}

function readSheet(xml: string, shared: string[]): CellValue[][] {
  const p = rootPrefix(xml);
  const data = firstInner(xml, `${p}sheetData`);
  if (data === null) return [];
  const rows: CellValue[][] = [];
  let rowElements = 0;
  let cellElements = 0;
  for (const rowEl of elements(data, `${p}row`)) {
    if (++rowElements > MAX_SHEET_ROW_ELEMENTS) throw tooManyRows();
    if (rowEl.inner === null) continue;
    const row: CellValue[] = [];
    let next = 0;
    for (const c of elements(rowEl.inner, `${p}c`)) {
      if (++cellElements > MAX_SHEET_CELL_ELEMENTS) throw tooManyRows();
      const a = parseAttrs(c.attrs);
      const ref = a.get("r");
      const col = ref ? (columnOf(ref) ?? next) : next;
      next = col + 1;
      if (col >= MAX_COLUMNS) continue;
      while (row.length < col) row.push("");
      row[col] = cellValue(a, c.inner, p, shared);
    }
    if (isBlank(row)) continue;
    rows.push(row);
    // The first row is the header, so a full file holds MAX_FILE_ROWS + 1.
    if (rows.length > MAX_FILE_ROWS + 1) throw tooManyRows();
  }
  return rows;
}

export function readXlsx(buf: Buffer): SheetRows {
  try {
    const zip = openZip(buf, ZIP_LIMITS);

    let workbookPath = "xl/workbook.xml";
    for (const rel of readRels(zip, "").values()) {
      if (rel.type.endsWith("/officeDocument")) workbookPath = rel.target;
    }
    const workbook = readText(zip, workbookPath);
    if (workbook === null) throw unreadable();
    const wp = rootPrefix(workbook);

    let date1904 = false;
    for (const el of elements(workbook, `${wp}workbookPr`)) {
      const v = parseAttrs(el.attrs).get("date1904");
      date1904 = v === "1" || v === "true";
    }

    const rels = readRels(zip, workbookPath);
    let sharedPath = `${dirOf(workbookPath)}/sharedStrings.xml`;
    for (const rel of rels.values()) if (rel.type.endsWith("/sharedStrings")) sharedPath = rel.target;

    let sheetPath: string | null = null;
    for (const el of elements(workbook, `${wp}sheet`)) {
      const id = attrByLocalName(parseAttrs(el.attrs), "id");
      sheetPath = (id && rels.get(id)?.target) || null;
      break;
    }
    if (sheetPath === null) throw new ImportFileError("empty_file", "The workbook has no worksheet.");
    const sheet = readText(zip, sheetPath);
    if (sheet === null) throw unreadable();

    return { rows: readSheet(sheet, readSharedStrings(zip, sharedPath)), date1904 };
  } catch (err) {
    if (err instanceof ImportFileError) throw err;
    if (err instanceof ZipError) throw unreadable();
    throw err;
  }
}
