// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

afterEach(cleanup);

function Counter() {
  const [n, setN] = useState(0);
  return (
    <button type="button" onClick={() => setN((v) => v + 1)}>
      Clicked {n}
    </button>
  );
}

describe("DOM test environment", () => {
  it("renders a component, moves focus with Tab, and handles a click", async () => {
    const user = userEvent.setup();
    render(<Counter />);
    await user.tab();
    const button = screen.getByRole("button", { name: "Clicked 0" });
    expect(document.activeElement).toBe(button);
    await user.click(button);
    expect(screen.getByRole("button", { name: "Clicked 1" })).toBeTruthy();
  });
});
