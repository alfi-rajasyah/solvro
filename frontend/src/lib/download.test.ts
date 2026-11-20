// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadBlob } from "./download";

describe("downloadBlob", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("clicks a named anchor and revokes the object URL only after a delay", () => {
    vi.useFakeTimers();
    const create = vi.fn(() => "blob:test");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    let clicked: HTMLAnchorElement | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked = this;
      expect(revoke).not.toHaveBeenCalled();
    });

    downloadBlob(new Blob(["x"]), "file.xlsx");

    expect(clicked).not.toBeNull();
    expect(clicked!.download).toBe("file.xlsx");
    expect(clicked!.href).toBe("blob:test");
    expect(document.body.contains(clicked)).toBe(false);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4999);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revoke).toHaveBeenCalledWith("blob:test");
  });
});
