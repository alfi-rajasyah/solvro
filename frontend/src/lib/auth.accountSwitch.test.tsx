// @vitest-environment jsdom
// ISS-195: an /auth/me reply naming a different user than the one this tab
// runs as is an account switch, even when it lands before the other tab's
// user-key storage event.
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
const ADA = { id: 1, username: "ada", email: "ada@example.com", role: "TAM", permissions: ["project:read"] };
const BOB = { id: 2, username: "bob", email: "bob@example.com", role: "TAM", permissions: ["project:read"] };

function setup() {
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
  return { qc, ...renderHook(() => useAuth(), { wrapper }) };
}

const assign = vi.fn();

beforeEach(() => {
  assign.mockReset();
  vi.stubGlobal("location", { ...window.location, assign });
  localStorage.clear();
  localStorage.setItem(TOKEN_STORAGE_KEY, "tok-a");
  localStorage.setItem("solvro.user", JSON.stringify(ADA));
  api.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AuthProvider /auth/me account switch", () => {
  it("clears the cache and goes home when the reply names another user than the one running", async () => {
    api.mockResolvedValueOnce(ADA);
    const { result, qc } = setup();
    await act(async () => {});
    qc.setQueryData(["cached"], 1);
    expect(assign).not.toHaveBeenCalled();

    // The other tab's token event arrives while storage still names Ada, so
    // it looks like the same account; /auth/me then answers with Bob.
    api.mockResolvedValueOnce(BOB);
    localStorage.setItem(TOKEN_STORAGE_KEY, "tok-b");
    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key: TOKEN_STORAGE_KEY, newValue: "tok-b" }));
    });

    expect(result.current.user?.id).toBe(2);
    expect(result.current.userVerified).toBe(true);
    expect(qc.getQueryData(["cached"])).toBeUndefined();
    expect(assign).toHaveBeenCalledWith("/");
    // The verified user is stored so the reload does not switch a second time.
    expect(JSON.parse(localStorage.getItem("solvro.user")!).id).toBe(2);
  });

  it("keeps the cache and stays put when the reply names the same user", async () => {
    api.mockResolvedValue(ADA);
    const { qc } = setup();
    await act(async () => {});
    qc.setQueryData(["cached"], 1);

    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key: TOKEN_STORAGE_KEY, newValue: "tok-a2" }));
      localStorage.setItem(TOKEN_STORAGE_KEY, "tok-a2");
    });

    expect(qc.getQueryData(["cached"])).toBe(1);
    expect(assign).not.toHaveBeenCalled();
  });

  it("does not treat the first user (nothing cached) as a switch", async () => {
    localStorage.removeItem("solvro.user");
    api.mockResolvedValue(ADA);
    const { result } = setup();
    await act(async () => {});
    expect(result.current.user?.id).toBe(1);
    expect(assign).not.toHaveBeenCalled();
  });
});
