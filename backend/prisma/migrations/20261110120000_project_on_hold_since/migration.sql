-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "on_hold_since" TIMESTAMP(3);

-- Backfill: projects already on hold get their last update as the hold start.
UPDATE "projects" SET "on_hold_since" = "updated_at" WHERE "status" = 'ON_HOLD';
