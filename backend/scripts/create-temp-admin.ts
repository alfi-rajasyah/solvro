import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const USERNAME = "admin";
const PASSWORD = "admin";
const EMAIL = "admin@solvro.local";

async function main() {
  const adminRole = await prisma.role.findUnique({ where: { roleName: "ADMIN" } });
  if (!adminRole) {
    throw new Error("ADMIN role missing — run `npm run db:seed` first.");
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { username: USERNAME, passwordHash, roleId: adminRole.id },
    create: { username: USERNAME, email: EMAIL, passwordHash, roleId: adminRole.id },
  });

  console.warn(
    `[dev] Temporary admin set:\n  email    = ${user.email}\n  username = ${user.username}\n  password = ${PASSWORD}\nDO NOT USE IN PROD. Run \`npm run db:seed\` to revert.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
