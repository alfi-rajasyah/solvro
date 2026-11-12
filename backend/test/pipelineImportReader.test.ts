// File readers behind POST /opportunities/import/preview
// (src/lib/pipelineImport/): .xlsx, .csv, format detection and the limits
// that keep a hostile file from exhausting the backend.
import { describe, expect, it } from "vitest";
import { readImportFile, parseImportFile, ImportFileError } from "../src/lib/pipelineImport/index.js";
import { readCsv } from "../src/lib/pipelineImport/csv.js";
import { MAX_FILE_ROWS } from "../src/lib/pipelineImport/errors.js";
import { decodeXmlText } from "../src/lib/pipelineImport/xml.js";
import { buildXlsx, buildZip } from "./xlsxFixture.js";

const HEADER = [
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

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    if (err instanceof ImportFileError) return err.code;
    throw err;
  }
  return undefined;
}

describe("readImportFile: xlsx", () => {
  it("reads the first sheet: shared strings, numbers, booleans, blanks", () => {
    const buf = buildXlsx([HEADER, ["Deal A", "PT A & Co", 500000000, "rfp", null, 46203, "ERP", 70, true, ""]]);
    const { rows, date1904 } = readImportFile(buf);
    expect(date1904).toBe(false);
    expect(rows).toEqual([HEADER, ["Deal A", "PT A & Co", 500000000, "rfp", "", 46203, "ERP", 70, true, ""]]);
  });

  it("skips blank rows and fills skipped columns with empty strings", () => {
    const sheetXml = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
      <row r="1"><c r="A1" t="inlineStr"><is><t>Title</t></is></c></row>
      <row r="2"><c r="A2"/></row>
      <row r="5"><c r="A5" t="inlineStr"><is><r><t>Rich </t></r><r><t>text</t></r><rPh><t>skip</t></rPh></is></c><c r="D5" t="str"><f>LOWER("RFP")</f><v>rfp</v></c><c r="Z5"><v>1</v></c></row>
    </sheetData></worksheet>`;
    const { rows } = readImportFile(buildXlsx([], { sheetXml }));
    expect(rows).toEqual([["Title"], ["Rich text", "", "", "rfp"]]);
  });

  it("reads tags with a namespace prefix", () => {
    const sheetXml = `<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData><x:row r="1"><x:c r="B1" t="inlineStr"><x:is><x:t>Company</x:t></x:is></x:c><x:c r="C1"><x:v>12.5</x:v></x:c></x:row></x:sheetData></x:worksheet>`;
    expect(readImportFile(buildXlsx([], { sheetXml })).rows).toEqual([["", "Company", 12.5]]);
  });

  it("reports the 1904 date system and shifts deadlines by it", () => {
    const buf = buildXlsx([HEADER, ["Deal", "Co", 1, "rfp", "", 44741, "", "", "", ""]], { date1904: true });
    expect(readImportFile(buf).date1904).toBe(true);
    // 44741 in the 1904 system is 2026-06-30.
    expect(parseImportFile(buf, new Map())[0].deadline).toBe("2026-06-30");
  });

  it("refuses an archive that expands past the limit", () => {
    const bomb = buildZip([
      { name: "_rels/.rels", data: "<Relationships/>" },
      { name: "xl/workbook.xml", data: Buffer.alloc(80 * 1024 * 1024, 0x20), fakeSize: 100 },
    ]);
    expect(bomb.length).toBeLessThan(2 * 1024 * 1024);
    expect(codeOf(() => readImportFile(bomb))).toBe("unreadable_file");
  });

  it("refuses a corrupt ZIP", () => {
    const buf = buildXlsx([HEADER]);
    expect(codeOf(() => readImportFile(buf.subarray(0, buf.length - 30)))).toBe("unreadable_file");
  });

  it("refuses a ZIP that is not a workbook", () => {
    expect(codeOf(() => readImportFile(buildZip([{ name: "a.txt", data: "hello" }])))).toBe("unreadable_file");
  });

  it("refuses more than MAX_FILE_ROWS data rows", () => {
    const rows = [HEADER, ...Array.from({ length: MAX_FILE_ROWS + 1 }, (_, i) => [`Deal ${i}`])];
    expect(codeOf(() => readImportFile(buildXlsx(rows)))).toBe("too_many_rows");
    expect(codeOf(() => readImportFile(buildXlsx(rows.slice(0, -1))))).toBeUndefined();
  });
});

describe("readImportFile: format detection", () => {
  it("names a legacy .xls or password-protected file", () => {
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    expect(codeOf(() => readImportFile(ole))).toBe("legacy_xls");
  });

  it("refuses an empty file and binary data", () => {
    expect(codeOf(() => readImportFile(Buffer.alloc(0)))).toBe("empty_file");
    expect(codeOf(() => readImportFile(Buffer.from([0x41, 0x00, 0x42])))).toBe("unreadable_file");
  });

  it("reads other text as CSV", () => {
    expect(readImportFile(Buffer.from("Title,Company\nA,B\n")).rows).toEqual([
      ["Title", "Company"],
      ["A", "B"],
    ]);
  });
});

describe("readCsv", () => {
  it("handles quotes, escaped quotes, CRLF and a BOM", () => {
    expect(readCsv('﻿Title,Note\r\n"A, b","say ""hi""\nnext line"\r\n')).toEqual([
      ["Title", "Note"],
      ["A, b", 'say "hi"\nnext line'],
    ]);
  });

  it("detects a semicolon delimiter", () => {
    expect(readCsv("Title;Deal Value\nA;1.500.000,75\n")).toEqual([
      ["Title", "Deal Value"],
      ["A", "1.500.000,75"],
    ]);
  });

  it("detects a tab delimiter and drops blank rows", () => {
    expect(readCsv("a\tb\n\n\t\nc\td")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("refuses more than MAX_FILE_ROWS data rows", () => {
    const text = ["Title", ...Array.from({ length: MAX_FILE_ROWS + 1 }, (_, i) => `r${i}`)].join("\n");
    expect(codeOf(() => readCsv(text))).toBe("too_many_rows");
  });
});

describe("decodeXmlText", () => {
  it("decodes built-in, numeric and OOXML escapes only", () => {
    expect(decodeXmlText("a &lt;b&gt; &amp; &#65;&#x42; _x000D_ &unknown;")).toBe("a <b> & AB \r &unknown;");
  });
});

describe("parseImportFile", () => {
  it("matches PIC usernames and validates rows", () => {
    const csv = [
      HEADER.join(","),
      "Deal A,PT A,\"1.500.000\",Technical Clarification,Budi,30/06/2026,ERP,70,Referral,Met",
      ",PT B,,assessment,,,,,,",
    ].join("\n");
    const rows = parseImportFile(Buffer.from(csv), new Map([["budi", 7]]));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      rowNum: 2,
      status: "valid",
      title: "Deal A",
      dealValue: 1500000,
      stage: "TECHNICAL_CLARIFICATION",
      picId: 7,
      deadline: "2026-06-30",
    });
    expect(rows[1]).toMatchObject({ rowNum: 3, status: "invalid", errors: ["Title is required."] });
  });
});
