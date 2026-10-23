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

// docs/archive/plans/application-review-2026-10-22.md, QA-04: no retry on a 4xx.
import { ApiError, apiRequest, shouldRetryQuery } from "./api";
import { afterEach, vi } from "vitest";

describe("shouldRetryQuery", () => {
  it("retries a network or 5xx failure once", () => {
    expect(shouldRetryQuery(0, new ApiError(500, "boom", null))).toBe(true);
    expect(shouldRetryQuery(1, new ApiError(500, "boom", null))).toBe(false);
    expect(shouldRetryQuery(0, new ApiError(0, "offline", null))).toBe(true);
    expect(shouldRetryQuery(0, new TypeError("Failed to fetch"))).toBe(true);
  });

  it("never retries a 4xx — a 404 or 403 is a definite answer", () => {
    for (const status of [400, 401, 403, 404, 409, 429]) {
      expect(shouldRetryQuery(0, new ApiError(status, "no", null)), String(status)).toBe(false);
    }
  });
});

// docs/archive/plans/application-review-2026-10-22.md, QA-01: a failed network
// call surfaces as a readable ApiError, not a bare TypeError.
describe("apiRequest network failures", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
  });

  it("maps fetch's TypeError to ApiError(0) with a readable message", async () => {
    globalThis.fetch = (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch;
    vi.stubGlobal("localStorage", { getItem: () => null, setItem() {}, removeItem() {} });
    await expect(apiRequest("/projects")).rejects.toMatchObject({
      status: 0,
      message: expect.stringMatching(/could not reach the server|you are offline/i),
    });
  });

  it("says 'offline' when the browser reports it", async () => {
    globalThis.fetch = (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch;
    vi.stubGlobal("localStorage", { getItem: () => null, setItem() {}, removeItem() {} });
    vi.stubGlobal("navigator", { onLine: false });
    await expect(apiRequest("/projects")).rejects.toMatchObject({
      status: 0,
      message: expect.stringMatching(/you are offline/i),
    });
  });
});
