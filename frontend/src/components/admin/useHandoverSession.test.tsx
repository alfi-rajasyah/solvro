// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useHandoverSession } from "./useHandoverSession";
import type { AdminUser, HandoverPreview } from "@/lib/queries";

const user = { id: 9, username: "leaver" } as AdminUser;
const preview = (openTasks: number): HandoverPreview => ({
  projects: [
    { id: 1, name: "P", status: "ACTIVE", customerName: null, isTam: false, isSa: false, openTasks, openEpics: 0 },
  ],
  customers: [],
  openDeals: 0,
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("useHandoverSession", () => {
  it("replaces the preview of the open dialog", async () => {
    const fetchPreview = vi.fn().mockResolvedValue(preview(5));
    const { result } = renderHook(() => useHandoverSession(fetchPreview));
    act(() => result.current.open(user, preview(2)));
    let ok = false;
    await act(async () => {
      ok = await result.current.reload();
    });
    expect(ok).toBe(true);
    expect(fetchPreview).toHaveBeenCalledWith(9);
    expect(result.current.session?.preview.projects[0].openTasks).toBe(5);
  });

  it("drops a reload that finishes after the dialog closed", async () => {
    const d = deferred<HandoverPreview>();
    const fetchPreview = vi.fn().mockReturnValue(d.promise);
    const { result } = renderHook(() => useHandoverSession(fetchPreview));
    act(() => result.current.open(user, preview(2)));
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.reload();
    });
    act(() => result.current.close());
    await act(async () => {
      d.resolve(preview(7));
      await pending;
    });
    expect(result.current.session).toBeNull();
  });

  it("keeps an emptied preview open instead of closing the dialog", async () => {
    const empty: HandoverPreview = { projects: [], customers: [], openDeals: 0 };
    const fetchPreview = vi.fn().mockResolvedValue(empty);
    const { result } = renderHook(() => useHandoverSession(fetchPreview));
    act(() => result.current.open(user, preview(2)));
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.session?.preview).toEqual(empty);
  });

  it("reports false when nothing is open or the fetch fails", async () => {
    const fetchPreview = vi.fn().mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useHandoverSession(fetchPreview));
    expect(await result.current.reload()).toBe(false);
    act(() => result.current.open(user, preview(2)));
    let ok = true;
    await act(async () => {
      ok = await result.current.reload();
    });
    expect(ok).toBe(false);
    expect(result.current.session?.preview.projects[0].openTasks).toBe(2);
  });
});
