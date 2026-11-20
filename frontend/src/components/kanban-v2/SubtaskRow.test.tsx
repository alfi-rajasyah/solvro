// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SubtaskRow } from "@/components/kanban-v2/cards";
import type { Task } from "@/lib/queries";

const task = (over: Partial<Task>) =>
  ({ id: 1, title: "Wire up", status: "TODO", priority: "MEDIUM", isCriticalPath: false, assignedTo: null, ...over }) as Task;

afterEach(cleanup);

describe("SubtaskRow", () => {
  it("shows the Critical Path mark only for a critical-path subtask", () => {
    render(<SubtaskRow task={task({ isCriticalPath: true })} canToggle={false} />);
    expect(screen.getByRole("img", { name: "Critical Path" })).toBeTruthy();
    cleanup();
    render(<SubtaskRow task={task({})} canToggle={false} />);
    expect(screen.queryByRole("img", { name: "Critical Path" })).toBeNull();
  });
});
