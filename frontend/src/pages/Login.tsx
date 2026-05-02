import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export function Login() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/overview";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "authenticated") {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.status === 401
            ? "Invalid email or password."
            : err.message || "Sign-in failed.",
        );
      } else {
        setError("Could not reach the server. Is the backend running?");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-container-low p-6">
      <div className="w-full max-w-sm rounded-lg border border-outline-variant bg-surface-container-lowest p-8 shadow-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded bg-primary">
            <span
              className="material-symbols-outlined text-white"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              terminal
            </span>
          </div>
          <div>
            <h1 className="font-display text-h2 leading-none text-on-surface">Solvro</h1>
          </div>
        </div>

        <h2 className="mb-1 font-display text-lg font-semibold text-on-surface">Sign in</h2>
        <p className="mb-6 text-xs text-on-surface-variant">
          Use your Solvro credentials to continue.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              Email
            </span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              Password
            </span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>

          {error && (
            <div
              role="alert"
              className="rounded border border-error/30 bg-error-container px-3 py-2 text-xs text-on-error-container"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-primary px-4 py-2 font-display text-sm font-bold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

      </div>
    </div>
  );
}
