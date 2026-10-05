-- CreateTable
CREATE TABLE "project_members" (
    "project_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "added_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("project_id","user_id")
);

-- CreateIndex
CREATE INDEX "project_members_user_id_idx" ON "project_members"("user_id");

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill (port decision M-4, docs/archive/plans/solvro-cust-port-plan.md §10):
-- before members existed, a task could be assigned to a user who is neither
-- the project's TAM, its SA nor the owner of its customer, and that user could
-- not open the project. Grant those assignees of OPEN tasks membership so the
-- task they hold becomes reachable. Idempotent; a no-op where no such
-- assignment exists.
INSERT INTO "project_members" ("project_id", "user_id", "added_by_id", "created_at")
SELECT DISTINCT t."project_id", t."assigned_to", NULL::INTEGER, CURRENT_TIMESTAMP
FROM "tasks" t
JOIN "projects" p ON p."id" = t."project_id"
JOIN "users" u ON u."id" = t."assigned_to" AND u."active" = true
LEFT JOIN "customers" c ON c."id" = p."customer_id"
WHERE t."assigned_to" IS NOT NULL
  AND t."status" <> 'DONE'
  AND t."assigned_to" <> p."tam_id"
  AND t."assigned_to" IS DISTINCT FROM p."sa_id"
  AND t."assigned_to" IS DISTINCT FROM c."tam_id"
ON CONFLICT DO NOTHING;
