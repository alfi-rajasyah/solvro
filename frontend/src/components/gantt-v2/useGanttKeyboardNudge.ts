import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type FocusEvent as ReactFocusEvent,
  type RefObject,
} from "react";
import { addDays, parseISO } from "date-fns";
import type {
  GanttEvent,
  GanttProposedUpdate,
} from "@/components/reui/gantt/gantt-types";
import { fmtRange } from "@/lib/formatDate";
import type { Task } from "@/lib/queries";
import {
  KEYBOARD_COMMIT_DELAY_MS,
  eventDays,
  nudgeFromKey,
  nudgeRange,
  proposedUpdate,
  type DayRange,
} from "./keyboardNudge";

// Keyboard move/resize for Gantt bars (docs/archive/plans/application-review-2026-10-22.md, F-36).
//
// Keys, on a focused bar (the engine's bar IS a <button>, so it is already in
// the tab order and carries an aria-label naming the task and its dates):
//   Left / Right            move the whole bar one day      (Shift: one week)
//   Alt + Left / Right      move the END edge one day       (Shift: one week)
//   Enter                   commit a pending change now (otherwise Enter opens the task, as before)
//   Escape                  cancel a pending change
//
// Commit strategy: each key only updates a local PREVIEW (the bar moves on
// screen at once); the write goes out through the same commit the pointer
// drop uses `KEYBOARD_COMMIT_DELAY_MS` after the LAST key, on Enter, or when
// the bar loses focus. Holding or tapping an arrow therefore costs one PATCH,
// not one per keypress, and Escape can still back out. Read-only users and
// bars the pointer cannot drag/resize (rollups, milestones for resize) get no
// keyboard edit either - the same flags (`readOnly`, `draggable`, `resizable`)
// the engine's gesture layer checks.

interface Preview extends DayRange {
  /** Event id, e.g. `task-12`. */
  id: string;
  seq: number;
  /** True once handed to `commit`; kept on screen until the write settles. */
  committed: boolean;
}

/** Result of the shared commit: false = rejected, else a promise settling with the write. */
export type KeyboardCommit = (update: GanttProposedUpdate<Task>) => Promise<void> | false;

const BAR_SELECTOR = '[data-slot="gantt-bar"]';
// Chrome fires a blur when React remounts the focused bar (a move changes the
// occurrence key, which embeds the start instant). Blurs this soon after a
// key press with no new focus target are that remount, not the user leaving.
const REMOUNT_BLUR_WINDOW_MS = 150;

function announce(from: Element | null, text: string): void {
  from
    ?.closest<HTMLElement>("[data-slot=gantt]")
    ?.querySelector<HTMLElement>("[data-slot=gantt-announcer]")
    ?.replaceChildren(document.createTextNode(text));
}

interface Options {
  /** Events as derived from the task cache (no preview applied). */
  baseEvents: GanttEvent<Task>[];
  canEdit: boolean;
  commit: KeyboardCommit;
  containerRef: RefObject<HTMLElement | null>;
}

