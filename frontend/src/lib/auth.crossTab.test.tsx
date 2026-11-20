// @vitest-environment jsdom
// ISS-012: a sign-out (or account switch) in another tab reaches this tab
// through the window "storage" event.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("./api", async (orig) => ({
  ...(await orig<typeof import("./api")>()),
  apiRequest: vi.fn(),
}));

import { apiRequest, TOKEN_STORAGE_KEY } from "./api";
import { AuthProvider, useAuth } from "./auth";

const api = vi.mocked(apiRequest);
const ME = { id: 1, username: "ada", email: "ada@example.com", role: "TAM", permissions: ["project:read"] };

function setup() {
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
  return { qc, ...renderHook(() => useAuth(), { wrapper }) };
}

/** What a browser does when another tab writes localStorage: the value changes, then the event fires here. */
function otherTabWrites(key: string, value: string | null) {
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, value);
  window.dispatchEvent(new StorageEvent("storage", { key, newValue: value }));
}

const assign = vi.fn();

beforeEach(() => {
  assign.mockReset();
  vi.stubGlobal("location", { ...window.location, assign });
  localStorage.clear();
  localStorage.setItem(TOKEN_STORAGE_KEY, "tok-a");
  localStorage.setItem("solvro.user", JSON.stringify(ME));
  api.mockReset();
  api.mockResolvedValue(ME);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AuthProvider cross-tab sync", () => {
  it("signs this tab out and clears cached data when another tab removes the token", async () => {
    const { result, qc } = setup();
    await act(async () => {});
    expect(result.current.status).toBe("authenticated");
    qc.setQueryData(["cached"], 1);

    act(() => otherTabWrites(TOKEN_STORAGE_KEY, null));

    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.user).toBeNull();
    expect(qc.getQueryData(["cached"])).toBeUndefined();
  });

  it("signs out when the other tab clears all of localStorage (event key is null)", async () => {
    const { result } = setup();
    await act(async () => {});
    localStorage.clear();
    act(() => void window.dispatchEvent(new StorageEvent("storage", { key: null })));
    expect(result.current.status).toBe("unauthenticated");
  });

  it("ignores unrelated keys", async () => {
    const { result } = setup();
    await act(async () => {});
    act(() => otherTabWrites("solvro.theme", "dark"));
    expect(result.current.status).toBe("authenticated");
    expect(result.current.token).toBe("tok-a");
  });

  it("swaps a same-account token in place: cache kept, no navigation (password change in another tab)", async () => {
    const { result, qc } = setup();
    await act(async () => {});
    qc.setQueryData(["cached"], 1);

    act(() => otherTabWrites(TOKEN_STORAGE_KEY, "tok-a2"));

    expect(result.current.token).toBe("tok-a2");
    expect(result.current.user?.id).toBe(1);
    expect(result.current.status).toBe("authenticated");
    expect(qc.getQueryData(["cached"])).toBe(1);
    expect(assign).not.toHaveBeenCalled();
  });

  it("adopts a different token written by another tab, drops cached data and leaves the new login in storage", async () => {
    const { result, qc } = setup();
    await act(async () => {});
    qc.setQueryData(["cached"], 1);
    const other = { ...ME, id: 2, username: "bob" };
    localStorage.setItem("solvro.user", JSON.stringify(other));

    act(() => otherTabWrites(TOKEN_STORAGE_KEY, "tok-b"));

    expect(result.current.token).toBe("tok-b");
    expect(result.current.user?.id).toBe(2);
    expect(qc.getQueryData(["cached"])).toBeUndefined();
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe("tok-b");
    expect(assign).toHaveBeenCalledWith("/");
  });

  it("clears the cache when the late user key names a different account", async () => {
    const { qc } = setup();
    await act(async () => {});
    qc.setQueryData(["cached"], 1);
    act(() => otherTabWrites(TOKEN_STORAGE_KEY, "tok-b"));
    expect(qc.getQueryData(["cached"])).toBe(1);
    act(() => otherTabWrites("solvro.user", JSON.stringify({ ...ME, id: 2 })));
    expect(qc.getQueryData(["cached"])).toBeUndefined();
  });

  it("handles the token event arriving before the user key: no stale write-back, user re-read on the later event", async () => {
    const { result } = setup();
    await act(async () => {});
    const other = { ...ME, id: 2, username: "bob" };

    // Token first: storage still holds the previous account's user.
    act(() => otherTabWrites(TOKEN_STORAGE_KEY, "tok-b"));
    // The other tab now writes its user; this tab must not overwrite it from state.
    localStorage.setItem("solvro.user", JSON.stringify(other));
    await act(async () => {});
    expect(JSON.parse(localStorage.getItem("solvro.user")!).id).toBe(2);

    expect(assign).not.toHaveBeenCalled();
    act(() => otherTabWrites("solvro.user", JSON.stringify(other)));
    expect(assign).toHaveBeenCalledWith("/");
    expect(result.current.user?.id).toBe(2);
    expect(JSON.parse(localStorage.getItem("solvro.user")!).id).toBe(2);
  });

  it("does not navigate on a sign-out from another tab", async () => {
    setup();
    await act(async () => {});
    act(() => otherTabWrites(TOKEN_STORAGE_KEY, null));
    expect(assign).not.toHaveBeenCalled();
  });
});
