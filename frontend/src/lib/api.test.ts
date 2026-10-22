// docs/archive/plans/application-review-2026-10-22.md, F-15: every request now carries a timeout.
import { describe, expect, it } from "vitest";
import { DEFAULT_REQUEST_TIMEOUT_MS, requestSignal } from "./api";

describe("requestSignal", () => {
  it("returns a timeout signal when the caller passes none", () => {
    const signal = requestSignal(undefined, 50);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal!.aborted).toBe(false);
  });

  it("aborts after the timeout with a TimeoutError", async () => {
    const signal = requestSignal(undefined, 20)!;
    await new Promise((r) => setTimeout(r, 60));
    expect(signal.aborted).toBe(true);
    expect((signal.reason as DOMException).name).toBe("TimeoutError");
  });

  it("combines the caller's signal with the timeout: either one aborts", async () => {
    const controller = new AbortController();
    const combined = requestSignal(controller.signal, 10_000)!;
    expect(combined.aborted).toBe(false);
    controller.abort(new Error("caller cancelled"));
    expect(combined.aborted).toBe(true);
    expect((combined.reason as Error).message).toBe("caller cancelled");

    const controller2 = new AbortController();
    const combined2 = requestSignal(controller2.signal, 20)!;
    await new Promise((r) => setTimeout(r, 60));
    expect(combined2.aborted).toBe(true);
    expect((combined2.reason as DOMException).name).toBe("TimeoutError");
  });

  it("passes the caller's signal through unchanged when the timeout is disabled", () => {
    const controller = new AbortController();
    expect(requestSignal(controller.signal, 0)).toBe(controller.signal);
    expect(requestSignal(undefined, 0)).toBeUndefined();
  });

  it("defaults to 30 seconds", () => {
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBe(30_000);
  });
});
