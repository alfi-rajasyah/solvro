import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Row,
  type ViewMode,
  addDays,
  dateFromX,
  parseISODate,
  positionFor,
  startOfDay,
} from "@/lib/gantt/geometry";
import {
  BAR_HEIGHT,
  RESIZE_HANDLE_PX,
  ROW_HEIGHT,
} from "@/lib/gantt/constants";
import { PRIORITY_BORDER_HEX } from "@/lib/gantt/palette";
import type { TaskStatus } from "@/lib/queries";

type DragMode = "move" | "resize-start" | "resize-end";

interface GanttBarProps {
  row: Row;
  chartStart: Date;
  viewMode: ViewMode;
  columnWidth: number;
  canEdit: boolean;
  onCommit: (taskId: number, startDate: Date, dueDate: Date) => void;
  onClick: (taskId: number) => void;
  /**
   * Fired when the user pointer-downs on one of the bar's connector dots.
   * `side` is which edge the drag started from: "right" = this task is the
   * predecessor (drop target becomes the successor); "left" = this task is
   * the successor (drop target becomes the predecessor). The frame captures
   * the gesture from there and hit-tests the release target on pointer-up.
   */
  onConnectStart?: (
    sourceTaskId: number,
    side: "right" | "left",
    clientX: number,
    clientY: number,
  ) => void;
}

const STATUS_FILL: Record<TaskStatus, string> = {
  TODO: "bg-sky-200/90",
  IN_PROGRESS: "bg-blue-400",
  DONE: "bg-emerald-400",
};

const STATUS_PROGRESS: Record<TaskStatus, number> = {
  TODO: 0,
  IN_PROGRESS: 50,
  DONE: 100,
};

