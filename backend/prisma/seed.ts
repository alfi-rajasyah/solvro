import { PrismaClient, RoleName } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const ROLE_PERMISSIONS: Record<RoleName, string[]> = {
  ADMIN: ["*"],
  SA: ["blueprint:create", "blueprint:read", "project:read"],
  TAM: ["project:read", "project:write", "task:read", "task:write"],
  STAKEHOLDER: ["project:read", "report:read"],
};

const SEED_USERS: Array<{
  username: string;
  email: string;
  role: RoleName;
}> = [
  { username: "admin",          email: "admin@solvro.local",            role: "ADMIN" },
  { username: "sa.alice",       email: "sa.alice@solvro.local",         role: "SA" },
  { username: "sa.bob",         email: "sa.bob@solvro.local",           role: "SA" },
  { username: "tam.charlie",    email: "tam.charlie@solvro.local",      role: "TAM" },
  { username: "tam.dana",       email: "tam.dana@solvro.local",         role: "TAM" },
  { username: "stakeholder.evan", email: "stakeholder.evan@solvro.local", role: "STAKEHOLDER" },
];

const DEV_PASSWORD = "password123";

async function main() {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

  const roleIds = new Map<RoleName, number>();
  for (const roleName of Object.keys(ROLE_PERMISSIONS) as RoleName[]) {
    const role = await prisma.role.upsert({
      where: { roleName },
      update: { permissions: ROLE_PERMISSIONS[roleName] },
      create: { roleName, permissions: ROLE_PERMISSIONS[roleName] },
    });
    roleIds.set(roleName, role.id);
  }

  for (const u of SEED_USERS) {
    const roleId = roleIds.get(u.role);
    if (roleId === undefined) throw new Error(`Missing role row for ${u.role}`);
    await prisma.user.upsert({
      where: { email: u.email },
      update: { username: u.username, roleId, passwordHash },
      create: { username: u.username, email: u.email, roleId, passwordHash },
    });
  }

  const roleCount = await prisma.role.count();
  const userCount = await prisma.user.count();
  console.log(`Seed complete: ${roleCount} roles, ${userCount} users.`);
  console.log(`Dev password for all seeded users: "${DEV_PASSWORD}"`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