export function useGanttKeyboardNudge({ baseEvents, canEdit, commit, containerRef }: Options) {
  const [preview, setPreviewState] = useState<Preview | null>(null);
  const previewRef = useRef<Preview | null>(null);
  const seqRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const lastKeyAtRef = useRef(0);
  // Task whose bar the keyboard is working on; restored after a remount.
  const focusIdRef = useRef<string | null>(null);
  const eventsRef = useRef(baseEvents);
  const commitRef = useRef(commit);
  useLayoutEffect(() => {
    eventsRef.current = baseEvents;
    commitRef.current = commit;
  });

  const setPreview = useCallback((next: Preview | null) => {
    previewRef.current = next;
    setPreviewState(next);
  }, []);

  const clearTimer = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
  }, []);

  const flush = useCallback(() => {
    clearTimer();
    const p = previewRef.current;
    if (!p || p.committed) return;
    const event = eventsRef.current.find((e) => e.id === p.id);
    if (!event) {
      setPreview(null);
      return;
    }
    const result = commitRef.current(proposedUpdate(event, p));
    if (result === false) {
      setPreview(null);
      return;
    }
    setPreview({ ...p, committed: true });
    // Drop the preview once the write settles (success: the optimistic cache
    // already shows the same dates; failure: rolled back, so the bar snaps
    // back). A newer key press owns a newer seq and is left alone.
    void result.finally(() => {
      if (previewRef.current?.seq === p.seq) setPreview(null);
    });
  }, [clearTimer, setPreview]);

  // A pointer gesture on the same bar supersedes an unsent keyboard preview:
  // without this the preview keeps overriding the bar and the timer would
  // PATCH the stale keyboard dates over the pointer's. Called by the pointer
  // commit before it writes.
  const discard = useCallback(
    (id: string) => {
      const p = previewRef.current;
      if (p && p.id === id && !p.committed) {
        clearTimer();
        setPreview(null);
      }
    },
    [clearTimer, setPreview],
  );

  // Flush a pending change if the Gantt unmounts mid-delay. Blur does not
  // reliably fire (or reach React) when the whole view unmounts, so this is
  // the only path that saves a change made in the last 600 ms before leaving
  // the page. A failed write has no UI left to report to; the optimistic
  // update's rollback (useUpdateTask) is the only signal, which is the same
  // as any inline edit abandoned by navigation.
  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current);
      const p = previewRef.current;
      if (p && !p.committed) {
        const event = eventsRef.current.find((e) => e.id === p.id);
        if (event) {
          void commitRef.current(proposedUpdate(event, p));
        }
      }
    },
    [],
  );

  const events = useMemo(() => {
    if (!preview) return baseEvents;
    return baseEvents.map((e) =>
      e.id === preview.id
        ? { ...e, start: parseISO(preview.start), end: addDays(parseISO(preview.end), 1) }
        : e,
    );
  }, [baseEvents, preview]);

  // A move changes the bar's occurrence key, so the engine remounts the
  // button and focus falls to <body>. Put it back on the same task's bar.
  useLayoutEffect(() => {
    const id = focusIdRef.current;
    if (!id) return;
    // One-shot: armed by a key press, spent by the first re-render after it,
    // so a later click elsewhere is never fought.
    focusIdRef.current = null;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const taskId = id.replace(/^task-/, "");
    containerRef.current
      ?.querySelector<HTMLElement>(`${BAR_SELECTOR} [data-task-id="${taskId}"]`)
      ?.closest<HTMLElement>(BAR_SELECTOR)
      ?.focus();
  }, [events, containerRef]);

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLElement>) => {
      const bar = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>(BAR_SELECTOR) : null;
      // Only the focused bar itself; keys typed in inner controls are not ours.
      if (!bar || bar !== e.target) return;
      const taskNo = bar.querySelector<HTMLElement>("[data-task-id]")?.dataset.taskId;
      if (!taskNo) return; // section rollups carry no task id
      const id = `task-${taskNo}`;
      const event = eventsRef.current.find((ev) => ev.id === id);
      if (!event) return;
      const pending = previewRef.current && !previewRef.current.committed ? previewRef.current : null;

      if (e.key === "Escape" && pending?.id === id) {
        e.preventDefault();
        e.stopPropagation();
        lastKeyAtRef.current = performance.now();
        focusIdRef.current = id;
        clearTimer();
        setPreview(null);
        announce(bar, `${event.title}: change cancelled`);
        return;
      }
      if (e.key === "Enter" && pending?.id === id) {
        // Commit instead of opening the task panel (Enter normally clicks the bar).
        e.preventDefault();
        lastKeyAtRef.current = performance.now();
        focusIdRef.current = id;
        flush();
        return;
      }

      const nudge = nudgeFromKey(e);
      if (!nudge) return;
      if (!canEdit || event.readOnly || event.draggable === false) return;
      // Handled from here on, even when the action is then refused (a
      // milestone has no end edge): Alt+Arrow must never reach the browser's
      // Back/Forward.
      e.preventDefault();
      const canResize = event.resizable !== false;

      if (pending && pending.id !== id) flush();
      const current = previewRef.current?.id === id ? previewRef.current : null;
      const base: DayRange = current ?? eventDays(event);
      const next = nudgeRange(base, nudge, { canResize });
      if (!next) return;

      lastKeyAtRef.current = performance.now();
      focusIdRef.current = id;
      seqRef.current += 1;
      setPreview({ id, ...next, seq: seqRef.current, committed: false });
      announce(bar, `${event.title}, ${fmtRange(next.start, next.end)}`);
      clearTimer();
      timerRef.current = window.setTimeout(flush, KEYBOARD_COMMIT_DELAY_MS);
    },
    [canEdit, clearTimer, flush, setPreview],
  );

  const onBlur = useCallback(
    (e: ReactFocusEvent<HTMLElement>) => {
      const bar = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>(BAR_SELECTOR) : null;
      if (!bar || bar !== e.target) return;
      if (!e.relatedTarget && performance.now() - lastKeyAtRef.current < REMOUNT_BLUR_WINDOW_MS) {
        return; // the remount described above
      }
      focusIdRef.current = null;
      flush();
    },
    [flush],
  );

  return { events, onKeyDown, onBlur, discard };
}
