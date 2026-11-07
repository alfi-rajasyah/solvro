// Decision rules for scripts/create-admin.ts, kept free of Prisma and
// process state so they can be unit-tested
// (docs/archive/plans/application-review-2026-10-22.md, F-21).

// The production image ships `scripts/` and the compiled `dist/` but no
// `src/`, so this file cannot import src/lib/username.ts. It carries a copy of
// that rule instead; test/hardening.test.ts pins the two against each other.

const USERNAME_MAX = 50;
const USERNAME_RE = /^[A-Za-z0-9\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u0130\u0132-\u017F ._'-]+$/u;

/** Copy of `normalizeUsername` in src/lib/username.ts. */
export function normalizeUsername(raw: string): string | null {
  const name = raw.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (name.length === 0 || name.length > USERNAME_MAX) return null;
  if (!USERNAME_RE.test(name)) return null;
  return name;
}

export type CreateAdminAction = "create" | "reset-admin" | "promote" | "refuse";

/**
 * What to do for ADMIN_EMAIL.
 * - no row with that email: create the admin.
 * - row is already an admin: reset its password (and re-activate it).
 * - row is any other role: leave it alone and refuse, unless the operator
 *   passed FORCE_ADMIN=1, in which case promote it and reset the password.
 */
export function decideCreateAdmin(
  existing: { isAdmin: boolean } | null,
  force: boolean,
): CreateAdminAction {
  if (existing === null) return "create";
  if (existing.isAdmin) return "reset-admin";
  return force ? "promote" : "refuse";
}

/** True for FORCE_ADMIN=1 / true / yes (any case). */
export function isForceFlag(raw: string | undefined): boolean {
  return raw !== undefined && ["1", "true", "yes"].includes(raw.trim().toLowerCase());
}

/**
 * Derives the starting username from an email's local part, run through the
 * same rule POST /admin/users applies (lib/username.ts). Characters the rule
 * rejects (e.g. the "+" of a plus-address) become "-" before a second try.
 * Returns null when nothing usable is left.
 */
export function baseUsernameFromEmail(email: string): string | null {
  const local = email.trim().split("@")[0] ?? "";
  const direct = normalizeUsername(local);
  if (direct !== null) return direct;
  const cleaned = local.replace(/[^A-Za-z0-9._'-]/gu, "-").slice(0, USERNAME_MAX);
  return normalizeUsername(cleaned);
}

/**
 * Appends -2, -3, … until `isTaken` (a case-insensitive lookup, like
 * POST /admin/users) reports the candidate free. The base is trimmed so the
 * suffixed name still fits USERNAME_MAX.
 */
export async function resolveUsername(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
  maxAttempts = 50,
): Promise<string> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const suffix = attempt === 1 ? "" : `-${attempt}`;
    const candidate = base.slice(0, USERNAME_MAX - suffix.length) + suffix;
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new Error(`Could not find a free username based on "${base}" after ${maxAttempts} attempts`);
}
