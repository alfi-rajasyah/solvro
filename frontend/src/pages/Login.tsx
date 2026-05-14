import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  GoogleLogin,
  GoogleOAuthProvider,
  type CredentialResponse,
} from "@react-oauth/google";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useGoogleAuthConfig } from "@/lib/queries";

function messageForApiError(err: ApiError): string {
  const code =
    typeof err.body === "object" && err.body !== null && "code" in err.body
      ? String((err.body as { code?: unknown }).code ?? "")
      : "";
  switch (code) {
    case "domain_not_allowed":
      return "Your Google account isn't on the allowed domain list. Contact your admin.";
    case "email_not_verified":
      return "Your Google account email isn't verified.";
    case "oauth_not_configured":
      return "Google sign-in isn't configured yet. Ask your admin to set up Sign-in policy.";
    case "account_disabled":
      return "This account has been deactivated. Contact your admin.";
    case "google_only":
      return "This account uses Google sign-in. Use the Google button above.";
    case "invalid_credentials":
      return "Invalid email or password.";
    case "invalid_token":
      return "Google sign-in failed. Please try again.";
    default:
      return err.message || "Sign-in failed.";
  }
}

export function Login() {
  const { status, login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/overview";

  // Runtime-fetched OAuth config — clientId comes from the DB (Admin > Sign-in),
  // not the build. `enabled` is true only when both clientId and at least one
  // allowed domain are configured.
  const { data: googleConfig, isLoading: googleConfigLoading } =
    useGoogleAuthConfig();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "authenticated") {
    return <Navigate to={from} replace />;
  }

  async function handleGoogleCredential(res: CredentialResponse) {
    if (!res.credential) {
      setError("Google sign-in did not return a credential. Please try again.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await loginWithGoogle(res.credential);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setError(messageForApiError(err));
      else setError("Could not reach the server. Is the backend running?");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setError(messageForApiError(err));
      else setError("Could not reach the server. Is the backend running?");
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
          Use your work Google account.
        </p>

        {googleConfigLoading ? (
          <div className="h-10 animate-pulse rounded bg-surface-container" />
        ) : googleConfig?.enabled && googleConfig.clientId ? (
          <GoogleOAuthProvider clientId={googleConfig.clientId}>
            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={handleGoogleCredential}
                onError={() =>
                  setError("Google sign-in failed. Please try again.")
                }
                theme="filled_blue"
                text="signin_with"
                shape="rectangular"
                width="320"
              />
            </div>
          </GoogleOAuthProvider>
        ) : (
          <div className="rounded border border-amber-400/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            Google sign-in isn't configured yet. Ask an admin to set it up in{" "}
            <span className="font-semibold">Admin → Sign-in</span>.
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-4 rounded border border-error/30 bg-error-container px-3 py-2 text-xs text-on-error-container"
          >
            {error}
          </div>
        )}

        {/* Divider */}
        <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-wider text-on-surface-variant">
          <div className="h-px flex-1 bg-outline-variant" />
          <span>or</span>
          <div className="h-px flex-1 bg-outline-variant" />
        </div>

        {/* Admin sign-in (password fallback). Collapsed by default — only the
            seeded admin and any explicitly password-provisioned account can
            use this; every other user has passwordHash NULL server-side. */}
        <details className="group rounded border border-outline-variant bg-surface-container-lowest open:bg-surface-container">
          <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-on-surface marker:hidden">
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-on-surface-variant">
                key
              </span>
              Admin sign-in (password)
            </span>
            <span className="material-symbols-outlined text-base text-on-surface-variant transition-transform group-open:rotate-180">
              expand_more
            </span>
          </summary>

          <form
            onSubmit={handlePasswordSubmit}
            className="space-y-3 border-t border-outline-variant px-3 py-3"
            noValidate
          >
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                Email
              </span>
              <div className="mt-1 flex items-center gap-2 rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                <span className="material-symbols-outlined text-base text-on-surface-variant">
                  mail
                </span>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@solvro.local"
                  className="flex-1 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                Password
              </span>
              <div className="mt-1 flex items-center gap-2 rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                <span className="material-symbols-outlined text-base text-on-surface-variant">
                  lock
                </span>
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

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 w-full rounded bg-primary py-2 font-display text-sm font-bold uppercase tracking-wider text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </details>
      </div>
    </div>
  );
}
