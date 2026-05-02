import { useMemo, useState, type FormEvent } from "react";
import { Tabs } from "@/components/Tabs";
import { ApiError } from "@/lib/api";
import {
  type AdminProject,
  type AdminRole,
  type AdminUser,
  type Service,
  useAdminCreateRole,
  useAdminCreateUser,
  useAdminDeleteRole,
  useAdminProjects,
  useAdminReassignProject,
  useAdminResetPassword,
  useAdminRoles,
  useAdminSetActive,
  useAdminUpdateRole,
  useAdminUpdateRolePermissions,
  useAdminUsers,
  useCreateService,
  useDeleteService,
  useServices,
  useUpdateService,
} from "@/lib/queries";
import type { Role } from "@/lib/auth";
import { useAuth } from "@/lib/auth";

type Tab = "users" | "roles" | "projects" | "services";

const TAB_ITEMS: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: "users", label: "Users" },
  { key: "roles", label: "Roles" },
  { key: "projects", label: "Project Override" },
  { key: "services", label: "Service Catalogue" },
];

export function Admin() {
  const [tab, setTab] = useState<Tab>("users");

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-outline-variant px-6 py-4">
        <h1 className="font-display text-2xl font-bold tracking-tight text-on-surface">
          Admin
        </h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Manage users, force-reassign project ownership, and curate the global service
          catalogue.
        </p>
        <div className="mt-4">
          <Tabs items={TAB_ITEMS} active={tab} onChange={setTab} />
        </div>
      </header>
      <div className="flex-1 overflow-auto p-6">
        {tab === "users" && <UsersTab />}
        {tab === "roles" && <RolesTab />}
        {tab === "projects" && <ProjectsTab />}
        {tab === "services" && <ServicesTab />}
      </div>
    </div>
  );
}

// ---- Users tab ------------------------------------------------------------

