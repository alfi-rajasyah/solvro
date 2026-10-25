import { describe, expect, it } from "vitest";
import { loadXlsx, XLSX_LOAD_ERROR, XlsxLoadError, type XlsxModule } from "@/lib/loadXlsx";

describe("loadXlsx", () => {
  it("returns the module when the import succeeds", async () => {
    const mod = { utils: {} } as unknown as XlsxModule;
    await expect(loadXlsx(() => Promise.resolve(mod))).resolves.toBe(mod);
  });

  it("turns a failed chunk load into a readable error", async () => {
    const failing = () => Promise.reject(new TypeError("Failed to fetch dynamically imported module"));
    const err = await loadXlsx(failing).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(XlsxLoadError);
    expect((err as Error).message).toBe("Could not load the import module. Reload the page and try again.");
    expect((err as Error).message).toBe(XLSX_LOAD_ERROR);
  });
});
