import { describe, expect, it, vi } from "vitest";
import { importWithRetry } from "@/lib/lazyPage";

describe("importWithRetry", () => {
  it("returns the first result without retrying", async () => {
    const load = vi.fn().mockResolvedValue("ok");
    await expect(importWithRetry(load, 0)).resolves.toBe("ok");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("retries once after a rejection", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("chunk")).mockResolvedValue("ok");
    await expect(importWithRetry(load, 0)).resolves.toBe("ok");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("rejects when the retry fails too", async () => {
    const load = vi.fn().mockRejectedValue(new Error("gone"));
    await expect(importWithRetry(load, 0)).rejects.toThrow("gone");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
