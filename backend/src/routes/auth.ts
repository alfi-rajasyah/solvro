import { Router } from "express";
import bcrypt from "bcrypt";
import { type TokenPayload } from "google-auth-library";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { permissionsOf, requireAuth, signToken } from "../http/auth.js";
import { normalizeUsername } from "../lib/username.js";
import { HttpError } from "../http/errors.js";
import { validate } from "../http/validate.js";
import { getAuthConfigCached } from "../authConfig.js";
import { createRateLimiter, rateLimitKey } from "../http/rateLimit.js";

// Emails are stored lower-case (docs/archive/plans/application-review-2026-10-22.md, F-13; migration
// `lowercase_user_emails`). Normalise on the way in so `Alice@Corp.com` and
// `alice@corp.com` are one account on every sign-in path, as the Google
// path already did.
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
});

// Brute-force guard on the two sign-in routes
// (docs/archive/plans/application-review-2026-10-22.md, F-04). Only FAILED
// attempts count, so an office behind one NAT address is never locked out
// by its own successful morning sign-ins:
//  - per client address + email: 10 failures per 15 minutes — a password
//    guess against one account;
//  - per client address alone: 50 failures per 15 minutes — a credential
//    list sprayed across many accounts.
// Google sign-in counts a failed token verification against the address.
// Checked before the password is compared, so a blocked caller learns
// nothing about the credentials it sends.
export const LOGIN_FAILURE_LIMIT_PER_ACCOUNT = 10;
export const LOGIN_FAILURE_LIMIT_PER_ADDRESS = 50;
export const LOGIN_FAILURE_WINDOW_MS = 15 * 60_000;
export const loginAccountLimiter = createRateLimiter({
  limit: LOGIN_FAILURE_LIMIT_PER_ACCOUNT,
  windowMs: LOGIN_FAILURE_WINDOW_MS,
});
export const loginAddressLimiter = createRateLimiter({
  limit: LOGIN_FAILURE_LIMIT_PER_ADDRESS,
  windowMs: LOGIN_FAILURE_WINDOW_MS,
});

const tooManyAttempts = (retryAfterSec: number) => {
  const err = new HttpError(
    429,
    "rate_limited",
    "Too many failed sign-in attempts. Try again in a few minutes.",
  );
  err.retryAfterSec = retryAfterSec;
  return err;
};

function assertSignInAllowed(ip: string | undefined, email: string | null): void {
  const addressKey = rateLimitKey(ip);
  const byAddress = loginAddressLimiter.blockedFor(addressKey);
  if (byAddress > 0) throw tooManyAttempts(byAddress);
  if (email !== null) {
    const byAccount = loginAccountLimiter.blockedFor(`${addressKey}|${email}`);
    if (byAccount > 0) throw tooManyAttempts(byAccount);
  }
}

/** Records one failed attempt; throws 429 once the caller crosses a limit. */
function recordSignInFailure(ip: string | undefined, email: string | null): void {
  const addressKey = rateLimitKey(ip);
  const address = loginAddressLimiter.hit(addressKey);
  const account = email !== null ? loginAccountLimiter.hit(`${addressKey}|${email}`) : null;
  if (address.blocked) throw tooManyAttempts(address.retryAfterSec);
  if (account?.blocked) throw tooManyAttempts(account.retryAfterSec);
}

// A bcrypt hash of a throwaway string, compared against when the email is
// unknown so that path costs the same as a wrong password: the response time
// no longer says whether an account exists. Started at module load so the
// first unknown-email request does not pay for two bcrypt operations.
const dummyHash: Promise<string> = bcrypt.hash("solvro-no-such-account", 10);
function getDummyHash(): Promise<string> {
  return dummyHash;
}

const googleLoginSchema = z.object({
  idToken: z.string().min(1),
});

export const authRouter = Router();

