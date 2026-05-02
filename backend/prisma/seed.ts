import { PrismaClient, RoleName } from "@prisma/client";

const prisma = new PrismaClient();

const ROLE_PERMISSIONS: Record<RoleName, string[]> = {
  ADMIN: ["*"],
  SA: ["blueprint:create", "blueprint:read", "project:read"],
  TAM: ["project:read", "project:write", "task:read", "task:write"],
  STAKEHOLDER: ["project:read", "report:read"],
};

async function main() {
  for (const roleName of Object.keys(ROLE_PERMISSIONS) as RoleName[]) {
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
