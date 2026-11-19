// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useDialogFocus } from "@/hooks/useDialogFocus";

// jsdom has no layout, so every element reports zero client rects and the
// hook's visibility filter would drop them all.
beforeAll(() => {
  HTMLElement.prototype.getClientRects = function () {
    return [{}] as unknown as DOMRectList;
  };
});
afterEach(cleanup);

function Dialog({ tail = true }: { tail?: boolean }) {
  const { ref, onKeyDown } = useDialogFocus(true);
  return (
    <>
      <button>outside before</button>
      <div ref={ref} role="dialog" aria-label="Test" tabIndex={-1} onKeyDown={onKeyDown}>
        <button>first</button>
        <h2 tabIndex={-1}>heading</h2>
        {tail && <button>last</button>}
        {!tail && <p>static text</p>}
      </div>
      <button>outside after</button>
    </>
  );
}

describe("useDialogFocus Tab trap", () => {
  it("wraps forward from the last tabbable element", async () => {
    const user = userEvent.setup();
    render(<Dialog />);
    screen.getByRole("button", { name: "last" }).focus();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "first" }));
  });

  it("wraps backward from the first tabbable element", async () => {
    const user = userEvent.setup();
    render(<Dialog />);
    screen.getByRole("button", { name: "first" }).focus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "last" }));
  });

  it("wraps forward from a non-tabbable element with nothing tabbable after it", async () => {
    const user = userEvent.setup();
    render(<Dialog tail={false} />);
    screen.getByRole("heading", { name: "heading" }).focus();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "first" }));
  });

  it("wraps backward from a non-tabbable element with nothing tabbable before it", async () => {
    const user = userEvent.setup();
    function Head() {
      const { ref, onKeyDown } = useDialogFocus(true);
      return (
        <div ref={ref} role="dialog" aria-label="Test" tabIndex={-1} onKeyDown={onKeyDown}>
          <h2 tabIndex={-1}>heading</h2>
          <button>one</button>
          <button>two</button>
        </div>
      );
    }
    render(<Head />);
    screen.getByRole("heading", { name: "heading" }).focus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "two" }));
  });

  it("leaves a non-tabbable element alone when a tabbable one follows it", async () => {
    const user = userEvent.setup();
    render(<Dialog />);
    screen.getByRole("heading", { name: "heading" }).focus();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "last" }));
  });
});
