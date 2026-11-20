// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fmtDateRangeDDMM } from "@/lib/gantt/geometry";
import type { Task } from "@/lib/queries";
import { TaskDatesCell } from "./TreeCells";

beforeAll(() => {
  // jsdom has no matchMedia; DateRangeField reads it for its viewport check.
  window.matchMedia ??= ((query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as typeof window.matchMedia;
});

afterEach(cleanup);

describe("TaskDatesCell", () => {
  it("shows the range text once while the editor is open (ISS-103)", async () => {
    const task = {
      id: 1,
      status: "TODO",
      startDate: "2026-08-03T00:00:00.000Z",
      dueDate: "2026-08-10T00:00:00.000Z",
    } as unknown as Task;
    const user = userEvent.setup();
    render(<TaskDatesCell task={task} canEdit onSave={() => {}} todayDay="2026-08-01" />);
    const label = fmtDateRangeDDMM(new Date(2026, 7, 3), new Date(2026, 7, 10));
    expect(screen.getAllByText(label)).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: label }));
    const visible = screen.queryAllByText(label).filter((el) => !el.closest(".invisible"));
    expect(visible.length).toBeLessThanOrEqual(1);
    expect(screen.getByTitle("Click to edit dates").className).toContain("invisible");
  });
});
