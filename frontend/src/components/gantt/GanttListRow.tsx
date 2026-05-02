import { useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { InlineDateRangeEditor } from "@/components/InlineDateRangeEditor";
import { type Row, fmtDateDDMM } from "@/lib/gantt/geometry";
import {
  CHECKBOX_COL_WIDTH,
  DATE_COL_WIDTH,
  NAME_COL_WIDTH,
  PCT_COL_WIDTH,
  ROW_HEIGHT,
} from "@/lib/gantt/constants";
import type { TaskStatus } from "@/lib/queries";

interface GanttListRowProps {
  row: Row;
  canEdit: boolean;
  onToggleSection: (id: string) => void;
  onTaskClick: (taskId: number) => void;
  onToggleStatus: (taskId: number, current: TaskStatus) => void;
  onUpdateDates: (taskId: number, startISO: string | null, dueISO: string | null) => void;
}

const STATUS_PROGRESS: Record<TaskStatus, number> = {
  TODO: 0,
  IN_PROGRESS: 50,
  DONE: 100,
};

export interface RowDragData {
  kind: "task" | "section";
  taskId?: number;
  sectionId: number | null;
}

export interface RowDropData {
  kind: "section-target";
  sectionId: number | null;
}

export function GanttListRow({
  row,
  canEdit,
  onToggleSection,
  onTaskClick,
  onToggleStatus,
  onUpdateDates,
}: GanttListRowProps) {
  const [editingDates, setEditingDates] = useState(false);
  const isSection = row.kind === "section";
  const isTopLevelTask = row.kind === "task";
  const isSubtask = row.kind === "subtask";
  // Real sections (sectionId !== null) are draggable for reordering AND
  // act as drop targets for tasks.
  const realSection = isSection && row.sectionId !== null;
  // The "(No section)" pseudo-row is only a drop target (for clearing a
  // task's sectionId) — never draggable.
  const noSectionTarget = isSection && row.sectionId === null;

  const draggable = useDraggable({
    id: `drag-${row.id}`,
    disabled: !canEdit || (!isTopLevelTask && !realSection),
    data: {
      kind: isTopLevelTask ? "task" : "section",
      taskId: row.taskId,
      sectionId: row.sectionId,
    } satisfies RowDragData,
  });

  const droppable = useDroppable({
    id: `drop-${row.id}`,
    disabled: !isSection,
    data: { kind: "section-target", sectionId: row.sectionId } satisfies RowDropData,
  });

  const isDragging = draggable.isDragging;
  const isOver = droppable.isOver;

  const indent = row.depth * 14;
  const status = row.status ?? "TODO";
  const progress = STATUS_PROGRESS[status];
  const checkboxDisabled = isSection || !canEdit || row.taskId === undefined;

  const handleNameClick = () => {
    if (isSection) onToggleSection(row.id);
    else if (row.taskId !== undefined) onTaskClick(row.taskId);
  };

  const dragHandleVisible = canEdit && (isTopLevelTask || realSection);

  return (
    <div
      ref={(node) => {
        draggable.setNodeRef(node);
        droppable.setNodeRef(node);
      }}
      className={[
        "group flex items-stretch border-b border-outline-variant",
        isSection
          ? "bg-surface-container-low hover:bg-surface-container"
          : "bg-surface-container-lowest hover:bg-surface-container-low",
        isOver && isSection ? "ring-2 ring-inset ring-primary" : "",
        isDragging ? "opacity-40" : "",
      ].join(" ")}
      style={{ height: ROW_HEIGHT }}
    >
      <div
        className="flex items-center justify-center"
        style={{ width: CHECKBOX_COL_WIDTH }}
      >
        {!isSection && (
          <button
            type="button"
            disabled={checkboxDisabled}
            onClick={() =>
              row.taskId !== undefined && onToggleStatus(row.taskId, status)
            }
            className={[
              "flex h-4 w-4 items-center justify-center rounded-full border transition-colors",
              status === "DONE"
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-outline-variant bg-surface-container-lowest hover:border-primary",
              checkboxDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
            ].join(" ")}
            aria-label={status === "DONE" ? "Mark incomplete" : "Mark complete"}
            title={status === "DONE" ? "Mark incomplete" : "Mark complete"}
          >
            {status === "DONE" && (
              <span className="material-symbols-outlined text-[12px] leading-none">
                check
              </span>
            )}
          </button>
        )}
      </div>
      <div
        className="flex items-center gap-1 border-r border-outline-variant pl-1 pr-2"
        style={{ width: NAME_COL_WIDTH }}
      >
        <span style={{ width: indent }} aria-hidden="true" />
        {dragHandleVisible ? (
          <span
            {...draggable.attributes}
            {...draggable.listeners}
            className="flex h-4 w-4 shrink-0 cursor-grab items-center justify-center text-on-surface-variant/40 hover:text-on-surface-variant active:cursor-grabbing"
            title="Drag to move"
            aria-label="Drag handle"
          >
            <span className="material-symbols-outlined text-[14px] leading-none">
              drag_indicator
            </span>
          </span>
        ) : (
          <span className="w-4 shrink-0" aria-hidden="true" />
        )}
        {isSection ? (
          <button
            type="button"
            onClick={() => onToggleSection(row.id)}
            className="flex h-4 w-4 shrink-0 items-center justify-center text-on-surface-variant hover:text-on-surface"
            aria-label={row.collapsed ? "Expand section" : "Collapse section"}
          >
            <span className="material-symbols-outlined text-[16px] leading-none">
              {row.collapsed ? "chevron_right" : "expand_more"}
            </span>
          </button>
        ) : (
          <span className="w-4 shrink-0" aria-hidden="true" />
        )}
        <button
          type="button"
          onClick={handleNameClick}
          className={[
            "min-w-0 flex-1 truncate text-left",
            isSection
              ? "font-display text-[12px] font-bold uppercase tracking-wider text-on-surface"
              : isSubtask
                ? "text-[11px] text-on-surface hover:text-primary"
                : "text-[12px] text-on-surface hover:text-primary",
            status === "DONE" && !isSection ? "text-on-surface-variant line-through" : "",
          ].join(" ")}
          title={row.name}
        >
          {row.name}
          {noSectionTarget && (
            <span className="ml-2 font-mono text-[10px] font-normal normal-case tracking-normal text-on-surface-variant">
              · drop a task here to clear its section
            </span>
          )}
        </button>
      </div>
      <button
        type="button"
        disabled={isSection || !canEdit || row.taskId === undefined}
        onClick={() => setEditingDates(true)}
        className={[
          "flex items-center justify-end border-r border-outline-variant px-2 font-mono text-[11px] text-on-surface-variant",
          !isSection && canEdit && row.taskId !== undefined
            ? "hover:bg-surface-container hover:text-primary"
            : "cursor-default",
        ].join(" ")}
        style={{ width: DATE_COL_WIDTH }}
        title={!isSection && canEdit ? "Click to edit dates" : undefined}
      >
        {row.start ? fmtDateDDMM(row.start) : "—"}
      </button>
      <div
        className="relative flex items-center justify-end border-r border-outline-variant"
        style={{ width: DATE_COL_WIDTH }}
      >
        <button
          type="button"
          disabled={isSection || !canEdit || row.taskId === undefined}
          onClick={() => setEditingDates(true)}
          className={[
            "flex h-full w-full items-center justify-end px-2 font-mono text-[11px] text-on-surface-variant",
            !isSection && canEdit && row.taskId !== undefined
              ? "hover:bg-surface-container hover:text-primary"
              : "cursor-default",
          ].join(" ")}
          title={!isSection && canEdit ? "Click to edit dates" : undefined}
        >
          {row.end ? fmtDateDDMM(row.end) : "—"}
        </button>
        {editingDates && canEdit && row.taskId !== undefined && row.task && (
          <InlineDateRangeEditor
            className="absolute right-0 top-full z-50 mt-1"
            startISO={row.task.startDate}
            endISO={row.task.dueDate}
            onSave={(s, e) => {
              if (row.taskId !== undefined) onUpdateDates(row.taskId, s, e);
              setEditingDates(false);
            }}
            onCancel={() => setEditingDates(false)}
          />
        )}
      </div>
      <div
        className="flex items-center justify-end px-2 font-mono text-[11px] text-on-surface-variant"
        style={{ width: PCT_COL_WIDTH }}
      >
        {isSection ? "" : `${progress}%`}
      </div>
    </div>
  );
}
