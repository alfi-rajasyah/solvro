import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import {
  type Service,
  useCreateService,
  useDeleteService,
  useServices,
  useUpdateService,
} from "@/lib/queries";

/**
 * Shared service-catalogue curation UI: add / rename / describe / activate
 * toggle / delete for the global `Service` catalogue.
 *
 * Lives in Settings now (not Admin) — catalogue writes are gated by the
 * `project:write` permission, not admin-only, so any TAM with that
 * permission can curate names, descriptions, and availability here, in
 * addition to adding services inline from a customer's or project's
 * Services tab.
 */
export function ServiceCatalogueManager() {
  const { data: services, isLoading, isError } = useServices();
  const create = useCreateService();
  const update = useUpdateService();
  const remove = useDeleteService();
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  if (isLoading) return <p className="text-on-surface-variant">Loading services…</p>;
  if (isError || !services)
    return <p className="text-error">Failed to load services.</p>;

  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!newName.trim()) return;
    try {
      await create.mutateAsync({
        name: newName.trim(),
        description: newDesc.trim() || undefined,
      });
      setNewName("");
      setNewDesc("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create service.");
    }
  }

  function startEdit(s: Service) {
    setEditingId(s.id);
    setEditName(s.name);
    setEditDesc(s.description ?? "");
    setError(null);
  }

  async function saveEdit() {
    if (editingId === null) return;
    setError(null);
    try {
      await update.mutateAsync({
        id: editingId,
        patch: { name: editName.trim(), description: editDesc.trim() || undefined },
      });
      setEditingId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save service.");
    }
  }

  async function toggleActive(s: Service) {
    setError(null);
    try {
      await update.mutateAsync({ id: s.id, patch: { active: !s.active } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not toggle status.");
    }
  }

  async function handleDelete(s: Service) {
    if (
      !confirm(
        `Delete service "${s.name}"? It will be removed from every customer and project that has it assigned.`,
      )
    )
      return;
    setError(null);
    try {
      await remove.mutateAsync(s.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete service.");
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-variant">
        Shared service catalogue. Any TAM can add services inline from a
        customer's or project's Services tab; curate names, descriptions, and
        availability here.
      </p>

      {error && (
        <div className="rounded-sm border border-error/40 bg-error/10 px-3 py-2 text-sm text-error">
          {error}
        </div>
      )}

      <form
        onSubmit={handleAdd}
        className="flex flex-wrap items-end gap-2 rounded-sm border border-outline-variant bg-surface-container-lowest p-3"
      >
        <label className="w-full md:flex-1 md:min-w-[160px]">
          <span className="mb-1 block font-display text-label-caps uppercase tracking-wider text-on-surface-variant">
            Name
          </span>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={100}
            placeholder="e.g. Penetration Testing"
            className="w-full rounded-sm border border-outline-variant bg-surface px-2 py-1.5 text-sm focus:border-primary focus:outline-hidden"
          />
        </label>
        <label className="w-full md:flex-2 md:min-w-[240px]">
          <span className="mb-1 block font-display text-label-caps uppercase tracking-wider text-on-surface-variant">
            Description
          </span>
          <input
            type="text"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            maxLength={1000}
            placeholder="Short blurb shown in the catalogue"
            className="w-full rounded-sm border border-outline-variant bg-surface px-2 py-1.5 text-sm focus:border-primary focus:outline-hidden"
          />
        </label>
        <button
          type="submit"
          disabled={create.isPending || !newName.trim()}
          className="w-full rounded-sm bg-primary px-4 py-1.5 font-display text-xs font-bold text-on-primary hover:bg-primary-container disabled:opacity-60 md:w-auto"
        >
          {create.isPending ? "Adding…" : "Add service"}
        </button>
      </form>

      <div className="overflow-x-auto rounded-sm border border-outline-variant bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-outline-variant bg-surface-container-low font-display text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {services.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-on-surface-variant">
                  No services yet — add the first one above.
                </td>
              </tr>
            )}
            {services.map((s) => {
              const isEditing = editingId === s.id;
              return (
                <tr
                  key={s.id}
                  className={[
                    "border-b border-outline-variant/60 last:border-0",
                    s.active ? "" : "opacity-60",
                  ].join(" ")}
                >
                  <td className="px-3 py-2 align-top">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={100}
                        className="w-full rounded-sm border border-outline-variant bg-surface px-2 py-1 text-sm focus:border-primary focus:outline-hidden"
                      />
                    ) : (
                      <span className="font-medium text-on-surface">{s.name}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-on-surface-variant">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        maxLength={1000}
                        className="w-full rounded-sm border border-outline-variant bg-surface px-2 py-1 text-sm focus:border-primary focus:outline-hidden"
                      />
                    ) : (
                      s.description || "—"
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <button
                      type="button"
                      onClick={() => toggleActive(s)}
                      className={[
                        "rounded-full px-2 py-0.5 font-display text-label-caps uppercase tracking-wider",
                        s.active
                          ? "bg-chip-emerald-bg text-chip-emerald-text"
                          : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest",
                      ].join(" ")}
                      title="Click to toggle"
                    >
                      {s.active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex items-center justify-end gap-1">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={saveEdit}
                            disabled={update.isPending || !editName.trim()}
                            className="rounded-sm bg-primary px-2 py-1 font-display text-label-caps uppercase tracking-wider text-on-primary hover:bg-primary-container disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            disabled={update.isPending}
                            className="rounded-sm px-2 py-1 font-display text-label-caps uppercase tracking-wider text-on-surface-variant hover:bg-surface-container"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(s)}
                            className="rounded-sm px-2 py-1 font-display text-label-caps uppercase tracking-wider text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(s)}
                            className="rounded-sm px-2 py-1 font-display text-label-caps uppercase tracking-wider text-on-surface-variant hover:bg-error-container hover:text-on-error-container"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
