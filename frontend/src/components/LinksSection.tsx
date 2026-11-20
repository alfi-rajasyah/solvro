import { useState } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { SkeletonRegion } from "@/components/skeletons/SkeletonRegion";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { FIELD_FOCUS } from "@/lib/utils";

// Label + URL document links, shared by the Pipeline deal page, a project's
// Context panel, a customer's Links tab and the task panel. The host owns the data: it
// passes the list and the three mutation results (each hook is scoped to its
// own entity), so this component never knows which entity the links belong to.
// Only `id`, `label` and `url` are read from a row.
export interface LinkItem {
  id: string;
  label: string;
  url: string;
}

// The slices of the TanStack mutation results this component uses — kept
// structural so the opportunity, project and customer hooks all fit.
export interface AddLinkMutation {
  isPending: boolean;
  mutateAsync: (input: { label: string; url: string }) => Promise<unknown>;
}

export interface UpdateLinkMutation {
  isPending: boolean;
  variables?: { id: string } | undefined;
  mutateAsync: (input: { id: string; patch: { label: string; url: string } }) => Promise<unknown>;
}

export interface DeleteLinkMutation {
  isPending: boolean;
  mutate: (id: string, options?: { onSuccess?: () => void }) => void;
}

// Mirrors Velora's `getDocIcon` (../VeloraApp
// app/opportunities/[id]/detail-content.tsx) — same URL-substring
// detection, remapped from emoji onto material-symbols glyphs per house
// icon convention (frontend/CLAUDE.md: app chrome uses the
// material-symbols-outlined font).
function linkIcon(url: string): string {
  if (url.includes("docs.google.com/spreadsheets")) return "table_chart";
  if (url.includes("docs.google.com/presentation")) return "slideshow";
  if (url.includes("docs.google.com/document")) return "description";
  if (url.includes("drive.google.com")) return "folder";
  return "link";
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// `chrome` picks the outer treatment to fit the host:
//   "card"   — bordered card with its own `h2` heading + count + Add button
//              (the deal page's side column).
//   "panel"  — no card, `h3` heading + count + Add button, for a host whose
//              sections already are heading + content (the project Context
//              panel).
export function LinksSection({
  canEdit,
  links,
  isLoading,
  isError,
  error,
  addLink,
  updateLink,
  deleteLink,
  chrome = "card",
}: {
  canEdit: boolean;
  links: LinkItem[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  addLink: AddLinkMutation;
  updateLink: UpdateLinkMutation;
  deleteLink: DeleteLinkMutation;
  chrome?: "card" | "panel";
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteLink, setConfirmDeleteLink] = useState<LinkItem | null>(null);

  async function handleAdd() {
    setFormError(null);
    if (!label.trim()) {
      setFormError("Label is required.");
      return;
    }
    if (!isHttpUrl(url.trim())) {
      setFormError("URL must start with http:// or https://");
      return;
    }
    try {
      await addLink.mutateAsync({ label: label.trim(), url: url.trim() });
      setLabel("");
      setUrl("");
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not add link.");
    }
  }

  const headingText = `Links ${links && links.length > 0 ? `· ${links.length}` : ""}`;

  return (
    <div
      className={
        chrome === "panel"
          ? "space-y-3"
          : "space-y-3 rounded-sm border border-outline-variant bg-surface-container-lowest p-4"
      }
    >
      <div className="flex items-center justify-between gap-2">
        {chrome === "card" ? (
          <h2 className="font-display text-label-caps uppercase text-on-surface-variant">
            {headingText}
          </h2>
        ) : (
          <h3 className="font-display text-label-caps uppercase text-on-surface-variant">
            {headingText}
          </h3>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setFormOpen((v) => !v);
              setFormError(null);
            }}
            className={`inline-flex items-center gap-1 rounded-sm border border-outline-variant px-2 py-1 font-display text-xs font-semibold text-on-surface-variant hover:border-primary hover:text-primary ${FIELD_FOCUS}`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-base">add</span>
            Add link
          </button>
        )}
      </div>

      {isLoading && (
        <SkeletonRegion>
          <Skeleton className="h-10" />
        </SkeletonRegion>
      )}
      {isError && (
        <Alert variant="destructive">
          <AlertDescription>Could not load links: {(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {formOpen && (
        <div className="space-y-2 rounded-sm border border-outline-variant bg-surface-container-low p-3">
          <LinkFields
            label={label}
            url={url}
            onLabelChange={setLabel}
            onUrlChange={setUrl}
            withPlaceholders
          />
          {formError && <p className="text-xs text-error">{formError}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setFormError(null);
              }}
              className={`rounded-sm px-2.5 py-1 text-xs font-semibold text-on-surface-variant hover:bg-surface-container ${FIELD_FOCUS}`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={addLink.isPending}
              className={`rounded-sm bg-primary px-3 py-1 font-display text-xs font-semibold text-on-primary hover:bg-primary-container hover:text-on-primary-container disabled:opacity-50 ${FIELD_FOCUS}`}
            >
              {addLink.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {links && links.length === 0 && !formOpen && (
        <p className="text-sm text-on-surface-variant">No links yet.</p>
      )}

      {links && links.length > 0 && (
        <ul className="divide-y divide-outline-variant/60">
          {links.map((link) => (
            <LinkRow
              key={link.id}
              link={link}
              canEdit={canEdit}
              updateLink={updateLink}
              onDelete={() => setConfirmDeleteLink(link)}
            />
          ))}
        </ul>
      )}

      <ConfirmModal
        open={confirmDeleteLink !== null}
        onClose={() => setConfirmDeleteLink(null)}
        onConfirm={() => {
          if (confirmDeleteLink) {
            deleteLink.mutate(confirmDeleteLink.id, {
              onSuccess: () => setConfirmDeleteLink(null),
            });
          }
        }}
        title="Delete link"
        body={
          confirmDeleteLink ? (
            <>
              Delete the link <strong>{confirmDeleteLink.label}</strong>?
            </>
          ) : null
        }
        confirmLabel="Delete"
        confirmTone="danger"
        busy={deleteLink.isPending}
      />
    </div>
  );
}

// The label + URL inputs of the add form and of an edited row. A placeholder is
// not an accessible name, so each input carries an aria-label
// (docs/archive/plans/application-review-2026-10-22.md, F-37).
export function LinkFields({
  label,
  url,
  onLabelChange,
  onUrlChange,
  withPlaceholders = false,
}: {
  label: string;
  url: string;
  onLabelChange: (value: string) => void;
  onUrlChange: (value: string) => void;
  withPlaceholders?: boolean;
}) {
  const className =
    `w-full rounded-sm border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 text-sm text-on-surface placeholder:text-on-surface-variant ${FIELD_FOCUS}`;
  return (
    <>
      <input
        value={label}
        onChange={(e) => onLabelChange(e.target.value)}
        placeholder={withPlaceholders ? "Label (e.g. Proposal)" : undefined}
        aria-label="Link label"
        className={className}
      />
      <input
        value={url}
        onChange={(e) => onUrlChange(e.target.value)}
        placeholder={withPlaceholders ? "https://…" : undefined}
        aria-label="Link URL"
        className={className}
      />
    </>
  );
}

function LinkRow({
  link,
  canEdit,
  updateLink,
  onDelete,
}: {
  link: LinkItem;
  canEdit: boolean;
  updateLink: UpdateLinkMutation;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(link.label);
  const [url, setUrl] = useState(link.url);
  const [error, setError] = useState<string | null>(null);

  // `updateLink` is one shared mutation instance passed down to every
  // `LinkRow` (LinksSection creates it once) — its own `.isPending` is
  // global across every row's Save button, so saving link A would
  // incorrectly disable link B's Save button too while A is in flight
  // (both rows can independently be in `editing` state at once). Scope
  // "is THIS row's save in flight" by also checking the mutation's own
  // `.variables` — the acting link id from the most recent `.mutate()`
  // call — against this row's `link.id`.
  const isSaving = updateLink.isPending && updateLink.variables?.id === link.id;

  function startEdit() {
    setLabel(link.label);
    setUrl(link.url);
    setError(null);
    setEditing(true);
  }

  async function handleSave() {
    setError(null);
    if (!label.trim()) {
      setError("Label is required.");
      return;
    }
    if (!isHttpUrl(url.trim())) {
      setError("URL must start with http:// or https://");
      return;
    }
    try {
      await updateLink.mutateAsync({ id: link.id, patch: { label: label.trim(), url: url.trim() } });
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update link.");
    }
  }

  if (editing) {
    return (
      <li className="space-y-2 py-2">
        <LinkFields label={label} url={url} onLabelChange={setLabel} onUrlChange={setUrl} />
        {error && <p className="text-xs text-error">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className={`rounded-sm px-2.5 py-1 text-xs font-semibold text-on-surface-variant hover:bg-surface-container ${FIELD_FOCUS}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className={`rounded-sm bg-primary px-3 py-1 font-display text-xs font-semibold text-on-primary hover:bg-primary-container hover:text-on-primary-container disabled:opacity-50 ${FIELD_FOCUS}`}
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 py-2">
      <span aria-hidden="true" className="material-symbols-outlined shrink-0 text-[17px] text-primary">
        {linkIcon(link.url)}
      </span>
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`min-w-0 flex-1 truncate rounded-sm text-sm font-medium text-primary hover:underline ${FIELD_FOCUS}`}
      >
        {link.label}
      </a>
      {/* Always visible (not hover-gated) — hover-only actions are
          unreachable on the 375px touch-device floor (frontend/CLAUDE.md
          Mobile convention). */}
      {canEdit && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={startEdit}
            aria-label="Edit link"
            className={`tap-target rounded-sm p-1 text-on-surface-variant hover:bg-surface-container hover:text-primary ${FIELD_FOCUS}`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">edit</span>
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete link"
            className={`tap-target rounded-sm p-1 text-on-surface-variant hover:bg-surface-container hover:text-error ${FIELD_FOCUS}`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">delete</span>
          </button>
        </div>
      )}
    </li>
  );
}
