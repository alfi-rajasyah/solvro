import { describe, expect, it } from "vitest";
import { EXCELJS_LOAD_ERROR, ExcelJsLoadError, loadExcelJs, type ExcelJsModule } from "@/lib/loadExcelJs";

describe("loadExcelJs", () => {
  it("returns the module when the import succeeds", async () => {
    const mod = { default: {} } as unknown as ExcelJsModule;
    await expect(loadExcelJs(() => Promise.resolve(mod))).resolves.toBe(mod);
  });

  it("turns a failed chunk load into a readable error", async () => {
    const failing = () => Promise.reject(new TypeError("Failed to fetch dynamically imported module"));
    const err = await loadExcelJs(failing).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExcelJsLoadError);
    expect((err as Error).message).toBe(EXCELJS_LOAD_ERROR);
  });
});
