import { useEffect, useMemo, useRef, useState } from "react";
import { resolveSectionColor, resolveSectionColors } from "@/lib/gantt/palette";
import { Modal } from "@/components/Modal";
import {
  Sortable,
  SortableItem,
  SortableItemHandle,
  type SortableCommitMeta,
} from "@/components/reui/sortable";
import { useQueryClient } from "@tanstack/react-query";
import { hasPermission, useAuth } from "@/lib/auth";
import {
  type Section,
  queryKeys,
  useProjectSections,
  useUpdateSection,
} from "@/lib/queries";
import { FIELD_FOCUS } from "@/lib/utils";

interface SectionReorderModalProps {
  projectId: number;
  open: boolean;
  onClose: () => void;
}

export function SectionReorderModal({ projectId, open, onClose }: SectionReorderModalProps) {
  // Assumes the projectSections query is already warm: this modal only ever
  // opens from ProjectList's "Reorder sections" button, which itself only
  // renders after ProjectList's own useProjectSections(project.id) call has
  // resolved (see ProjectList.tsx's sectionsLoading gate) — the same query
  // key, so this hook joins the already-populated cache rather than firing
  // a fresh request. A cold cache would seed `order` empty (below) and pin
  // the "No sections to reorder" state.
  const { data: sections } = useProjectSections(projectId);
  // Resolved from the saved list, not the draft order, so a dot keeps its colour while rows move.
  const sectionColors = useMemo(() => resolveSectionColors(sections ?? []), [sections]);
  const updateSection = useUpdateSection(projectId);
  const qc = useQueryClient();
  const { user } = useAuth();
  // The section PATCH route requires project:write (backend/src/routes/sections.ts);
  // the modal checks it itself so a second entry point cannot skip the opener's gate.
  const canReorder = hasPermission(user, "project:write");
  const [order, setOrder] = useState<Section[]>([]);
  const [saveError, setSaveError] = useState(false);
  // True for the duration of an active drag (pointer or keyboard), reset on
  // drop/cancel. Escape-to-cancel-drag vs Escape-to-close-modal can't be
  // told apart by racing Modal.tsx's own `document` keydown listener
  // against dnd-kit's KeyboardSensor cancel listener — a queueMicrotask
  // deferral was tried and disproved (per spec, a microtask checkpoint runs
  // after EACH listener returns, so it fires before dnd-kit's
  // later-registered listener calls preventDefault()). This ref sidesteps
  // the race entirely: it's read from state set at drag *start*, not from
  // anything computed within the Escape keydown's own dispatch.
  const isDraggingRef = useRef(false);

  useEffect(() => {
    // Reset the drag guard on every open/close flip: if a drag ever ended
    // without its end/cancel callback firing (e.g. a pointerup lost outside
    // the viewport — a known dnd-kit sensor gap), a stale `true` here would
    // otherwise block every close route and strand the modal.
    isDraggingRef.current = false;
    setSaveError(false);
    if (!open || !sections) return;
    setOrder([...sections].sort((a, b) => a.position - b.position || a.id - b.id));
    // `sections` is intentionally excluded: its reference changes on every
    // optimistic patch and refetch (useUpdateSection's onMutate/onSettled in
    // queries.ts), and re-seeding on those mid-session would fight the
    // Sortable's own local order right after a drop (briefly showing a
    // stale, not-yet-repacked position ordering before the settle refetch
    // lands) — see the phase plan's Risks note: the modal holds local order
    // for the whole open session; only re-seed when the session starts.
    // Same pattern as TaskFormModal.tsx's open-triggered field reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // After a failed save, follow the sections cache: a later drop's optimistic
  // write (and the re-fetch after each settle) is then reflected here instead
  // of leaving the modal on a stale local order.
  useEffect(() => {
    // Skip while a drag is in progress, so a refetch cannot move the dragged row.
    if (!saveError || !sections || isDraggingRef.current) return;
    setOrder([...sections].sort((a, b) => a.position - b.position || a.id - b.id));
  }, [saveError, sections]);

  function handleValueCommit(_value: Section[], meta: SortableCommitMeta<Section>) {
    const moved = meta.previousValue[meta.activeIndex];
    if (!moved) return;
    // Exactly one PATCH per drop, for the moved section only — the backend
    // re-packs every sibling's position dense 0..n-1 inside a transaction
    // (backend/src/routes/sections.ts), so the frontend never fans out N
    // PATCHes. useUpdateSection's onSettled invalidates projectSections,
    // which refetches the re-packed order for the List view.
    // mutateAsync, not mutate(…, { onError }): mutate-level callbacks only fire
    // for the latest call on this hook. The hook's own onError/onSettled have
    // restored and re-fetched the sections cache before this rejects, so the
    // cache read below is the server's order; the modal's local order follows it.
    updateSection
      .mutateAsync({ id: moved.id, patch: { position: meta.overIndex } })
      .then(() => setSaveError(false))
      .catch(() => {
        const fresh = qc.getQueryData<Section[]>(queryKeys.projectSections(projectId));
        if (fresh) {
          setOrder([...fresh].sort((a, b) => a.position - b.position || a.id - b.id));
        }
        setSaveError(true);
      });
  }

  // Escape and a backdrop click stay blocked mid-drag (Escape cancels the drag
  // first). The header X always closes and clears the guard, so a drag that
  // never fired its end/cancel callback cannot strand the modal.
  function handleModalClose() {
    if (isDraggingRef.current) return;
    onClose();
  }

  function handleCloseButton() {
    isDraggingRef.current = false;
    onClose();
  }

  if (!canReorder) return null;

  return (
    <Modal
      open={open}
      onClose={handleModalClose}
      title="Reorder sections"
      widthClass="max-w-md"
      onCloseButton={handleCloseButton}
    >
      {saveError && (
        <p role="alert" className="mb-3 text-sm text-error">
          Could not save the new order. The list shows the saved order.
        </p>
      )}
      {order.length === 0 ? (
        <p className="text-sm text-on-surface-variant">No sections to reorder.</p>
      ) : (
        <Sortable
          value={order}
          onValueChange={setOrder}
          getItemValue={(s) => String(s.id)}
          onValueCommit={handleValueCommit}
          onDragStart={() => {
            isDraggingRef.current = true;
          }}
          onDragEnd={() => {
            isDraggingRef.current = false;
          }}
          onDragCancel={() => {
            isDraggingRef.current = false;
          }}
          render={<div className="flex flex-col gap-1.5" />}
        >
          {order.map((section) => (
            <SortableItem
              key={section.id}
              value={String(section.id)}
              render={<div />}
              className="flex items-center gap-2 rounded-sm border border-outline-variant bg-surface-container-lowest px-3 py-2"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: resolveSectionColor(sectionColors, section) }}
              />
              <span className="flex-1 truncate text-sm text-on-surface">{section.name}</span>
              <SortableItemHandle
                render={
                  <button
                    type="button"
                    aria-label="Reorder section"
                    className={`material-symbols-outlined touch-none rounded-sm p-1 text-[17px] text-on-surface-variant/60 transition-colors hover:bg-surface-container hover:text-on-surface ${FIELD_FOCUS}`}
                  />
                }
              >
                drag_indicator
              </SortableItemHandle>
            </SortableItem>
          ))}
        </Sortable>
      )}
    </Modal>
  );
}