function UsersTab() {
  const { user: currentUser } = useAuth();
  const { data: users, isLoading, isError } = useAdminUsers();
  const { data: roles } = useAdminRoles();
  const createUser = useAdminCreateUser();
  const updateRole = useAdminUpdateRole();
  const setActive = useAdminSetActive();
  const resetPassword = useAdminResetPassword();
  const [resetResult, setResetResult] = useState<
    { username: string; tempPassword: string } | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<Role>("TAM");

  const roleOptions = useMemo<Role[]>(
    () => (roles ?? []).map((r) => r.roleName),
    [roles],
  );

  if (isLoading) return <p className="text-on-surface-variant">Loading users…</p>;
  if (isError || !users) return <p className="text-error">Failed to load users.</p>;

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!newEmail.trim() || !newUsername.trim() || newPassword.length < 8) return;
    try {
      await createUser.mutateAsync({
        email: newEmail.trim(),
        username: newUsername.trim(),
        password: newPassword,
        role: newRole,
      });
      setNewEmail("");
      setNewUsername("");
      setNewPassword("");
      setNewRole("TAM");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create user.");
    }
  }

  async function handleRoleChange(u: AdminUser, role: Role) {
    setError(null);
    try {
      await updateRole.mutateAsync({ id: u.id, role });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update role.");
    }
  }

  async function handleToggleActive(u: AdminUser) {
    setError(null);
    try {
      await setActive.mutateAsync({ id: u.id, active: !u.active });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update status.");
    }
  }

  async function handleResetPassword(u: AdminUser) {
    setError(null);
    if (!confirm(`Reset password for ${u.username}? Their current password will stop working.`)) return;
    try {
      const res = await resetPassword.mutateAsync(u.id);
      setResetResult({ username: u.username, tempPassword: res.tempPassword });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reset password.");
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded border border-error/40 bg-error/10 px-3 py-2 text-sm text-error">
          {error}
        </div>
      )}
      {resetResult && (
        <div className="rounded border border-tertiary/40 bg-tertiary/10 px-3 py-3 text-sm text-on-surface">
          <p className="font-display text-[11px] font-bold uppercase tracking-wider text-tertiary">
            Temporary password generated
          </p>
          <p className="mt-1">
            For <strong>{resetResult.username}</strong>:{" "}
            <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[12px]">
              {resetResult.tempPassword}
            </code>
          </p>
          <p className="mt-1 text-on-surface-variant">
            Share this with the user via a secure channel. It will not be shown again.
          </p>
          <button
            type="button"
            onClick={() => setResetResult(null)}
            className="mt-2 font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant hover:text-on-surface"
          >
            Dismiss
          </button>
        </div>
      )}
      <form
        onSubmit={handleCreate}
        className="flex flex-wrap items-end gap-2 rounded border border-outline-variant bg-surface-container-lowest p-3"
      >
        <label className="flex-1 min-w-[160px]">
          <span className="mb-1 block font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
            Email
          </span>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="user@example.com"
            className="w-full rounded border border-outline-variant bg-surface px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
          />
        </label>
        <label className="flex-1 min-w-[120px]">
          <span className="mb-1 block font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
            Username
          </span>
          <input
            type="text"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            maxLength={50}
            placeholder="alice"
            className="w-full rounded border border-outline-variant bg-surface px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
          />
        </label>
        <label className="flex-1 min-w-[140px]">
          <span className="mb-1 block font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
            Password (min 8)
          </span>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            className="w-full rounded border border-outline-variant bg-surface px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
          />
        </label>
        <label className="min-w-[120px]">
          <span className="mb-1 block font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
            Role
          </span>
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as Role)}
            className="w-full rounded border border-outline-variant bg-surface px-2 py-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-on-surface focus:border-primary focus:outline-none"
          >
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={
            createUser.isPending ||
            !newEmail.trim() ||
            !newUsername.trim() ||
            newPassword.length < 8
          }
          className="rounded bg-primary px-4 py-1.5 font-display text-xs font-bold text-on-primary hover:bg-primary-container disabled:opacity-60"
        >
          {createUser.isPending ? "Adding…" : "Add user"}
        </button>
      </form>

      <div className="overflow-x-auto rounded border border-outline-variant bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-outline-variant bg-surface-container-low font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
            <tr>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2 text-right">Projects (TAM/SA)</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = currentUser?.id === u.id;
              return (
                <tr
                  key={u.id}
                  className={[
                    "border-b border-outline-variant/60 last:border-0",
                    u.active ? "" : "opacity-60",
                  ].join(" ")}
                >
                  <td className="px-3 py-2 font-medium text-on-surface">{u.username}</td>
                  <td className="px-3 py-2 font-mono text-[12px] text-on-surface-variant">
                    {u.email}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={u.role}
                      disabled={isSelf}
                      onChange={(e) => handleRoleChange(u, e.target.value as Role)}
                      className="rounded border border-outline-variant bg-surface px-2 py-1 font-display text-[11px] font-bold uppercase tracking-wider text-on-surface focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                      title={isSelf ? "You cannot change your own role" : undefined}
                    >
                      {roleOptions.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[12px] text-on-surface-variant">
                    {u.projectsAsTAM} / {u.projectsAsSA}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={[
                        "rounded-full px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider",
                        u.active
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-surface-container-high text-on-surface-variant",
                      ].join(" ")}
                    >
                      {u.active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(u)}
                        disabled={isSelf}
                        className="rounded px-2 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant hover:bg-surface-container hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-50"
                        title={isSelf ? "You cannot deactivate yourself" : undefined}
                      >
                        {u.active ? "Deactivate" : "Reactivate"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResetPassword(u)}
                        className="rounded px-2 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                      >
                        Reset password
                      </button>
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

// ---- Roles tab ------------------------------------------------------------

function RolesTab() {
  const { data: roles, isLoading, isError } = useAdminRoles();
  const createRole = useAdminCreateRole();
  const updatePerms = useAdminUpdateRolePermissions();
  const deleteRole = useAdminDeleteRole();
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newPerms, setNewPerms] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPerms, setEditPerms] = useState("");

  if (isLoading) return <p className="text-on-surface-variant">Loading roles…</p>;
  if (isError || !roles) return <p className="text-error">Failed to load roles.</p>;

  function parsePerms(raw: string): string[] {
    return raw
      .split(/[,\n]/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const trimmed = newName.trim().toUpperCase();
    if (!trimmed) return;
    if (!/^[A-Z0-9_]+$/.test(trimmed)) {
      setError("Role name must be uppercase letters, digits, or underscores.");
      return;
    }
    try {
      await createRole.mutateAsync({
        roleName: trimmed,
        permissions: parsePerms(newPerms),
      });
      setNewName("");
      setNewPerms("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create role.");
    }
  }

  function startEdit(r: AdminRole) {
    setEditingId(r.id);
    setEditPerms(r.permissions.join(", "));
    setError(null);
  }

  async function saveEdit() {
    if (editingId === null) return;
    setError(null);
    try {
      await updatePerms.mutateAsync({
        id: editingId,
        permissions: parsePerms(editPerms),
      });
      setEditingId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save permissions.");
    }
  }

  async function handleDelete(r: AdminRole) {
    if (!confirm(`Delete role "${r.roleName}"? It currently has no users.`)) return;
    setError(null);
    try {
      await deleteRole.mutateAsync(r.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete role.");
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-variant">
        Built-in roles (ADMIN, SA, TAM, STAKEHOLDER) are referenced by name in
        backend code and cannot be deleted or renamed. Custom roles you create
        here can be assigned to users but won't trigger built-in code paths
        (e.g. project visibility filters) — grant access by assigning users
        directly as TAM/SA on specific projects.
      </p>

      {error && (
        <div className="rounded border border-error/40 bg-error/10 px-3 py-2 text-sm text-error">
          {error}
        </div>
      )}

      <form
        onSubmit={handleCreate}
        className="flex flex-wrap items-end gap-2 rounded border border-outline-variant bg-surface-container-lowest p-3"
      >
        <label className="flex-1 min-w-[160px]">
          <span className="mb-1 block font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
            Role name (uppercase)
          </span>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={50}
            placeholder="e.g. MANAGER"
            className="w-full rounded border border-outline-variant bg-surface px-2 py-1.5 font-mono text-sm uppercase focus:border-primary focus:outline-none"
          />
        </label>
        <label className="flex-[2] min-w-[240px]">
          <span className="mb-1 block font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
            Permissions (comma-separated, optional)
          </span>
          <input
            type="text"
            value={newPerms}
            onChange={(e) => setNewPerms(e.target.value)}
            placeholder="project:read, task:write"
            className="w-full rounded border border-outline-variant bg-surface px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={createRole.isPending || !newName.trim()}
          className="rounded bg-primary px-4 py-1.5 font-display text-xs font-bold text-on-primary hover:bg-primary-container disabled:opacity-60"
        >
          {createRole.isPending ? "Adding…" : "Add role"}
        </button>
      </form>

      <div className="overflow-x-auto rounded border border-outline-variant bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-outline-variant bg-surface-container-low font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
            <tr>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Permissions</th>
              <th className="px-3 py-2 text-right">Users</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => {
              const isAdmin = r.roleName === "ADMIN";
              const isEditing = editingId === r.id;
              return (
                <tr
                  key={r.id}
                  className="border-b border-outline-variant/60 last:border-0"
                >
                  <td className="px-3 py-2 align-top">
                    <span className="font-mono font-medium text-on-surface">
                      {r.roleName}
                    </span>
                    {r.builtIn && (
                      <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-wider text-primary">
                        Built-in
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-on-surface-variant">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editPerms}
                        onChange={(e) => setEditPerms(e.target.value)}
                        className="w-full rounded border border-outline-variant bg-surface px-2 py-1 text-sm focus:border-primary focus:outline-none"
                      />
                    ) : r.permissions.length === 0 ? (
                      <span className="text-on-surface-variant/60">—</span>
                    ) : (
                      <span className="font-mono text-[12px]">
                        {r.permissions.join(", ")}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-right font-mono text-[12px] text-on-surface-variant">
                    {r.userCount}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex items-center justify-end gap-1">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={saveEdit}
                            disabled={updatePerms.isPending}
                            className="rounded bg-primary px-2 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-on-primary hover:bg-primary-container disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded px-2 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant hover:bg-surface-container"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(r)}
                            disabled={isAdmin}
                            className="rounded px-2 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant hover:bg-surface-container hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-50"
                            title={
                              isAdmin
                                ? "ADMIN permissions are always full access"
                                : undefined
                            }
                          >
                            Edit perms
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(r)}
                            disabled={r.builtIn || r.userCount > 0}
                            className="rounded px-2 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant hover:bg-error-container hover:text-on-error-container disabled:cursor-not-allowed disabled:opacity-50"
                            title={
                              r.builtIn
                                ? "Built-in role"
                                : r.userCount > 0
                                  ? "Reassign users first"
                                  : undefined
                            }
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

// ---- Project Override tab -------------------------------------------------

function ProjectsTab() {
  const { data: projects, isLoading, isError } = useAdminProjects();
  const { data: users } = useAdminUsers();
  const reassign = useAdminReassignProject();
  const [error, setError] = useState<string | null>(null);

  const tamCandidates = useMemo(
    () =>
      (users ?? []).filter(
        (u) => u.active && (u.role === "TAM" || u.role === "ADMIN"),
      ),
    [users],
  );

  if (isLoading) return <p className="text-on-surface-variant">Loading projects…</p>;
  if (isError || !projects)
    return <p className="text-error">Failed to load projects.</p>;

  async function handleReassign(p: AdminProject, newTamId: number) {
    if (newTamId === p.tamId) return;
    setError(null);
    try {
      await reassign.mutateAsync({ projectId: p.id, newTamId });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reassign project.");
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-variant">
        Force-reassign the TAM owner of any project. This bypasses the standard
        visibility check.
      </p>
      {error && (
        <div className="rounded border border-error/40 bg-error/10 px-3 py-2 text-sm text-error">
          {error}
        </div>
      )}
      <div className="overflow-x-auto rounded border border-outline-variant bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-outline-variant bg-surface-container-low font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
            <tr>
              <th className="px-3 py-2">Project</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">SA</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Tasks</th>
              <th className="px-3 py-2">Current TAM → Reassign</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr
                key={p.id}
                className="border-b border-outline-variant/60 last:border-0"
              >
                <td className="px-3 py-2 font-medium text-on-surface">{p.name}</td>
                <td className="px-3 py-2 text-on-surface-variant">
                  {p.customer?.name ?? "—"}
                </td>
                <td className="px-3 py-2 text-on-surface-variant">{p.sa.username}</td>
                <td className="px-3 py-2">
                  <span className="rounded bg-surface-container-low px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                    {p.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-[12px] text-on-surface-variant">
                  {p._count.tasks}
                </td>
                <td className="px-3 py-2">
                  <select
                    value={p.tamId}
                    onChange={(e) => handleReassign(p, Number(e.target.value))}
                    className="w-full rounded border border-outline-variant bg-surface px-2 py-1 text-[12px] text-on-surface focus:border-primary focus:outline-none"
                  >
                    {tamCandidates.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.username} ({u.role})
                      </option>
                    ))}
                    {/* If the current TAM isn't in the candidate list (inactive or wrong role), show them anyway */}
                    {!tamCandidates.some((u) => u.id === p.tamId) && (
                      <option value={p.tamId}>
                        {p.tam.username} (current)
                      </option>
                    )}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- Service Catalogue tab ------------------------------------------------

function ServicesTab() {
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
        `Delete service "${s.name}"? It will be removed from every customer that has it assigned.`,
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
        Global service catalogue. TAMs map services to customers from the customer
        detail page; only Admins can curate this list.
      </p>

      {error && (
        <div className="rounded border border-error/40 bg-error/10 px-3 py-2 text-sm text-error">
          {error}
        </div>
      )}

      <form
        onSubmit={handleAdd}
        className="flex flex-wrap items-end gap-2 rounded border border-outline-variant bg-surface-container-lowest p-3"
      >
        <label className="flex-1 min-w-[160px]">
          <span className="mb-1 block font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
            Name
          </span>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={100}
            placeholder="e.g. Penetration Testing"
            className="w-full rounded border border-outline-variant bg-surface px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
          />
        </label>
        <label className="flex-[2] min-w-[240px]">
          <span className="mb-1 block font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
            Description
          </span>
          <input
            type="text"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            maxLength={1000}
            placeholder="Short blurb shown in the catalogue"
            className="w-full rounded border border-outline-variant bg-surface px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={create.isPending || !newName.trim()}
          className="rounded bg-primary px-4 py-1.5 font-display text-xs font-bold text-on-primary hover:bg-primary-container disabled:opacity-60"
        >
          {create.isPending ? "Adding…" : "Add service"}
        </button>
      </form>

      <div className="overflow-x-auto rounded border border-outline-variant bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-outline-variant bg-surface-container-low font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
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
                        className="w-full rounded border border-outline-variant bg-surface px-2 py-1 text-sm focus:border-primary focus:outline-none"
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
                        className="w-full rounded border border-outline-variant bg-surface px-2 py-1 text-sm focus:border-primary focus:outline-none"
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
                        "rounded-full px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider",
                        s.active
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
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
                            className="rounded bg-primary px-2 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-on-primary hover:bg-primary-container disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            disabled={update.isPending}
                            className="rounded px-2 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant hover:bg-surface-container"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(s)}
                            className="rounded px-2 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(s)}
                            className="rounded px-2 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant hover:bg-error-container hover:text-on-error-container"
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
