import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useChangeMyPassword } from "@/lib/queries";
import { useTheme, type ThemeChoice } from "@/lib/theme";

export function Settings() {
  const { user } = useAuth();
  const change = useChangeMyPassword();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (currentPassword === newPassword) {
      setError("New password must differ from the current one.");
      return;
    }
    try {
      await change.mutateAsync({ currentPassword, newPassword });
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change password.");
    }
  }

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="font-display text-h1 text-on-surface">Settings</h1>
        <p className="text-sm text-on-surface-variant">
          Manage your account profile and password.
        </p>
      </header>

      <ThemeCard />

      <section className="rounded border border-outline-variant bg-surface-container-lowest p-5">
        <h2 className="mb-3 font-display text-[12px] font-bold uppercase tracking-wider text-on-surface">
          Profile
        </h2>
        <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
          <dt className="text-on-surface-variant">Username</dt>
          <dd className="font-mono text-on-surface">{user.username}</dd>

          <dt className="text-on-surface-variant">Email</dt>
          <dd className="font-mono text-on-surface">{user.email}</dd>

          <dt className="text-on-surface-variant">Role</dt>
          <dd>
            <span className="rounded bg-surface-container-low px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
              {user.role}
            </span>
          </dd>
        </dl>
        <p className="mt-3 text-[11px] text-on-surface-variant">
          Username, email, and role can only be changed by an Admin.
        </p>
      </section>

      <section className="rounded border border-outline-variant bg-surface-container-lowest p-5">
        <h2 className="mb-3 font-display text-[12px] font-bold uppercase tracking-wider text-on-surface">
          Change password
        </h2>

        {success && (
          <div className="mb-3 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Password updated.
          </div>
        )}
        {error && (
          <div className="mb-3 rounded border border-error/30 bg-error-container px-3 py-2 text-sm text-on-error-container">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Current password" required>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </Field>
          <Field label="New password" required>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              className="w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <p className="mt-1 text-[11px] text-on-surface-variant">
              At least 8 characters. Must differ from the current password.
            </p>
          </Field>
          <Field label="Confirm new password" required>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              className="w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </Field>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={change.isPending}
              className="rounded bg-primary px-4 py-1.5 font-display text-xs font-bold text-on-primary hover:bg-primary-container disabled:opacity-60"
            >
              {change.isPending ? "Saving…" : "Update password"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ThemeCard() {
  const { choice, resolved, setChoice } = useTheme();
  const options: { key: ThemeChoice; label: string; icon: string; hint: string }[] = [
    { key: "light", label: "Light", icon: "light_mode", hint: "Always light." },
    { key: "dark", label: "Dark", icon: "dark_mode", hint: "Always dark." },
    {
      key: "system",
      label: "System",
      icon: "computer",
      hint: "Follow OS preference.",
    },
  ];
  return (
    <section className="rounded border border-outline-variant bg-surface-container-lowest p-5">
      <h2 className="mb-3 font-display text-[12px] font-bold uppercase tracking-wider text-on-surface">
        Appearance
      </h2>
      <p className="mb-3 text-[12px] text-on-surface-variant">
        Currently rendering in <strong>{resolved}</strong> mode.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {options.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setChoice(opt.key)}
            className={[
              "flex flex-col items-start gap-1 rounded border p-3 text-left transition-colors",
              choice === opt.key
                ? "border-primary bg-primary/5"
                : "border-outline-variant bg-surface-container-lowest hover:border-primary/40",
            ].join(" ")}
          >
            <div className="flex items-center gap-2">
              <span
                className={[
                  "material-symbols-outlined text-[18px]",
                  choice === opt.key ? "text-primary" : "text-on-surface-variant",
                ].join(" ")}
              >
                {opt.icon}
              </span>
              <span className="font-display text-[12px] font-bold uppercase tracking-wider text-on-surface">
                {opt.label}
              </span>
            </div>
            <p className="text-[11px] text-on-surface-variant">{opt.hint}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
        {label}
        {required && <span className="ml-1 text-error">*</span>}
      </span>
      {children}
    </label>
  );
}