authRouter.post("/login", validate("body", loginSchema), async (req, res) => {
  const { email, password } = req.body as z.infer<typeof loginSchema>;
  const limiterEmail = email; // already trimmed and lower-cased by loginSchema
  assertSignInAllowed(req.ip, limiterEmail);

  const user = await prisma.user.findUnique({
    where: { email },
    include: { role: true },
  });

  // Google-provisioned users have no password hash. Reject explicitly so
  // the frontend can point them at the Google button instead of letting
  // them keep retrying credentials that don't exist.
  if (user && user.passwordHash === null) {
    recordSignInFailure(req.ip, limiterEmail);
    throw new HttpError(
      401,
      "google_only",
      "This account uses Google sign-in. Please use the Google button.",
    );
  }

  // An unknown email still runs one bcrypt compare (against a fixed dummy
  // hash) so its response time matches a wrong password.
  const ok =
    user && user.passwordHash
      ? await bcrypt.compare(password, user.passwordHash)
      : (await bcrypt.compare(password, await getDummyHash()), false);
  if (!user || !ok) {
    recordSignInFailure(req.ip, limiterEmail);
    throw new HttpError(401, "invalid_credentials", "Invalid email or password");
  }
  if (!user.active) {
    throw new HttpError(403, "account_disabled", "Account has been deactivated");
  }

  const permissions = permissionsOf(user.role.permissions);
  const token = signToken({ sub: user.id, ver: user.tokenVersion });
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role.roleName,
      permissions,
    },
  });
});

// Public endpoint so the Login page can fetch the runtime Client ID without
// authenticating. The Client ID is not secret (it's embedded in any Google
// sign-in button anyway); the *secret* is on Google's side.
authRouter.get("/google/config", async (_req, res) => {
  const config = await getAuthConfigCached();
  res.json({
    clientId: config.googleClientId,
    enabled:
      config.googleClientId !== null && config.googleAllowedDomains.length > 0,
  });
});

// Google sign-in. The frontend uses Google Identity Services to obtain an
// ID token, then forwards it here. We verify it server-side (signature,
// audience, expiry), gate on email_verified + domain allowlist, find or
// create the user, mint the same {sub, role, permissions} JWT that
// /auth/login mints, and return an identical response shape.
authRouter.post("/google", validate("body", googleLoginSchema), async (req, res) => {
  const config = await getAuthConfigCached();
  if (!config.googleClient || !config.googleClientId) {
    throw new HttpError(
      503,
      "oauth_not_configured",
      "Google sign-in isn't configured yet. Ask your admin to set the Client ID in Admin > Sign-in.",
    );
  }
  if (config.googleAllowedDomains.length === 0) {
    throw new HttpError(
      503,
      "oauth_not_configured",
      "Google sign-in isn't configured yet. Ask your admin to add an allowed domain.",
    );
  }

  const { idToken } = req.body as z.infer<typeof googleLoginSchema>;
  assertSignInAllowed(req.ip, null);

  let payload: TokenPayload | undefined;
  try {
    const ticket = await config.googleClient.verifyIdToken({
      idToken,
      audience: config.googleClientId,
    });
    payload = ticket.getPayload();
  } catch {
    recordSignInFailure(req.ip, null);
    throw new HttpError(401, "invalid_token", "Google ID token verification failed");
  }
  if (!payload || !payload.email) {
    throw new HttpError(401, "invalid_token", "Google ID token missing email");
  }
  if (payload.email_verified !== true) {
    throw new HttpError(
      401,
      "email_not_verified",
      "Google email is not verified",
    );
  }

  const email = payload.email.toLowerCase();
  const emailDomain = email.includes("@") ? email.split("@")[1] : "";
  const hd = typeof payload.hd === "string" ? payload.hd.toLowerCase() : "";
  const domainOk = config.googleAllowedDomains.some(
    (d) => d === hd || d === emailDomain,
  );
  if (!domainOk) {
    throw new HttpError(
      403,
      "domain_not_allowed",
      "Your Google account isn't on the allowed domain list. Contact your admin.",
    );
  }

  const googleSub = payload.sub;
  const avatarUrl = typeof payload.picture === "string" ? payload.picture : null;

  let user = await prisma.user.findUnique({
    where: { googleSub },
    include: { role: true },
  });

  if (!user) {
    // Try linking by email — covers the seeded admin opting in to Google,
    // or an admin pre-creating a placeholder password row before the user
    // signs in for the first time.
    const byEmail = await prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });
    if (byEmail) {
      user = await prisma.user.update({
        where: { id: byEmail.id },
        data: { googleSub, avatarUrl: avatarUrl ?? byEmail.avatarUrl },
        include: { role: true },
      });
    }
  }

  if (!user) {
    // Auto-provision into PENDING. PENDING is upserted by seed by name,
    // so its ID is stable across restarts but we look it up rather than
    // hard-code an integer.
    const pendingRole = await prisma.role.findUnique({
      where: { roleName: "PENDING" },
      select: { id: true },
    });
    if (!pendingRole) {
      throw new HttpError(
        500,
        "pending_role_missing",
        "PENDING role is missing. Re-run the database seed.",
      );
    }

    // Same username rule as POST /admin/users (lib/username.ts); a local
    // part the rule rejects falls back to a neutral generated name.
    const baseUsername =
      normalizeUsername(email.split("@")[0] ?? "") ?? `user-${googleSub.slice(0, 8)}`;
    user = await createWithUniqueUsername({
      baseUsername,
      data: {
        email,
        googleSub,
        avatarUrl,
        passwordHash: null,
        roleId: pendingRole.id,
      },
    });
  }

  if (!user.active) {
    throw new HttpError(
      403,
      "account_disabled",
      "Account has been deactivated",
    );
  }

  const permissions = permissionsOf(user.role.permissions);
  const token = signToken({ sub: user.id, ver: user.tokenVersion });
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role.roleName,
      permissions,
    },
  });
});

