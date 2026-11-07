-- CreateIndex
CREATE INDEX "activity_events_actor_id_idx" ON "activity_events"("actor_id");

-- CreateIndex
CREATE INDEX "project_members_added_by_id_idx" ON "project_members"("added_by_id");

-- CreateIndex
CREATE INDEX "share_links_created_by_id_idx" ON "share_links"("created_by_id");

