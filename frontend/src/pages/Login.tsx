import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const DEMO_ACCOUNTS = [
  "admin@solvro.local",
  "tam.charlie@solvro.local",
  "sa.alice@solvro.local",
  "stakeholder.evan@solvro.local",
];

export function Login() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/overview";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="grid min-h-screen grid-cols-1 bg-background md:grid-cols-2">
      {/* Left brand panel */}
      <div
        className="relative hidden flex-col justify-between overflow-hidden p-10 text-white md:flex"
        style={{ background: "linear-gradient(135deg,#0058BE 0%,#0a3a8a 100%)" }}
      >
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded text-base font-extrabold" style={{ background: "rgba(255,255,255,0.15)" }}>
            S
          </div>
          <div>
            <div className="font-display text-lg font-extrabold tracking-tight">Solvro</div>
            <div className="text-xs opacity-70">Project Management Platform</div>
          </div>
        </div>

        <div className="relative z-10">
          <h1 className="mb-3 font-display text-3xl font-bold leading-tight">
            Bridge SAs and TAMs.
            <br />
            Ship projects on time.
          </h1>
          <p className="max-w-sm text-sm leading-relaxed opacity-80">
            Solution Architect blueprints flow into Solvro through a Secure Ingestion Port and become
            actionable, scheduled work for the TAM team.
          </p>
        </div>

        <div className="font-mono text-[11px] opacity-60">v1.4.0 · build 2305</div>

        {/* Decorative rings (kept subtle) */}
        <div aria-hidden className="absolute -bottom-24 -left-24 h-80 w-80 rounded-full border border-white/10" />
        <div aria-hidden className="absolute -right-24 -top-24 h-80 w-80 rounded-full border border-white/10" />
      </div>

      {/* Right form panel */}
      <div className="flex flex-col justify-center bg-surface-container-lowest px-8 py-12 md:px-16">
        {/* Mobile-only logo */}
        <div className="mb-8 flex items-center gap-3 md:hidden">
          <div className="grid h-9 w-9 place-items-center rounded bg-primary text-sm font-extrabold text-on-primary">
            S
          </div>
          <h1 className="font-display text-xl font-bold text-on-surface">Solvro</h1>
        </div>

        <h2 className="mb-1 font-display text-2xl font-bold text-on-surface">Sign in</h2>
        <p className="mb-8 text-sm text-on-surface-variant">
          Use your work email to access your projects.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              Email
            </span>
            <div className="mt-1 flex items-center gap-2 rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
              <span className="material-symbols-outlined text-base text-on-surface-variant">mail</span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="flex-1 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              Password
            </span>
            <div className="mt-1 flex items-center gap-2 rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
              <span className="material-symbols-outlined text-base text-on-surface-variant">lock</span>
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="flex-1 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="text-on-surface-variant hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-base">
                  {showPassword ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>
          </label>

          <div className="flex items-center justify-between text-xs">
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" className="accent-primary" />
              <span className="text-on-surface-variant">Remember me</span>
            </label>
            <span className="cursor-pointer text-primary hover:underline">Forgot password?</span>
          </div>

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
            className="mt-1 w-full rounded bg-primary py-2 font-display text-sm font-bold uppercase tracking-wider text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-10 border-t border-outline-variant pt-6">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
            Demo accounts
          </p>
          <div className="grid grid-cols-2 gap-2 font-mono text-[12px]">
            {DEMO_ACCOUNTS.map((acct) => (
              <button
                key={acct}
                type="button"
                onClick={() => {
                  setEmail(acct);
                  setPassword("password123");
                }}
                title="Click to autofill"
                className="truncate rounded bg-surface-container px-2 py-1.5 text-left text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
              >
                {acct}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-on-surface-variant">
            Click any account to autofill (password: <span className="font-mono">password123</span>).
          </p>
        </div>
      </div>
    </div>
  );
}
