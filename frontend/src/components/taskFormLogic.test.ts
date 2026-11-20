import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { labelCreateErrorMessage } from "@/components/LabelPicker";
import { filterPossibleParents, SubtaskRow } from "@/components/TaskFormModal";

describe("labelCreateErrorMessage (ISS-041)", () => {
  it("maps a 409 to a plain duplicate-name message", () => {
    const err = new ApiError(409, "Unique constraint violated", null);
    expect(labelCreateErrorMessage(err)).toBe("A label with this name already exists.");
  });
  it("passes other errors through unchanged", () => {
    expect(labelCreateErrorMessage(new ApiError(500, "Boom", null))).toBe("Boom");
    expect(labelCreateErrorMessage(new Error("Offline"))).toBe("Offline");
  });
});

describe("filterPossibleParents (ISS-042)", () => {
  const tasks = [
    { id: 1, parentTaskId: null },
    { id: 2, parentTaskId: 1 },
    { id: 3, parentTaskId: null },
  ];
  it("create mode offers top-level tasks only", () => {
    expect(filterPossibleParents(tasks).map((t) => t.id)).toEqual([1, 3]);
  });
  it("edit mode also excludes the task being edited", () => {
    expect(filterPossibleParents(tasks, 3).map((t) => t.id)).toEqual([1]);
  });
});

describe("SubtaskRow checkbox (ISS-051)", () => {
  const render = (canEdit: boolean) =>
    renderToStaticMarkup(
      createElement(SubtaskRow, {
        subtask: { id: 7, title: "Write tests", status: "TODO" },
        canEdit,
        isFirst: true,
        isLast: true,
        onToggle: () => {},
        onMove: () => {},
      }),
    );
  const checkbox = (html: string) => /<input\b[^>]*>/.exec(html)?.[0] ?? "";
  it("is disabled without edit rights", () => {
    expect(checkbox(render(false))).toContain("disabled");
  });
  it("is enabled with edit rights", () => {
    expect(checkbox(render(true))).not.toContain("disabled");
  });
});
