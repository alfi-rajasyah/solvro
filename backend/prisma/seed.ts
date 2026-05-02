import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// The four built-in roles. These are seeded on every container start
// (idempotent upsert). Admins can create additional custom roles at
// runtime via POST /admin/roles, but these four are protected from
// deletion because backend code references them by name.
const ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: ["*"],
  SA: ["blueprint:create", "blueprint:read", "project:read"],
  TAM: ["project:read", "project:write", "task:read", "task:write"],
  STAKEHOLDER: ["project:read", "report:read"],
};

async function main() {
  for (const roleName of Object.keys(ROLE_PERMISSIONS)) {
    await prisma.role.upsert({
      where: { roleName },
      update: { permissions: ROLE_PERMISSIONS[roleName] },
      create: { roleName, permissions: ROLE_PERMISSIONS[roleName] },
    });
  }

  const roleCount = await prisma.role.count();
  console.log(`Seed complete: ${roleCount} roles upserted.`);
  console.log(
    `(No users seeded. Run scripts/create-admin.ts with ADMIN_EMAIL and ADMIN_PASSWORD env vars to create the first admin.)`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
