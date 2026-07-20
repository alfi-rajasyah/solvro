import { useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { AssigneeAvatar } from "@/components/AssigneeAvatar";
import { InlineDateRangeEditor } from "@/components/InlineDateRangeEditor";
import { type Row, fmtDateRangeDDMM } from "@/lib/gantt/geometry";
import {
  AVATAR_COL_WIDTH,
  DATE_RANGE_COL_WIDTH,
  ROW_HEIGHT,
} from "@/lib/gantt/constants";
import { DEFAULT_SECTION_COLOR, SECTION_COLOR_PRESETS } from "@/lib/gantt/palette";

interface GanttListRowProps {
  row: Row;
  canEdit: boolean;
  hovered: boolean;
  onToggleSection: (id: string) => void;
  onTaskClick: (taskId: number) => void;
  onUpdateDates: (taskId: number, startISO: string | null, dueISO: string | null) => void;
  onHoverChange: (rowId: string | null) => void;
  onSetSectionColor: (sectionId: number, color: string) => void;
}

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
  hovered,
  onToggleSection,
  onTaskClick,
  onUpdateDates,
  onHoverChange,
  onSetSectionColor,
}: GanttListRowProps) {
  const [editingDates, setEditingDates] = useState(false);
  const [pickingColor, setPickingColor] = useState(false);
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
  const dragHandleVisible = canEdit && (isTopLevelTask || realSection);

  const handleNameClick = () => {
    if (isSection) onToggleSection(row.id);
    else if (row.taskId !== undefined) onTaskClick(row.taskId);
  };

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
          : hovered
            ? "bg-surface-container-low/70"
            : "bg-surface-container-lowest hover:bg-surface-container-low",
        isOver && isSection ? "ring-2 ring-inset ring-primary" : "",
        isDragging ? "opacity-40" : "",
      ].join(" ")}
      style={{ height: ROW_HEIGHT }}
      onMouseEnter={() => onHoverChange(row.id)}
      onMouseLeave={() => onHoverChange(null)}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-1.5 pr-2">
        <span style={{ width: indent }} aria-hidden="true" />
        {dragHandleVisible ? (
          <span
            {...draggable.attributes}
            {...draggable.listeners}
            className="flex h-4 w-4 shrink-0 cursor-grab items-center justify-center text-on-surface-variant/40 hover:text-on-surface-variant active:cursor-grabbing"
            title="Drag to move"
            aria-label="Drag handle"
          >
            <span className="material-symbols-outlined text-[15px] leading-none">
              drag_indicator
            </span>
          </span>
        ) : (
          <span className="w-4 shrink-0" aria-hidden="true" />
        )}
        {isSection ? (
          <>
            <button
              type="button"
              onClick={() => onToggleSection(row.id)}
              className="flex h-4 w-4 shrink-0 items-center justify-center text-on-surface-variant hover:text-on-surface"
              aria-label={row.collapsed ? "Expand section" : "Collapse section"}
            >
              <span className="material-symbols-outlined text-[17px] leading-none">
                {row.collapsed ? "chevron_right" : "expand_more"}
              </span>
            </button>
            <span className="relative flex shrink-0 items-center">
              <button
                type="button"
                disabled={!canEdit || row.sectionId === null}
                onClick={(e) => {
                  e.stopPropagation();
                  setPickingColor((v) => !v);
                }}
                className="h-2 w-2 rounded-full disabled:cursor-default"
                style={{ backgroundColor: row.sectionColor ?? DEFAULT_SECTION_COLOR }}
                aria-label="Set section color"
                title={canEdit ? "Set section color" : undefined}
              />
              {pickingColor && canEdit && row.sectionId !== null && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPickingColor(false);
                    }}
                    aria-label="Close color picker"
                  />
                  {/* Floating popover — sanctioned overlay shadow token (DESIGN.md exception) */}
                  <div className="absolute left-0 top-4 z-50 flex gap-1 rounded border border-outline-variant bg-surface-container-lowest p-1.5 shadow-overlay">
                    {SECTION_COLOR_PRESETS.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        className="h-4 w-4 rounded-full hover:ring-2 hover:ring-primary"
                        style={{ backgroundColor: hex }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSetSectionColor(row.sectionId!, hex);
                          setPickingColor(false);
                        }}
                        aria-label={`Section color ${hex}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </span>
          </>
        ) : (
          <span className="w-4 shrink-0" aria-hidden="true" />
        )}
        <button
          type="button"
          onClick={handleNameClick}
          className={[
            "min-w-0 flex-1 truncate text-left",
            isSection
              ? "font-display text-[13px] font-bold uppercase tracking-wider text-on-surface"
              : isSubtask
                ? "text-[12px] text-on-surface hover:text-primary"
                : "text-[13px] text-on-surface hover:text-primary",
            status === "DONE" && !isSection ? "text-on-surface-variant line-through" : "",
          ].join(" ")}
          title={row.name}
        >
          {row.name}
          {noSectionTarget && (
            <span className="ml-2 font-mono text-[11px] font-normal normal-case tracking-normal text-on-surface-variant">
              · drop a task here to clear its section
            </span>
          )}
        </button>
        {!isSection && (
          <span
            className="flex shrink-0 items-center justify-center"
            style={{ width: AVATAR_COL_WIDTH }}
          >
            <AssigneeAvatar user={row.task?.assignedTo ?? null} size="xs" />
          </span>
        )}
      </div>
      <div
        className="relative flex shrink-0 items-center justify-end px-2"
        style={{ width: DATE_RANGE_COL_WIDTH }}
      >
        <button
          type="button"
          disabled={isSection || !canEdit || row.taskId === undefined}
          onClick={() => setEditingDates(true)}
          className={[
            "w-full truncate text-right font-mono text-[11px] text-on-surface-variant",
            !isSection && canEdit && row.taskId !== undefined
              ? "hover:text-primary"
              : "cursor-default",
          ].join(" ")}
          title={!isSection && canEdit ? "Click to edit dates" : undefined}
        >
          {isSection ? "" : fmtDateRangeDDMM(row.start, row.end)}
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
    </div>
  );
}
