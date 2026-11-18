// RFC 4180 CSV reader for the Pipeline import. Every cell stays a string;
// the row parser converts numbers and dates itself. The delimiter is the
// most frequent of comma, semicolon and tab on the first line, because
// Excel in an Indonesian or other comma-decimal locale saves CSV with
// semicolons.
import { MAX_COLUMNS, MAX_FILE_ROWS, tooManyRows } from "./errors.js";

function sniffDelimiter(text: string): string {
  const counts = new Map<string, number>([
    [",", 0],
    [";", 0],
    ["\t", 0],
  ]);
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === "\n" || ch === "\r")) break;
    else if (!quoted && counts.has(ch)) counts.set(ch, counts.get(ch)! + 1);
  }
  let best = ",";
  for (const [d, n] of counts) if (n > counts.get(best)!) best = d;
  return best;
}

export function readCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const delim = sniffDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let i = 0;

  const endCell = () => {
    if (row.length < MAX_COLUMNS) row.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    if (row.some((c) => c.trim() !== "")) {
      rows.push(row);
      if (rows.length > MAX_FILE_ROWS + 1) throw tooManyRows();
    }
    row = [];
  };

  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        cell += ch;
      }
      i++;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delim) endCell();
    else if (ch === "\n" || ch === "\r") {
      endRow();
      if (ch === "\r" && src[i + 1] === "\n") i++;
    } else cell += ch;
    i++;
  }
  if (cell !== "" || row.length > 0) endRow();
  return rows;
}
