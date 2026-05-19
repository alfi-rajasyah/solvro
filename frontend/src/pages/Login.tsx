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
    <div className="grid h-screen grid-cols-1 overflow-hidden bg-background md:grid-cols-[44%_1fr]">
      {/* Left brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#191919] p-10 md:flex">
        {/* Decorative rings */}
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-full border border-primary/[0.12]"
          style={{ width: 280, height: 280, top: -80, right: -80 }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-full border border-primary/[0.12]"
          style={{ width: 200, height: 200, bottom: -60, left: -60 }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-full border border-primary/[0.06]"
          style={{ width: 120, height: 120, bottom: 80, right: 20 }}
        />

        {/* Wordmark */}
        <div className="relative z-10 flex items-center gap-2.5">
          <div
            className="grid place-items-center bg-primary"
            style={{ width: 32, height: 32, borderRadius: 7 }}
          >
            <span style={{ color: "#191919", fontSize: 13, fontWeight: 600 }}>
              SV
            </span>
          </div>
          <span
            className="text-white"
            style={{ fontSize: 15, fontWeight: 500, letterSpacing: "-0.2px" }}
          >
            Solvro
          </span>
        </div>

        {/* Hero copy */}
        <div className="relative z-10">
          <div
            className="mb-3 font-semibold text-primary"
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            TAM Operations Platform
          </div>
          <h1
            className="text-white"
            style={{
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: "-0.4px",
              lineHeight: 1.25,
            }}
          >
            Bridge SAs and TAMs.
            <br />
            <span className="text-primary">Ship projects</span> on time.
          </h1>
          <p
            className="mt-3"
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.45)",
              maxWidth: 240,
              lineHeight: 1.6,
            }}
          >
            Solution Architect blueprints flow into Solvro through a Secure
            Ingestion Port and become actionable, scheduled work for the TAM
            team.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {["Blueprint ingestion", "Daily review", "Progress export"].map(
              (label) => (
                <span
                  key={label}
                  className="border-primary/30 text-primary/80"
                  style={{
                    fontSize: 10,
                    padding: "3px 10px",
                    borderRadius: 20,
                    borderWidth: "0.5px",
                    borderStyle: "solid",
                  }}
                >
                  {label}
                </span>
              ),
            )}
          </div>
        </div>

        {/* Footer version/build */}
        <div
          className="relative z-10"
          style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}
        >
          v1.4.0 · build 2305
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex flex-col items-center justify-center bg-surface-container-lowest px-8">
        <div className="w-full" style={{ maxWidth: 280 }}>
          {/* Mobile-only wordmark */}
          <div className="mb-8 flex items-center gap-2.5 md:hidden">
            <div
              className="grid place-items-center bg-primary"
              style={{ width: 32, height: 32, borderRadius: 7 }}
            >
              <span style={{ color: "#191919", fontSize: 13, fontWeight: 600 }}>
                SV
              </span>
            </div>
            <span
              className="text-on-surface"
              style={{ fontSize: 15, fontWeight: 500, letterSpacing: "-0.2px" }}
            >
              Solvro
            </span>
          </div>

          <h2
            className="text-on-surface"
            style={{ fontSize: 20, fontWeight: 500, letterSpacing: "-0.3px" }}
          >
            Sign in
          </h2>
          <p
            className="mb-8 mt-1 text-on-surface-variant"
            style={{ fontSize: 12 }}
          >
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
            <div
              className="flex-1 bg-outline-variant"
              style={{ height: "0.5px" }}
            />
            <span>or</span>
            <div
              className="flex-1 bg-outline-variant"
              style={{ height: "0.5px" }}
            />
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
                <div className="mt-1 flex items-center gap-2 rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 focus-within:border-[#8DC63F] focus-within:shadow-[0_0_0_3px_rgba(141,198,63,0.15)]">
                  <span className="material-symbols-outlined text-base text-on-surface-variant">
                    mail
                  </span>
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
                <div className="mt-1 flex items-center gap-2 rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 focus-within:border-[#8DC63F] focus-within:shadow-[0_0_0_3px_rgba(141,198,63,0.15)]">
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
                className="mt-1 w-full rounded bg-[#191919] py-2 font-display text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#2e2e2e] disabled:opacity-60"
              >
                {submitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </details>

          {/* Footer */}
          <p
            className="mt-6 text-center text-on-surface-variant/60"
            style={{ fontSize: 10 }}
          >
            Internal use only · Elitery © 2026
          </p>
        </div>
      </div>
    </div>
  );
}
