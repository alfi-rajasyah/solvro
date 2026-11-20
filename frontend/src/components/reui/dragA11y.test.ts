import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Kanban, KanbanBoard, KanbanColumn, KanbanColumnContent, KanbanItem, KanbanItemHandle } from "./kanban";
import { Sortable, SortableItem, SortableItemHandle } from "./sortable";

// The vendored engines hand dnd-kit's a11y attributes (role=button,
// tabIndex 0) to the drag handle, not the row, so a read-only row is not in
// the tab order and a writable handle is the keyboard activator.

function sortable(disabled: boolean) {
  return renderToStaticMarkup(
    h(
      Sortable<{ id: string }> as never,
      { value: [{ id: "a" }], onValueChange: () => {}, getItemValue: (i: { id: string }) => i.id },
      h(
        SortableItem,
        { value: "a", disabled },
        "Row text",
        h(SortableItemHandle, { "aria-label": "Reorder" }, "grip"),
      ),
    ),
  );
}

function kanban(disabled: boolean) {
  return renderToStaticMarkup(
    h(
      Kanban<{ id: string }> as never,
      { value: { todo: [{ id: "a" }] }, onValueChange: () => {}, getItemValue: (i: { id: string }) => i.id },
      h(
        KanbanBoard,
        null,
        h(
          KanbanColumn,
          { value: "todo" },
          h(
            KanbanColumnContent,
            { value: "todo" },
            h(
              KanbanItem,
              { value: "a", disabled },
              "Card text",
              h(KanbanItemHandle, { "aria-label": "Drag" }, "grip"),
            ),
          ),
        ),
      ),
    ),
  );
}

const rowTag = (html: string, slot: string) => html.match(new RegExp(`<div[^>]*data-slot="${slot}"[^>]*>`))?.[0] ?? "";

describe("vendored drag a11y", () => {
  it.each([
    ["sortable", sortable, "sortable-item", "sortable-item-handle"],
    ["kanban", kanban, "kanban-item", "kanban-item-handle"],
  ] as const)("%s: row is not focusable, writable handle is the activator", (_n, render, rowSlot, handleSlot) => {
    const html = render(false);
    expect(rowTag(html, rowSlot)).not.toMatch(/tabindex|role=/);
    const handle = rowTag(html, handleSlot);
    expect(handle).toContain('role="button"');
    expect(handle).toContain('tabindex="0"');
  });

  it.each([
    ["sortable", sortable, "sortable-item-handle"],
    ["kanban", kanban, "kanban-item-handle"],
  ] as const)("%s: a disabled handle is not in the tab order", (_n, render, handleSlot) => {
    expect(rowTag(render(true), handleSlot)).not.toMatch(/tabindex|role=/);
  });
});
