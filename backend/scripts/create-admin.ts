import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import {
  baseUsernameFromEmail,
  decideCreateAdmin,
  isForceFlag,
  resolveUsername,
} from "./createAdminPolicy.js";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "ADMIN_EMAIL and ADMIN_PASSWORD must be set in the environment",
    );
  }
  if (!email.includes("@")) {
    throw new Error("ADMIN_EMAIL must be a valid email address");
  }
  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters");
  }

  const adminRole = await prisma.role.findUnique({
    where: { roleName: "ADMIN" },
  });
  if (!adminRole) {
    throw new Error(
      "ADMIN role missing — `prisma db seed` must run before this script",
    );
  }

  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 10);

  // Emails are stored lower-case (migration `lowercase_user_emails`).
  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, username: true, roleId: true, role: { select: { roleName: true } } },
  });
  const action = decideCreateAdmin(
    existing === null ? null : { isAdmin: existing.roleId === adminRole.id },
    isForceFlag(process.env.FORCE_ADMIN),
  );

  if (action === "refuse") {
    throw new Error(
      `${normalizedEmail} already exists with role ${existing?.role.roleName} (username "${existing?.username}"). ` +
        "Nothing was changed. Re-run with FORCE_ADMIN=1 to promote it to ADMIN and reset its password.",
    );
  }

  if (action === "create") {
    const base = baseUsernameFromEmail(normalizedEmail);
    if (base === null) {
      throw new Error("Could not derive a valid username from ADMIN_EMAIL");
    }
    // Same case-insensitive clash rule as POST /admin/users; the email is
    // new here, so any match belongs to a different account.
    const username = await resolveUsername(base, async (candidate) => {
      const clash = await prisma.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM users WHERE lower(username) = lower(${candidate}) LIMIT 1
      `;
      return clash.length > 0;
    });
    const user = await prisma.user.create({
      data: { username, email: normalizedEmail, passwordHash, roleId: adminRole.id },
    });
    console.log(`Admin user created: ${user.email} (id=${user.id}, username=${user.username})`);
    return;
  }

  // reset-admin / promote: the row exists. Its username is left as it is.
  const user = await prisma.user.update({
    where: { email: normalizedEmail },
    // tokenVersion bump: a password reset must end sessions issued before it,
    // the same as the Admin reset route (http/auth.ts compares the claim).
    data: { passwordHash, roleId: adminRole.id, active: true, tokenVersion: { increment: 1 } },
  });
  console.log(
    action === "promote"
      ? `FORCE_ADMIN: promoted ${user.email} (id=${user.id}) to ADMIN and reset its password`
      : `Admin user already exists: ${user.email} (id=${user.id}); password reset and account re-activated`,
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
