-- Notes have no visibility level any more: every note is internal and no
-- note may reach an export or any customer-facing output.
ALTER TABLE "project_notes" DROP COLUMN "visibility";

DROP TYPE "NoteVisibility";