// Two Workspace domains can share a local-part (alice@a.com + alice@b.com
// → both want username "alice"). On unique-constraint failure, retry with
// "alice-2", "alice-3", … up to a sane cap.
async function createWithUniqueUsername({
  baseUsername,
  data,
}: {
  baseUsername: string;
  data: {
    email: string;
    googleSub: string;
    avatarUrl: string | null;
    passwordHash: null;
    roleId: number;
  };
}) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const username = attempt === 0 ? baseUsername : `${baseUsername}-${attempt + 1}`;
    try {
      return await prisma.user.create({
        data: { ...data, username },
        include: { role: true },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        Array.isArray(err.meta?.target) &&
        (err.meta?.target as string[]).includes("username")
      ) {
        continue;
      }
      throw err;
    }
  }
  throw new HttpError(
    500,
    "username_exhausted",
    "Could not derive a unique username after 20 attempts.",
  );
}

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.user!.sub },
    include: { role: true },
  });
  const permissions = permissionsOf(user.role.permissions);
  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role.roleName,
    permissions,
    createdAt: user.createdAt,
  });
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(200),
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    error: "New password must differ from the current one",
    path: ["newPassword"],
  });

authRouter.post(
  "/change-password",
  requireAuth,
  validate("body", changePasswordSchema),
  async (req, res) => {
    const { currentPassword, newPassword } = req.body as z.infer<
      typeof changePasswordSchema
    >;
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.sub },
    });
    if (user.passwordHash === null) {
      throw new HttpError(
        400,
        "google_only",
        "This account signs in with Google and has no password to change.",
      );
    }
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      throw new HttpError(
        400,
        "current_password_wrong",
        "Current password is incorrect",
      );
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    // Bumping tokenVersion ends every other session of this account
    // (pentest finding M3). The caller gets a token for the new version so
    // the session that changed the password continues.
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
      select: { tokenVersion: true },
    });
    res.json({ token: signToken({ sub: user.id, ver: updated.tokenVersion }) });
  },
);

// Server-side sign-out (docs/archive/plans/application-review-2026-10-22.md, N-01).
// Bumps tokenVersion — the same revocation a password change uses — so the
// token that signed out (and every other token of this account) stops
// verifying at once instead of living out its JWT_EXPIRES_IN. Signing out
// therefore ends the session on every device. Nothing about the token is
// logged.
authRouter.post("/logout", requireAuth, async (req, res) => {
  await prisma.user.update({
    where: { id: req.user!.sub },
    data: { tokenVersion: { increment: 1 } },
    select: { id: true },
  });
  res.status(204).end();
});
