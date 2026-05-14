import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Modal } from "@/components/Modal";
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
  useAdminDeleteUser,
  useAdminProjects,
  useAdminReassignProject,
  useAdminResetPassword,
  useAdminRoles,
  useAdminSetActive,
  useAdminUpdateRole,
  useAdminUpdateRolePermissions,
  useAdminUsers,
  useAuthSettings,
  useCreateService,
  useDeleteService,
  useServices,
  useUpdateAuthSettings,
  useUpdateService,
} from "@/lib/queries";
import type { Role } from "@/lib/auth";
import { useAuth } from "@/lib/auth";

type Tab = "users" | "roles" | "signin" | "projects" | "services";

const TAB_ITEMS: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: "users", label: "Users" },
  { key: "roles", label: "Roles" },
  { key: "signin", label: "Sign-in" },
  { key: "projects", label: "Project Override" },
  { key: "services", label: "Service Catalogue" },
];

// Domain regex matches the backend validator (PATCH /admin/settings/auth).
const DOMAIN_PATTERN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

export function Admin() {
  const [tab, setTab] = useState<Tab>("users");

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-outline-variant px-4 py-4 md:px-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-on-surface">
          Admin
        </h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Manage users, force-reassign project ownership, and curate the global service
          catalogue.
        </p>
        <div className="mt-4 overflow-x-auto">
          <Tabs items={TAB_ITEMS} active={tab} onChange={setTab} />
        </div>
      </header>
      <div className="flex-1 overflow-auto p-4 md:p-6">
        {tab === "users" && <UsersTab />}
        {tab === "roles" && <RolesTab />}
        {tab === "signin" && <SignInTab />}
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
  const deleteUser = useAdminDeleteUser();
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

  // PENDING is provisioning-only — never offer it as a target in any
  // user-facing dropdown (assignment goes one-way: PENDING → real role).
  const assignableRoles = useMemo<Role[]>(
    () => (roles ?? []).map((r) => r.roleName).filter((r) => r !== "PENDING"),
    [roles],
  );
  // For an existing user, the dropdown must still include their current
  // role (even if it's PENDING) so the select renders without a phantom
  // value mismatch — but it remains the only PENDING option available.
  function roleOptionsFor(currentRole: Role): Role[] {
    return currentRole === "PENDING"
      ? ["PENDING", ...assignableRoles]
      : assignableRoles;
  }

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

  async function handleDelete(u: AdminUser) {
    setError(null);
    if (
      !confirm(
        `Permanently delete ${u.username} (${u.email})? This cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      await deleteUser.mutateAsync(u.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete user.");
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

  const activeCount = users.filter((u) => u.active).length;
  const adminCount = users.filter((u) => u.role === "ADMIN").length;
  const pendingCount = users.filter((u) => u.role === "PENDING").length;
  const customRoleCount = (roles ?? []).filter(
    (r) => !["ADMIN", "TAM", "SA", "STAKEHOLDER", "PENDING"].includes(r.roleName),
  ).length;

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminKpi label="Users" value={users.length} hint={`${activeCount} active · ${adminCount} admins`} icon="group" tone="primary" />
        <AdminKpi label="Pending" value={pendingCount} hint="Needs role assignment" icon="hourglass_top" tone="amber" />
        <AdminKpi label="Custom roles" value={customRoleCount} hint={`${(roles ?? []).length} total roles`} icon="shield_person" tone="emerald" />
        <AdminKpi label="Inactive" value={users.length - activeCount} hint="Cannot sign in" icon="block" tone="neutral" />
      </div>
      {error && (
        <div className="rounded border border-error/40 bg-error/10 px-3 py-2 text-sm text-error">
          {error}
        </div>
      )}
      {resetResult && (
        <div className="rounded border border-tertiary/40 bg-tertiary/10 px-3 py-3 text-sm text-on-surface">
          <p className="font-display text-[12px] font-bold uppercase tracking-wider text-tertiary">
            Temporary password generated
          </p>
          <p className="mt-1">
            For <strong>{resetResult.username}</strong>:{" "}
            <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[13px]">
              {resetResult.tempPassword}
            </code>
          </p>
          <p className="mt-1 text-on-surface-variant">
            Share this with the user via a secure channel. It will not be shown again.
          </p>
          <button
            type="button"
            onClick={() => setResetResult(null)}
            className="mt-2 font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant hover:text-on-surface"
          >
            Dismiss
          </button>
        </div>
      )}
      <form
        onSubmit={handleCreate}
        className="flex flex-wrap items-end gap-2 rounded border border-outline-variant bg-surface-container-lowest p-3"
      >
        <label className="w-full md:flex-1 md:min-w-[160px]">
          <span className="mb-1 block font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
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
        <label className="w-full md:flex-1 md:min-w-[120px]">
          <span className="mb-1 block font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
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
        <label className="w-full md:flex-1 md:min-w-[140px]">
          <span className="mb-1 block font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
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
        <label className="w-full md:w-auto md:min-w-[120px]">
          <span className="mb-1 block font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
            Role
          </span>
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as Role)}
            className="w-full rounded border border-outline-variant bg-surface px-2 py-1.5 font-display text-[12px] font-bold uppercase tracking-wider text-on-surface focus:border-primary focus:outline-none"
          >
            {assignableRoles.map((r) => (
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
          className="w-full rounded bg-primary px-4 py-1.5 font-display text-xs font-bold text-on-primary hover:bg-primary-container disabled:opacity-60 md:w-auto"
        >
          {createUser.isPending ? "Adding…" : "Add user"}
        </button>
      </form>

      <div className="overflow-x-auto rounded border border-outline-variant bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-outline-variant bg-surface-container-low font-display text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">
            <tr>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Provider</th>
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
                  <td className="px-3 py-2 font-mono text-[13px] text-on-surface-variant">
                    {u.email}
                  </td>
                  <td className="px-3 py-2">
                    <ProviderChip provider={u.provider} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <select
                        value={u.role}
                        disabled={isSelf}
                        onChange={(e) => handleRoleChange(u, e.target.value as Role)}
                        className="rounded border border-outline-variant bg-surface px-2 py-1 font-display text-[12px] font-bold uppercase tracking-wider text-on-surface focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                        title={isSelf ? "You cannot change your own role" : undefined}
                      >
                        {roleOptionsFor(u.role).map((r) => (
                          <option key={r} value={r} disabled={r === "PENDING"}>
                            {r}
                          </option>
                        ))}
                      </select>
                      {u.role === "PENDING" && (
                        <span
                          title="Auto-provisioned via Google. Pick a role above to grant access."
                          className="rounded-full bg-chip-amber-bg px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider text-chip-amber-text"
                        >
                          Needs role
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[13px] text-on-surface-variant">
                    {u.projectsAsTAM} / {u.projectsAsSA}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={[
                        "rounded-full px-2 py-0.5 font-display text-[11px] font-bold uppercase tracking-wider",
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
                        className="rounded px-2 py-1 font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant hover:bg-surface-container hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-50"
                        title={isSelf ? "You cannot deactivate yourself" : undefined}
                      >
                        {u.active ? "Deactivate" : "Reactivate"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResetPassword(u)}
                        className="rounded px-2 py-1 font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                      >
                        Reset password
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(u)}
                        disabled={isSelf || deleteUser.isPending}
                        className="rounded px-2 py-1 font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant hover:bg-error-container hover:text-on-error-container disabled:cursor-not-allowed disabled:opacity-50"
                        title={
                          isSelf
                            ? "You cannot delete yourself"
                            : "Permanently delete this user"
                        }
                      >
                        Delete
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

function ProviderChip({ provider }: { provider: "google" | "password" }) {
  if (provider === "google") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-display text-[11px] font-semibold text-primary dark:bg-primary/20">
        <span className="material-symbols-outlined text-[12px]">mail</span>
        Google
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2 py-0.5 font-display text-[11px] font-semibold text-on-surface-variant">
      <span className="material-symbols-outlined text-[12px]">key</span>
      Password
    </span>
  );
}

function AdminKpi({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  icon: string;
  tone: "primary" | "emerald" | "amber" | "neutral";
}) {
  const iconColor =
    tone === "primary"
      ? "text-primary"
      : tone === "emerald"
        ? "text-emerald-600"
        : tone === "amber"
          ? "text-amber-600"
          : "text-on-surface-variant";
  return (
    <div className="rounded border border-outline-variant bg-surface-container-lowest p-4 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">{label}</span>
        <span className={`material-symbols-outlined text-base ${iconColor}`}>{icon}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-mono text-3xl font-bold tabular-nums text-on-surface">{value}</span>
        {hint && <span className="text-[11px] text-on-surface-variant">{hint}</span>}
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
        Built-in roles (ADMIN, SA, TAM, STAKEHOLDER, PENDING) are referenced by
        name in backend code and cannot be deleted or renamed. PENDING is the
        auto-provisioning role for first-time Google sign-ins — assign a real
        role from the Users tab to grant access. Custom roles you create here
        can be assigned to users but won't trigger built-in code paths (e.g.
        project visibility filters) — grant access by assigning users directly
        as TAM/SA on specific projects.
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
        <label className="w-full md:flex-1 md:min-w-[160px]">
          <span className="mb-1 block font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
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
        <label className="w-full md:flex-[2] md:min-w-[240px]">
          <span className="mb-1 block font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
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
          className="w-full rounded bg-primary px-4 py-1.5 font-display text-xs font-bold text-on-primary hover:bg-primary-container disabled:opacity-60 md:w-auto"
        >
          {createRole.isPending ? "Adding…" : "Add role"}
        </button>
      </form>

      <div className="overflow-x-auto rounded border border-outline-variant bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-outline-variant bg-surface-container-low font-display text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">
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
                      <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider text-primary">
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
                      <span className="font-mono text-[13px]">
                        {r.permissions.join(", ")}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-right font-mono text-[13px] text-on-surface-variant">
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
                            className="rounded bg-primary px-2 py-1 font-display text-[11px] font-bold uppercase tracking-wider text-on-primary hover:bg-primary-container disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded px-2 py-1 font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant hover:bg-surface-container"
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
                            className="rounded px-2 py-1 font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant hover:bg-surface-container hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-50"
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
                            className="rounded px-2 py-1 font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant hover:bg-error-container hover:text-on-error-container disabled:cursor-not-allowed disabled:opacity-50"
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

// ---- Sign-in (OAuth policy) tab -------------------------------------------

const GOOGLE_CLIENT_ID_PATTERN =
  /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/;

function maskClientId(id: string): string {
  // Show "123…xyz.apps.googleusercontent.com" — enough to recognise, not enough
  // to dictate. The Client ID is technically public (it ships in the bundle),
  // but treating it as private in admin chrome keeps the UI feeling intentional.
  const at = id.indexOf(".apps.googleusercontent.com");
  if (at <= 0) return id;
  const prefix = id.slice(0, at);
  if (prefix.length <= 7) return id;
  return `${prefix.slice(0, 3)}…${prefix.slice(-3)}${id.slice(at)}`;
}

function SignInTab() {
  const { data, isLoading, isError } = useAuthSettings();
  const [modalOpen, setModalOpen] = useState(false);

  if (isLoading) return <p className="text-on-surface-variant">Loading sign-in policy…</p>;
  if (isError || !data) return <p className="text-error">Failed to load sign-in policy.</p>;

  const connected =
    data.googleClientId !== null && data.googleAllowedDomains.length > 0;
  const halfConfigured =
    (data.googleClientId !== null) !== (data.googleAllowedDomains.length > 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-variant">
        Connect Solvro to your company's Google Workspace so employees can sign
        in with their work Google account. The first sign-in auto-creates a{" "}
        <span className="font-mono">PENDING</span> account that you assign a
        role to from the Users tab.
      </p>

      {/* Connection card */}
      <div className="rounded border border-outline-variant bg-surface-container-lowest p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={[
                "grid h-10 w-10 shrink-0 place-items-center rounded-full",
                connected
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "bg-surface-container-high text-on-surface-variant",
              ].join(" ")}
            >
              <span className="material-symbols-outlined text-[20px]">
                {connected ? "verified_user" : "lock_open"}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-sm font-semibold text-on-surface">
                  Google identity provider
                </span>
                <span
                  className={[
                    "rounded-full px-2 py-0.5 font-display text-[11px] font-semibold uppercase tracking-wider",
                    connected
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : halfConfigured
                        ? "bg-chip-amber-bg text-chip-amber-text"
                        : "bg-surface-container-high text-on-surface-variant",
                  ].join(" ")}
                >
                  {connected
                    ? "Connected"
                    : halfConfigured
                      ? "Half configured"
                      : "Not connected"}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-on-surface-variant">
                {connected
                  ? `${data.googleAllowedDomains.length} domain${data.googleAllowedDomains.length === 1 ? "" : "s"} allowed`
                  : "Set a Client ID and at least one allowed email domain to enable Google sign-in."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="rounded bg-primary px-4 py-1.5 font-display text-[12px] font-bold uppercase tracking-wider text-on-primary hover:bg-primary-container"
          >
            {connected ? "Manage" : "Connect"}
          </button>
        </div>

        {connected && (
          <div className="mt-4 grid gap-3 border-t border-outline-variant pt-4 sm:grid-cols-2">
            <ClientIdField id={data.googleClientId!} />
            <div>
              <div className="mb-1 font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                Allowed domains
              </div>
              <div className="flex flex-wrap gap-1.5">
                {data.googleAllowedDomains.map((d) => (
                  <span
                    key={d}
                    className="rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-[12px] text-primary dark:bg-primary/20"
                  >
                    {d}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 border-t border-outline-variant pt-3 text-[11px] text-on-surface-variant">
          {data.updatedBy ? (
            <>
              Last updated by{" "}
              <span className="font-semibold">{data.updatedBy.username}</span>{" "}
              on{" "}
              <span className="font-mono">
                {new Date(data.updatedAt).toLocaleString()}
              </span>
            </>
          ) : (
            <>Not yet edited since the database was seeded.</>
          )}
        </div>
      </div>

      <SignInModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initialClientId={data.googleClientId ?? ""}
        initialDomains={data.googleAllowedDomains}
      />
    </div>
  );
}

// Read-only display for the saved Client ID — masked by default, click-to-reveal.
// Reveal is just a UX nicety; the ID isn't actually secret.
function ClientIdField({ id }: { id: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
          Client ID
        </span>
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          className="font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant hover:text-on-surface"
        >
          {revealed ? "Hide" : "Reveal"}
        </button>
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(id)}
          title="Copy to clipboard"
          className="text-on-surface-variant hover:text-on-surface"
        >
          <span className="material-symbols-outlined text-[14px]">
            content_copy
          </span>
        </button>
      </div>
      <div className="break-all rounded bg-surface px-2 py-1.5 font-mono text-[12px] text-on-surface">
        {revealed ? id : maskClientId(id)}
      </div>
    </div>
  );
}

function SignInModal({
  open,
  onClose,
  initialClientId,
  initialDomains,
}: {
  open: boolean;
  onClose: () => void;
  initialClientId: string;
  initialDomains: string[];
}) {
  const update = useUpdateAuthSettings();
  const [clientId, setClientId] = useState(initialClientId);
  const [domains, setDomains] = useState<string[]>(initialDomains);
  const [newDomain, setNewDomain] = useState("");
  const [showClientId, setShowClientId] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset draft whenever the modal opens, so reopening after Save shows the
  // current server state, not stale local edits.
  useEffect(() => {
    if (open) {
      setClientId(initialClientId);
      setDomains(initialDomains);
      setNewDomain("");
      setShowClientId(false);
      setError(null);
    }
  }, [open, initialClientId, initialDomains]);

  const dirty =
    clientId !== initialClientId ||
    domains.length !== initialDomains.length ||
    domains.some((d, i) => d !== initialDomains[i]);

  function addDomain() {
    setError(null);
    const d = newDomain.trim().toLowerCase();
    if (!d) return;
    if (!DOMAIN_PATTERN.test(d)) {
      setError("Enter a valid hostname (e.g. example.com).");
      return;
    }
    if (domains.includes(d)) {
      setError(`"${d}" is already in the list.`);
      return;
    }
    setDomains([...domains, d]);
    setNewDomain("");
  }

  function removeDomain(d: string) {
    setError(null);
    setDomains(domains.filter((x) => x !== d));
  }

  async function save() {
    setError(null);
    const trimmed = clientId.trim();
    if (trimmed !== "" && !GOOGLE_CLIENT_ID_PATTERN.test(trimmed)) {
      setError(
        "Client ID must look like 123456789-abc.apps.googleusercontent.com.",
      );
      return;
    }
    try {
      await update.mutateAsync({
        googleClientId: trimmed === "" ? null : trimmed,
        googleAllowedDomains: domains,
      });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save policy.");
    }
  }

  async function disconnect() {
    setError(null);
    if (
      !confirm(
        "Disconnect Google sign-in? Users with Google-only accounts won't be able to sign in until you reconnect.",
      )
    ) {
      return;
    }
    try {
      await update.mutateAsync({
        googleClientId: null,
        googleAllowedDomains: [],
      });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not disconnect.");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Configure Google sign-in"
      widthClass="max-w-xl"
      footer={
        <>
          {(initialClientId || initialDomains.length > 0) && (
            <button
              type="button"
              onClick={disconnect}
              disabled={update.isPending}
              className="mr-auto rounded px-3 py-1.5 font-display text-[12px] font-bold uppercase tracking-wider text-error hover:bg-error-container disabled:opacity-50"
            >
              Disconnect
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={update.isPending}
            className="rounded px-3 py-1.5 font-display text-[12px] font-bold uppercase tracking-wider text-on-surface-variant hover:bg-surface-container"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || update.isPending}
            className="rounded bg-primary px-4 py-1.5 font-display text-[12px] font-bold uppercase tracking-wider text-on-primary hover:bg-primary-container disabled:opacity-50"
          >
            {update.isPending ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <details className="rounded border border-outline-variant bg-surface-container text-sm">
          <summary className="cursor-pointer px-3 py-2 font-display text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">
            How to get a Client ID
          </summary>
          <ol className="list-decimal space-y-1 border-t border-outline-variant px-6 py-3 text-on-surface-variant">
            <li>
              Google Cloud Console → APIs & Services → Credentials → Create
              credentials → <strong>OAuth 2.0 Client ID</strong> (Web application).
            </li>
            <li>
              Add your app origins under{" "}
              <strong>Authorized JavaScript origins</strong> (e.g.{" "}
              <span className="font-mono">http://localhost:5173</span> for dev,
              plus your production URL — no trailing slash, no path).
            </li>
            <li>
              Copy the Client ID (ends in{" "}
              <span className="font-mono">.apps.googleusercontent.com</span>)
              and paste it below.
            </li>
          </ol>
        </details>

        {error && (
          <div className="rounded border border-error/40 bg-error/10 px-3 py-2 text-sm text-error">
            {error}
          </div>
        )}

        <div>
          <label className="block">
            <span className="mb-1 flex items-center justify-between gap-2">
              <span className="font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                Google OAuth Client ID
              </span>
              <button
                type="button"
                onClick={() => setShowClientId((v) => !v)}
                className="font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant hover:text-on-surface"
              >
                {showClientId ? "Hide" : "Show"}
              </button>
            </span>
            <input
              type={showClientId ? "text" : "password"}
              value={clientId}
              onChange={(e) => {
                setError(null);
                setClientId(e.target.value);
              }}
              placeholder="123456789-abc.apps.googleusercontent.com"
              spellCheck={false}
              autoComplete="off"
              className="w-full rounded border border-outline-variant bg-surface px-2 py-1.5 font-mono text-sm focus:border-primary focus:outline-none"
            />
          </label>
          <p className="mt-1 text-[11px] text-on-surface-variant">
            The Client ID is a public identifier (it ships in any Google
            sign-in button). The Client <em>Secret</em> stays in Google Cloud
            and is never used by Solvro — we verify ID tokens server-side
            against this audience.
          </p>
        </div>

        <div>
          <div className="mb-1 font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
            Allowed email domains
          </div>
          <div className="flex flex-wrap gap-2">
            {domains.length === 0 && (
              <span className="text-xs text-on-surface-variant">
                No domains yet.
              </span>
            )}
            {domains.map((d) => (
              <span
                key={d}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 font-mono text-[12px] text-primary dark:bg-primary/20"
              >
                {d}
                <button
                  type="button"
                  onClick={() => removeDomain(d)}
                  aria-label={`Remove ${d}`}
                  className="rounded-full p-0.5 text-primary/70 hover:bg-primary/20 hover:text-primary"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    close
                  </span>
                </button>
              </span>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addDomain();
            }}
            className="mt-3 flex items-end gap-2"
          >
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="example.com"
              maxLength={253}
              className="flex-1 rounded border border-outline-variant bg-surface px-2 py-1.5 font-mono text-sm focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              disabled={!newDomain.trim()}
              className="rounded bg-surface-container-high px-3 py-1.5 font-display text-[12px] font-bold uppercase tracking-wider text-on-surface hover:bg-surface-container-highest disabled:opacity-50"
            >
              Add
            </button>
          </form>
        </div>
      </div>
    </Modal>
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
          <thead className="border-b border-outline-variant bg-surface-container-low font-display text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">
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
                  <span className="rounded bg-surface-container-low px-1.5 py-0.5 font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                    {p.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-[13px] text-on-surface-variant">
                  {p._count.tasks}
                </td>
                <td className="px-3 py-2">
                  <select
                    value={p.tamId}
                    onChange={(e) => handleReassign(p, Number(e.target.value))}
                    className="w-full rounded border border-outline-variant bg-surface px-2 py-1 text-[13px] text-on-surface focus:border-primary focus:outline-none"
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
        <label className="w-full md:flex-1 md:min-w-[160px]">
          <span className="mb-1 block font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
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
        <label className="w-full md:flex-[2] md:min-w-[240px]">
          <span className="mb-1 block font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
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
          className="w-full rounded bg-primary px-4 py-1.5 font-display text-xs font-bold text-on-primary hover:bg-primary-container disabled:opacity-60 md:w-auto"
        >
          {create.isPending ? "Adding…" : "Add service"}
        </button>
      </form>

      <div className="overflow-x-auto rounded border border-outline-variant bg-surface">
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
                        "rounded-full px-2 py-0.5 font-display text-[11px] font-bold uppercase tracking-wider",
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
                            className="rounded bg-primary px-2 py-1 font-display text-[11px] font-bold uppercase tracking-wider text-on-primary hover:bg-primary-container disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            disabled={update.isPending}
                            className="rounded px-2 py-1 font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant hover:bg-surface-container"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(s)}
                            className="rounded px-2 py-1 font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(s)}
                            className="rounded px-2 py-1 font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant hover:bg-error-container hover:text-on-error-container"
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
