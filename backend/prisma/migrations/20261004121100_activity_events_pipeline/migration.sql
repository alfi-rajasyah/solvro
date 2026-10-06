-- AlterTable
ALTER TABLE "activity_events" ADD COLUMN     "opportunity_id" TEXT,
ALTER COLUMN "project_id" DROP NOT NULL,
ALTER COLUMN "entity_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "opportunity_activities" ADD COLUMN     "mentioned_user_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- CreateIndex
CREATE INDEX "activity_events_opportunity_id_created_at_idx" ON "activity_events"("opportunity_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Exactly one scope per event: a project's or a Pipeline deal's (hand-written,
-- Prisma cannot model CHECK constraints).
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_one_scope" CHECK (("project_id" IS NULL) <> ("opportunity_id" IS NULL));
