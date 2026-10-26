// docs/archive/plans/application-review-2026-10-22.md, N-01: sign-out asks
// the server to revoke the token, best effort.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOGOUT_TIMEOUT_MS, revokeSessionOnServer } from "@/lib/auth";

function stubStorage(initial: Record<string, string>) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
}

describe("revokeSessionOnServer", () => {
  beforeEach(() => {
    stubStorage({ "solvro.token": "tok-123" });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs /auth/logout with the current bearer token, dispatched synchronously", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = revokeSessionOnServer();
    // Called before the first await resolves: the caller can clear storage right after.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/logout");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-123");
    await expect(pending).resolves.toBeUndefined();
    expect(LOGOUT_TIMEOUT_MS).toBeLessThanOrEqual(5_000);
  });

  it("swallows a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(revokeSessionOnServer()).resolves.toBeUndefined();
  });

  it("swallows a server error answer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));
    await expect(revokeSessionOnServer()).resolves.toBeUndefined();
  });

  it("makes no request when there is no token", async () => {
    stubStorage({});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await revokeSessionOnServer();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