export function GanttBar({
  row,
  chartStart,
  viewMode,
  columnWidth,
  canEdit,
  onCommit,
  onClick,
  onConnectStart,
}: GanttBarProps) {
  const [ghost, setGhost] = useState<{ start: Date; end: Date } | null>(null);
  const dragRef = useRef<{
    mode: DragMode;
    pointerId: number;
    originX: number;
    origStart: Date;
    origEnd: Date;
    pxPerDay: number;
    moved: boolean;
  } | null>(null);

  if (!row.start || !row.end || row.taskId === undefined) return null;

  const start = ghost?.start ?? row.start;
  const end = ghost?.end ?? row.end;
  const left = positionFor(start, chartStart, viewMode, columnWidth).x;
  const endPos = positionFor(addDays(end, 1), chartStart, viewMode, columnWidth).x;
  const width = Math.max(columnWidth / 7, endPos - left);

  const pxPerDay =
    positionFor(addDays(chartStart, 1), chartStart, viewMode, columnWidth).x;

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, mode: DragMode) => {
      if (!canEdit) return;
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        mode,
        pointerId: e.pointerId,
        originX: e.clientX,
        origStart: start,
        origEnd: end,
        pxPerDay,
        moved: false,
      };
    },
    [canEdit, start, end, pxPerDay],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const deltaPx = e.clientX - drag.originX;
      if (Math.abs(deltaPx) < 2 && !drag.moved) return;
      const deltaDays = Math.round(deltaPx / drag.pxPerDay);
      drag.moved = drag.moved || deltaDays !== 0;
      let newStart = drag.origStart;
      let newEnd = drag.origEnd;
      if (drag.mode === "move") {
        newStart = addDays(drag.origStart, deltaDays);
        newEnd = addDays(drag.origEnd, deltaDays);
      } else if (drag.mode === "resize-start") {
        newStart = addDays(drag.origStart, deltaDays);
        if (newStart > drag.origEnd) newStart = drag.origEnd;
      } else if (drag.mode === "resize-end") {
        newEnd = addDays(drag.origEnd, deltaDays);
        if (newEnd < drag.origStart) newEnd = drag.origStart;
      }
      setGhost({ start: newStart, end: newEnd });
    },
    [],
  );

  const finishDrag = useCallback(
    (commit: boolean) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag) {
        setGhost(null);
        return;
      }
      if (commit && drag.moved && ghost) {
        const startISO = ghost.start;
        const endISO = ghost.end;
        if (
          startISO.getTime() !== drag.origStart.getTime() ||
          endISO.getTime() !== drag.origEnd.getTime()
        ) {
          onCommit(row.taskId!, startISO, endISO);
        }
      }
      setGhost(null);
    },
    [ghost, onCommit, row.taskId],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // pointer capture may already be released
      }
      const wasDragged = drag.moved;
      finishDrag(true);
      if (!wasDragged && row.taskId !== undefined) {
        onClick(row.taskId);
      }
    },
    [finishDrag, onClick, row.taskId],
  );

  const handlePointerCancel = useCallback(() => {
    finishDrag(false);
  }, [finishDrag]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && dragRef.current) {
        finishDrag(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finishDrag]);

  const priority = row.priority ?? "MEDIUM";
  const status = row.status ?? "TODO";
  const progress = STATUS_PROGRESS[status];

  const heightPct = row.kind === "subtask" ? 0.78 : 1;
  const barHeight = BAR_HEIGHT * heightPct;
  const top = (ROW_HEIGHT - barHeight) / 2;

  // Baseline ghost rect (only renders when baseline differs from current live dates).
  const baselineStartIso = row.task?.baselineStartDate ?? null;
  const baselineEndIso = row.task?.baselineDueDate ?? null;
  const baselineRect = (() => {
    if (!baselineStartIso || !baselineEndIso) return null;
    const bStart = startOfDay(parseISODate(baselineStartIso));
    const bEnd = startOfDay(parseISODate(baselineEndIso));
    const liveStart = startOfDay(row.start!);
    const liveEnd = startOfDay(row.end!);
    if (bStart.getTime() === liveStart.getTime() && bEnd.getTime() === liveEnd.getTime()) {
      return null;
    }
    const bLeft = positionFor(bStart, chartStart, viewMode, columnWidth).x;
    const bEndPos = positionFor(addDays(bEnd, 1), chartStart, viewMode, columnWidth).x;
    const bWidth = Math.max(columnWidth / 7, bEndPos - bLeft);
    const startSlipDays = Math.round(
      (liveStart.getTime() - bStart.getTime()) / (1000 * 60 * 60 * 24),
    );
    const endSlipDays = Math.round(
      (liveEnd.getTime() - bEnd.getTime()) / (1000 * 60 * 60 * 24),
    );
    return { left: bLeft, width: bWidth, startSlipDays, endSlipDays };
  })();

  const baselineTooltip = baselineRect
    ? `Baseline: ${baselineStartIso!.slice(0, 10)} → ${baselineEndIso!.slice(0, 10)}` +
      (baselineRect.startSlipDays || baselineRect.endSlipDays
        ? ` · slip: start ${formatSlip(baselineRect.startSlipDays)}, end ${formatSlip(baselineRect.endSlipDays)}`
        : "")
    : "";

  return (
    <>
      {baselineRect && (
        <div
          className="absolute pointer-events-none rounded border border-dashed border-slate-500/70 bg-slate-300/15"
          style={{
            left: baselineRect.left,
            width: baselineRect.width,
            top,
            height: barHeight,
            zIndex: 1,
          }}
          title={baselineTooltip}
          aria-label={baselineTooltip}
        />
      )}
    <div
      data-task-id={row.taskId}
      className={[
        "absolute select-none rounded overflow-hidden",
        STATUS_FILL[status],
        canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        ghost ? "ring-2 ring-primary/60 shadow-md" : "shadow-sm",
      ].join(" ")}
      style={{
        left,
        width,
        top,
        height: barHeight,
        zIndex: 2,
        borderLeft: `3px solid ${PRIORITY_BORDER_HEX[priority]}`,
      }}
      onPointerDown={(e) => handlePointerDown(e, "move")}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      title={`${row.name} · ${status} · ${priority}`}
    >
      {progress > 0 && progress < 100 && (
        <div
          className="absolute inset-y-0 left-0 bg-black/15"
          style={{ width: `${progress}%` }}
          aria-hidden="true"
        />
      )}
      {canEdit && (
        <>
          <div
            className="absolute inset-y-0 left-0 cursor-ew-resize"
            style={{ width: RESIZE_HANDLE_PX }}
            onPointerDown={(e) => handlePointerDown(e, "resize-start")}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          />
          <div
            className="absolute inset-y-0 right-0 cursor-ew-resize"
            style={{ width: RESIZE_HANDLE_PX }}
            onPointerDown={(e) => handlePointerDown(e, "resize-end")}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          />
        </>
      )}
    </div>
    {canEdit && onConnectStart && (
      <>
        <div
          title="Drag from another task to make this task depend on it"
          className="pointer-events-none absolute z-[3] h-3 w-3 cursor-crosshair rounded-full border-2 border-white bg-primary opacity-0 shadow transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:opacity-100"
          style={{
            left,
            top: top + barHeight / 2,
            transform: "translate(-50%, -50%)",
          }}
          onPointerDown={(e) => {
            // Don't let the bar's onPointerDown fire — we own this gesture.
            e.stopPropagation();
            e.preventDefault();
            onConnectStart(row.taskId!, "left", e.clientX, e.clientY);
          }}
        />
        <div
          title="Drag to a task to create a dependency"
          className="pointer-events-none absolute z-[3] h-3 w-3 cursor-crosshair rounded-full border-2 border-white bg-primary opacity-0 shadow transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:opacity-100"
          style={{
            left: left + width,
            top: top + barHeight / 2,
            transform: "translate(-50%, -50%)",
          }}
          onPointerDown={(e) => {
            // Don't let the bar's onPointerDown fire — we own this gesture.
            e.stopPropagation();
            e.preventDefault();
            onConnectStart(row.taskId!, "right", e.clientX, e.clientY);
          }}
        />
      </>
    )}
    <div
      className="pointer-events-none absolute flex items-center whitespace-nowrap text-[12px] font-medium text-on-surface"
      style={{
        left: left + width + 14,
        top,
        height: barHeight,
        zIndex: 2,
      }}
      aria-hidden="true"
    >
      {row.name}
    </div>
    </>
  );
}

function formatSlip(days: number): string {
  if (days === 0) return "0d";
  return days > 0 ? `+${days}d` : `${days}d`;
}

export { dateFromX };
