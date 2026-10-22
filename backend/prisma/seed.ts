import { PrismaClient, type Prisma } from "@prisma/client";
import { pathToFileURL } from "node:url";

const prisma = new PrismaClient();

// The six built-in roles. Seeded on every container start, but CREATE-ONLY
// since 2026-10-22 (docs/archive/plans/application-review-2026-10-22.md, F-02): an existing role row is never
// rewritten, so an admin's edits in Admin > Roles survive a restart or a
// redeploy. Before, the upsert carried `update: { permissions }` and silently
// reset every built-in role to these defaults on each boot. A permission that
// must reach existing installs ships as a Prisma data migration, not here.
// Admins can create additional custom roles at runtime via POST /admin/roles;
// the built-ins are protected from deletion because backend code references
// them by name.
//
// PENDING is the auto-provisioning role for first-time Google sign-ins
// (empty permissions — every screen renders a permission-denied empty
// state until the admin promotes the user from Admin > Users).
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: ["*"],
  SA: [
    "project:read",
    "pipeline:view",
    "pipeline:create",
    "pipeline:edit_own",
    "pipeline:delete_own",
  ],
  // Sales reads the pipeline and posts activity notes (the opportunity flow
  // spec's reply channel) — no write permission on the deal itself (D7,
  // 2026-09-25).
  SALES: ["pipeline:view"],
  TAM: ["project:read", "project:write", "task:read", "task:write"],
  // STAKEHOLDER reads only the projects it is attached to (TAM, SA, member
  // or customer owner). The read-everything grant (`project:view-all`) was
  // removed 2026-10-06 after the external penetration test (finding H1,
  // docs/archive/plans/pentest-remediation-2026-09.md); an admin can add it
  // back to a role in Admin > Roles — and that edit now persists.
  STAKEHOLDER: ["project:read"],
  PENDING: [],
};

/** Creates any missing built-in role and the AuthConfig singleton. Never overwrites an existing row. */
export async function runSeed(
  client: PrismaClient | Prisma.TransactionClient = prisma,
): Promise<void> {
  for (const roleName of Object.keys(ROLE_PERMISSIONS)) {
    await client.role.upsert({
      where: { roleName },
      update: {}, // never overwrite admin-edited permissions on re-seed
      create: { roleName, permissions: ROLE_PERMISSIONS[roleName] },
    });
  }

  // AuthConfig singleton — OAuth policy that the in-app admin owns.
  // Bootstrap with an empty allowed-domains list so a fresh deploy forces
  // an explicit policy decision before Google sign-in becomes usable.
  await client.authConfig.upsert({
    where: { id: "default" },
    update: {}, // never overwrite admin-edited values on re-seed
    create: { id: "default", googleAllowedDomains: [] },
  });
}

async function main() {
  await runSeed();
  const roleCount = await prisma.role.count();
  console.log(`Seed complete: ${roleCount} roles present (missing built-ins created, existing rows untouched), auth_config singleton ensured.`);
  console.log(
    `(No users seeded. Run scripts/create-admin.ts with ADMIN_EMAIL and ADMIN_PASSWORD env vars to create the first admin.)`,
  );
}

// Run only when executed directly (`prisma db seed` → `tsx prisma/seed.ts`);
// test files import `runSeed` without triggering a run.
const invokedDirectly =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
