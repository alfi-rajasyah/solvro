# Port spec — Activity log, in-app notifications, @mentions (CUST -> INTERNAL), with Pipeline extension

Research date 2026-10-02. Read-only. CUST = `/home/solvro-internal/solvro-cust`, INTERNAL = `/home/solvro-internal/solvro`.
Line numbers are from the working trees at research time. Items marked **[UNVERIFIED]** were not confirmed by reading code.

## 0. Source commits (CUST)

| Hash | Subject | Relevance |
|---|---|---|
| `af9a362` | Add project members | prerequisite (members arm of visibility, `lib/projectMembers.ts`) — specced by sibling agent |
| `c6f39b2` | Show project member avatars side by side | members UI |
| `2d9b0a8` | Warn before overwriting someone else's task edit | touches tasks.ts PATCH (precedes activity commit; context only) |
| **`476288e`** | **Add a project activity log, notifications and @mentions** | THE port commit: 37 files, +4878/-143 |
| `d183b57` | Record the activity and notification design and deferred findings | docs (plan/ISSUES) |
| **`ebe8953`** | Make the notification query-count test deterministic | test fix (backend/test/notifications.test.ts) |
| `eadc065` | Add read-only guest links for project timelines | adds `share_link` entity type to lib/activity.ts + activityText.ts |

Key context: CUST commit `1a3e905` ("Remove the Pipeline module and the Solution Architect project owner") means **CUST code has no `saId` arm and no Pipeline**; every visibility function ported must re-add the SA arm.

Sections: 1 behaviour · 2 schema · 3 pipeline extension · 4 visibility · 5 backend · 6 frontend · 7 tests · 8 spine/privacy/perf · 9 tasks · 10 open questions.

---

## 1. Behaviour spec (as shipped in CUST)

Authoritative contract: CUST `docs/archive/plans/collaboration-and-sharing.md` §"Phase 4 tasks and API contract" (lines 81-110) + "Phase 4 decisions" (105-110). Code verified against it.

### 1.1 Activity log (C5a)

**Write helper** — CUST `backend/src/lib/activity.ts`:
- `recordActivity(tx, { projectId, actorId, entityType, entityId, action, entityLabel?, changes? })` (L54-68). Writes ONE row through the caller's transaction. Rule: `action === "updated"` with null/empty `changes` writes nothing and returns `null` (so reorder-only writes and identical re-saves are silent). Returns the created row (fed to `notifyForEvent`).
- `ActivityEntityType = "project" | "task" | "comment" | "risk" | "note" | "member" | "share_link"` (L16-23; `share_link` added by `eadc065`). `ActivityAction = "created" | "updated" | "deleted" | "added" | "removed"` (L24).
- `shortLabel(text)` flattens whitespace and clips to 120 chars with `…` (L41-47) — used for risks (no title).
- `dayString(d)` -> `yyyy-MM-dd` via `utcMidnightOf` (L75-77) — INTERNAL `backend/src/lib/dateBoundary.ts:45` exports `utcMidnightOf` (verified).
- Diff helpers (pure): `diffTaskChanges` (L104-136), `taskCreatedChanges` (L139-143), `diffRiskChanges` (L156-165), `diffProjectChanges` (L174-180). Read DTO: `activityEventInclude` (actor id/username/avatarUrl, L187-189) and `toActivityEventDto` (L192-205).

**Event matrix (entity x verb) — every event CUST records**

| entityType | action | Where (CUST file:line) | entityId | entityLabel | changes |
|---|---|---|---|---|---|
| task | created | `routes/projects.ts:544` POST `/projects/:id/tasks` | task id | title | `taskCreatedChanges` → `{ assignee: {from:null,to:{id,username}} }` or `{}` (→ stored NULL) |
| task | created | `routes/tasks.ts:607` POST `/tasks/:id/duplicate` (one event for the copy; subtasks unlogged) | copy id | copy title | none |
| task | created | `routes/sections.ts:224` POST `/sections/:id/duplicate` (one per copied top-level task, oldest first) | copy id | copy title | none |
| task | updated | `routes/tasks.ts:384` PATCH `/tasks/:id` (`finish()` wrapper on both update branches) | task id | NEW title | `diffTaskChanges(before, after)`; reorder-only → `{}` → nothing |
| task | deleted | `routes/tasks.ts:551` DELETE `/tasks/:id` (now in a tx; 404 inside tx) | task id | title | none |
| comment | created | `routes/tasks.ts:670` POST `/tasks/:id/comments` | comment id | task title | `{ taskId }` (never body, never mention ids) |
| risk | created | `routes/projects.ts:728` POST `/projects/:id/risks` | risk id | `shortLabel(description)` | none |
| risk | updated | `routes/risks.ts:51` PATCH `/risks/:id` (row lock `FOR NO KEY UPDATE`, before-read) | risk id | shortLabel(new description) | `diffRiskChanges` |
| risk | deleted | `routes/risks.ts:81` DELETE `/risks/:id` | risk id | shortLabel(description) | none |
| note | created | `routes/projects.ts:836` POST `/projects/:id/notes` | note id | **null** | `{ visibility }` |
| note | updated | `routes/projects.ts:876` PATCH `/projects/:id/notes/:noteId` — only when body actually changed | note id | null | `{ visibility }` (bare value, not from/to) |
| note | deleted | `routes/projects.ts:913` DELETE `/projects/:id/notes/:noteId` | note id | null | `{ visibility }` |
| member | added | `routes/projectMembers.ts:133` POST `/projects/:id/members` (only when `createMany` count===1) | user id | username | none |
| member | added | auto-add on assignment: `routes/tasks.ts:445` (PATCH) and `routes/projects.ts:495` (task create) when `ensureAssigneeIsMember` returns non-null | user id | username | none |
| member | removed | `routes/projectMembers.ts:190` DELETE `/projects/:id/members/:userId` (count>0) | user id | username | `{ unassignedTasks: n }` when n>0 else null |
| project | updated | `routes/projects.ts:400` PATCH `/projects/:id` (row lock, before-read of name/status/customerId) | project id | new name | `diffProjectChanges` — name/status/customerId only |
| share_link | created | `routes/shareLinks.ts:80` (eadc065) | link id | link label | none (never token) |
| share_link | removed | `routes/shareLinks.ts:141` (eadc065) — only on actual revoke | link id | link label | none |

**NOT logged in CUST** (verified by grep, §0 of route list): project create (POST `/projects`), project delete (cascades all events away anyway), baseline lock/clear, services, sections create/rename/delete/reorder, epics CRUD, labels, dependencies, project reviews, comment edit/delete (no such routes exist), admin TAM reassignment (`PUT /admin/projects/reassign`) and TAM change via project PATCH (deferred, CUST `docs/ISSUES.md:2276`). `activityText.ts` nonetheless renders `project created/deleted`, `comment updated/deleted` defensively.

**Diff payload shape** (`changes` JSONB):
- Scalars: `{ <field>: { from, to } }` for task `title,status,priority,isMilestone,isCriticalPath,sectionId,epicId,parentTaskId,itopTicketRef` (L106-119), risk `category,probability,impact,status`, project `name,status,customerId`.
- Dates: `startDate`/`dueDate` compared and stored as `yyyy-MM-dd` strings (L120-124).
- Long text: task `description`, risk `description/mitigationPlan/contingencyPlan` → `{ changed: true }` only.
- Assignee: `{ assignee: { from: {id,username}|null, to: {id,username}|null } }` (L126-129). This is also what `notifyForEvent` reads (`changes.assignee.to.id`).
- Labels: `{ labels: { added: [names], removed: [names] } }` (L130-134).
- Position never compared (reorder-only → `{}` → no row).

**Privacy rules** (CUST `lib/activity.ts:8-12`, schema comment): `changes` holds short scalar diffs only; never note body, comment body, or description text. Note events carry id + visibility only (`entityLabel` null). Comment events carry the task title + `{ taskId }`. Risk label is up to 120 chars of description (accepted by decision: "Risks are internal… nothing exports the feed. The guest view must never expose the activity feed"). Share-link events never carry the token.

**Atomicity**: every call is inside the write's own `prisma.$transaction`; several INTERNAL writes that are currently bare `prisma.x.create/update/delete` must be wrapped (see §5).

**Read API** — CUST `backend/src/routes/activity.ts` (53 lines): `GET /projects/:id/activity` — `requireAuth` + `requirePermission("project:read")` + `ensureProjectVisible` (404). Query: `limit` 1..100 default 50, `before` (event id cursor), `actorId`. Order `id desc`; fetch `limit+1`; response `{ events: ActivityEventDto[], nextBefore: number|null }` where `ActivityEventDto = { id, entityType, entityId, action, entityLabel, changes, createdAt, actor: {id,username,avatarUrl}|null }`. Mounted `app.use("/projects", activityRouter)` after projectsRouter.

**Retention** — CUST `backend/src/lib/activityCleanup.ts`: `ACTIVITY_RETENTION_DAYS = 180`; `deleteExpiredActivityEvents(now)` deletes `createdAt < now-180d` (one `deleteMany`); in-process timer, first run 60 s after boot then every 24 h, `unref`'d, no-op under `NODE_ENV=test`; errors logged at warn and the next run is still scheduled. Started in `index.ts` listen callback, stopped in `shutdown()`. Notifications cascade (FK `ON DELETE CASCADE` from `activity_events`) — so cleanup also removes notifications older than 180 days (by event age).
INTERNAL note: INTERNAL has no `lib/itop/scheduler.ts` yet (iTop port is separate), so `activityCleanup.ts` is the first in-process job in INTERNAL `index.ts` (INTERNAL `backend/src/index.ts:8-19`). Multi-replica deploys would run it once per replica — harmless (idempotent `deleteMany`).

**ProjectActivity UI** — CUST `frontend/src/components/ProjectActivity.tsx` (205 lines), mounted at the bottom of `pages/views/ProjectOverview.tsx` (`<ProjectActivity projectId tam taskIds />`, `taskIds` = Set of current task ids so deleted tasks are never linked).
- `useProjectActivity(projectId, { actorId })` = `useInfiniteQuery`, page size `ACTIVITY_PAGE_SIZE = 20`, cursor `before = nextBefore`, `ACTIVITY_MAX_PAGES = 5` (hard cap: 100 events; "Showing the latest N events." footer) — deliberately not React Query `maxPages` (would evict newest page). Uses `useLiveRefresh()` (30 s + focus refetch; CUST commit `25dbeec`, NOT in INTERNAL).
- Query key `["projects", id, "activity", actorId ?? "all"]`; `invalidateProjectActivity(qc, projectId)` predicate-invalidates all actor filters; called from every recorded mutation's onSuccess/onSettled (create/update/delete/duplicate task, duplicate section, risk CRUD, note CRUD, add comment, update project, member add/remove).
- Actor filter: Base-UI `Select` with "Everyone", the TAM, and `useProjectMembers` (members). **INTERNAL must add the SA** (and probably the customer owner) — fe-pages.md 2.7 flags the same.
- States: 4-row pulse skeleton; error with "Try again"; empty state (`history` icon, "No activity yet", copy differs when filtered); rows = avatar (or `person` glyph for a deleted actor), sentence parts (actor bold, first entity linked to `?task=<id>` when it still exists), `<time>` with `fmtAgo` and `fmtDateTime` title; "Load more" button.
- Text: `frontend/src/lib/activityText.ts` (439 lines) — `describeActivity(event) → { parts: {kind:"actor"|"text"|"entity",text}[], text, taskId }`, pure, total (try/catch → "made a change"), defensive JSON reads; per-entity phrasing (task created "…, assigned to X"; single-field task sentences: rename, (re/un)assign, milestone, critical path, set/clear date, labels; ≤3 fields → clause list; >3 → "updated N fields of X"; risk single-field; note "added an internal note" / "changed a note from internal to customer-facing"; member added/removed "(unassigned N tasks)"; share_link created/revoked; project rename/status/customer). `eventTaskId` links task events (not deleted) and comment events via `changes.taskId`. Depends on `@/lib/formatDate#fmtDay` and `@/lib/labels` (PRIORITY_LABEL, PROJECT_STATUS_LABEL, RISK_CATEGORY_LABEL, RISK_STATUS_LABEL, TASK_STATUS_LABEL) — **both files are absent in INTERNAL** (CUST `489b0a4` UI pass).

### 1.2 Notifications (C5b)

CUST `backend/src/lib/notifications.ts` (120 lines):
- **Reasons**: `assigned` (task created/updated whose `changes.assignee.to.id` is set — L365-367), `commented` (comment created on a task with an assignee → `opts.taskAssigneeId`, L368-370), `mentioned` (`opts.mentionedUserIds`, L364).
- **Precedence / dedupe**: one notification per user per event; mentions applied first, then assigned, then commented (`reasons` Map, first writer wins, L358-362). A mentioned assignee gets `mentioned` only.
- **Self rule**: never the actor (`userId === event.actorId` skipped, L360). Self-mentions are stored on the comment but never notified.
- **Eligibility**: `filterActiveUsersWhoCanSeeProject(tx, projectId, ids)` (L303-340): one `user.findMany({id in ids, active:true})` with role.permissions + one `project.findUnique` selecting `tamId`, `customer.tamId`, `members where userId in ids`; then pure `canUserSeeProject` per user. Fixed statement count regardless of N (test asserts ≤ 8 statements and equal for 1 vs 20).
- **Writes**: `notification.createMany` in the same tx as the event (L379). `notifyForEvent(tx, null)` → 0 (safe to pass recordActivity's null).
- Only call sites: task create (`projects.ts:553`), task PATCH (`tasks.ts:395`), comment create (`tasks.ts:681`). Duplicates, risks, notes, members, project updates never notify.
- **Concurrency**: the task PATCH row lock (`SELECT … FOR NO KEY UPDATE`) makes two identical concurrent assigns produce one change → one notification (tested).

CUST `backend/src/routes/notifications.ts` (95 lines), mounted `app.use("/notifications", notificationsRouter)`, `requireAuth` only (no permission):
- `visibleOwn(user) = { userId: user.sub, activityEvent: { project: projectVisibilityFilter(user) } }` — a notification for a project the caller can no longer see is hidden from list AND count (rows remain).
- `GET /notifications?limit=1..100 (default 30)&before=<id>` → `{ notifications: [{ id, reason, readAt, createdAt, event: ActivityEventDto, projectId, projectName }], nextBefore }`, order id desc.
- `GET /notifications/unread-count` → `{ count }` (visibleOwn + readAt null).
- `POST /notifications/read-all` → `{ updated }` — **not** visibility-filtered (marks hidden rows read too; harmless).
- `POST /notifications/:id/read` → `{ id, readAt }`; another user's/missing row = 404; idempotent (keeps original readAt).
- Cleanup: no separate job — cascade from the 180-day event cleanup.

**Bell UI** — CUST `frontend/src/components/layout/NotificationBell.tsx` (206 lines), inserted in `TopBar.tsx` right after the Help link (CUST TopBar L156) — INTERNAL has no Help link yet (Help port is a sibling spec); place before the theme toggle.
- Trigger: `notifications` glyph, `aria-label="Notifications, N unread"`, `data-testid="notifications-button"`; badge `bg-primary text-on-primary text-meta`, `99+` cap, `data-testid="notifications-badge"`.
- Popover: `positionerClassName="z-101"` (frontend convention), `shadow-overlay!`, width `min(24rem, 100vw-1rem)`; list mounted only while open (so `useNotifications` only fetches when open).
- Header "Notifications" + "Mark all as read" (disabled at 0 unread). Rows: avatar, `describeNotification` sentence (bold when unread, sr-only "Unread:"), project name · `fmtAgo`, unread dot; `data-testid="notification-item"`, `data-unread`.
- Click: optimistic mark-read (if unread), close popover, `navigate(notificationHref(n))` → `/projects/:projectId?task=:taskId` (task id from `eventTaskId`: task events by entityId, comment events via `changes.taskId`) else `/projects/:projectId`.
- Empty: "You're all caught up". Error: "Could not load notifications" + Try again. "Load more" (page size 30, unbounded).
- **Polling**: `useUnreadNotificationCount` — `staleTime 0`, `refetchInterval 60_000`, `refetchIntervalInBackground: false`, `refetchOnWindowFocus: true`. The list itself is not polled (staleTime 0, refetched on open).
- Text: `frontend/src/lib/notificationText.ts` — "rina assigned you <Task>", "commented on <Task>", "mentioned you on <Task>"; unknown reason or no label → falls back to `describeActivity`.

### 1.3 @mentions (C5c)

- **Syntax**: literal `@username` of a KNOWN user (usernames are free text ≤ 50 chars, may contain spaces/dots). No generic `@word` regex. Longest-name-first matching; token boundaries via `WORD_BEFORE=/[\p{L}\p{N}_.-]/u` and `NAME_CHAR=/[\p{L}\p{N}_-]/u` (trailing `.` allowed at sentence end). Case-sensitive (`frontend/src/lib/mentions.ts`).
- **Autocomplete**: `CommentComposer` in `frontend/src/components/CommentMentions.tsx` — single-line `<input role="combobox">` (ARIA combobox: `aria-controls`, `aria-activedescendant`, listbox `role="listbox"` above the input, `shadow-overlay`). `activeMentionQuery(text, caret)`: `@` must start text or follow whitespace, no whitespace between `@` and caret. `filterMentionCandidates`: prefix matches then contains, case-insensitive, max 6. Keys: ArrowUp/Down cycle, Enter/Tab pick, Escape closes picker only (stopPropagation so the TaskPanel stays open; re-armed when the `@` query changes); IME-composition guarded; mouse uses `onMouseDown` + preventDefault to keep focus.
- **Candidate source**: `PanelComments` in `TaskPanel.tsx` builds `people` = project TAM (`useProject`) + `useProjectMembers` (deduped by id). INTERNAL should add the project's SA (and consider customer owner) — they can see the project via `saId`/`customer.tamId` arms, so the server would accept them.
- **Ids sent**: `deriveMentionedIds(body, recorded)` — only picks whose `@username` text still exists in the body (deleting the text drops the id; hand-typed names without picking add nothing), dedupe, cap 20.
- **Storage**: `POST /tasks/:id/comments` body gains `mentionedUserIds?: number[]` (zod: positive ints, max 20, deduped via transform). Server keeps only ids returned by `filterActiveUsersWhoCanSeeProject` (unknown/inactive/hidden dropped silently; self-mention kept), stores in `comments.mentioned_user_ids INTEGER[] DEFAULT '{}'`, returns them in the comment response (and in `GET /tasks/:id/comments`, implicit since the column is on the row).
- **Rendering**: `CommentBody` — `splitComment(body, mentionedUserIds, users)` turns only tokens of users whose id is in the stored list into chips (`bg-primary/10 text-primary font-semibold`, `data-testid="mention-chip"`); React text nodes only (no HTML injection). Known limitation (CUST ISSUES:2273): chips resolve only against current TAM+members, so a removed member / view-all user renders as plain text.
- **Edit/delete**: comments have no edit or delete route in either repo → nothing to handle. Mentions are immutable once posted; deleting the task cascades comments, notifications survive (they hang off the event) and link to a now-missing task (panel shows not-found; `notificationHref` still points at `?task=`). [Behaviour of TaskPanel with a deleted task id: UNVERIFIED.]

---

## 2. Schema

### 2.1 CUST models (verbatim, CUST `backend/prisma/schema.prisma`)

```prisma
// CUST schema.prisma:251-268
model ActivityEvent {
  id            Int            @id @default(autoincrement())
  projectId     Int            @map("project_id")
  project       Project        @relation(fields: [projectId], references: [id], onDelete: Cascade)
  actorId       Int?           @map("actor_id")
  actor         User?          @relation(fields: [actorId], references: [id], onDelete: SetNull)
  entityType    String         @map("entity_type")
  entityId      Int            @map("entity_id")
  action        String
  entityLabel   String?        @map("entity_label")
  changes       Json?          @db.JsonB
  createdAt     DateTime       @default(now()) @map("created_at")
  notifications Notification[]

  @@index([projectId, createdAt(sort: Desc)])
  @@index([createdAt])
  @@map("activity_events")
}

// CUST schema.prisma:275-288
model Notification {
  id              Int           @id @default(autoincrement())
  userId          Int           @map("user_id")
  user            User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  activityEventId Int           @map("activity_event_id")
  activityEvent   ActivityEvent @relation(fields: [activityEventId], references: [id], onDelete: Cascade)
  reason          String
  readAt          DateTime?     @map("read_at")
  createdAt       DateTime      @default(now()) @map("created_at")

  @@index([userId, readAt, createdAt(sort: Desc)])
  @@index([activityEventId])
  @@map("notifications")
}

// CUST schema.prisma:513-528 (Comment) — new field only:
  mentionedUserIds Int[] @default([]) @map("mentioned_user_ids")
```
Back-relations CUST adds (not shown above, required): `User.activityEvents ActivityEvent[]`, `User.notifications Notification[]`, `Project.activityEvents ActivityEvent[]` (verified: CUST schema.prisma:125, :127 on User; :216 on Project).

CUST migration SQL:
- `20260930120000_activity_events/migration.sql`: CREATE TABLE activity_events (id SERIAL PK, project_id INT NOT NULL, actor_id INT, entity_type TEXT NOT NULL, entity_id INT NOT NULL, action TEXT NOT NULL, entity_label TEXT, changes JSONB, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP); indexes `activity_events_project_id_created_at_idx (project_id, created_at DESC)`, `activity_events_created_at_idx (created_at)`; FK project → projects ON DELETE CASCADE; FK actor → users ON DELETE SET NULL.
- `20260930130000_notifications/migration.sql`: CREATE TABLE notifications (id SERIAL PK, user_id INT NOT NULL, activity_event_id INT NOT NULL, reason TEXT NOT NULL, read_at TIMESTAMP(3), created_at …); indexes `(user_id, read_at, created_at DESC)`, `(activity_event_id)`; FKs to users and activity_events, both ON DELETE CASCADE.
- `20260930140000_comment_mentions/migration.sql`: `ALTER TABLE "comments" ADD COLUMN "mentioned_user_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[];` (note: nullable column with default — Prisma `Int[]` is a non-null list in TS but the SQL column has no NOT NULL; harmless.)

### 2.2 INTERNAL fresh migrations (proposed)

INTERNAL latest migration: `20260925140000_opportunity_flow_redesign`. Members/share-links/epics/iTop ports add their own migrations; timestamps below are placeholders — generate with `prisma migrate dev --name` (or the `migrate diff` fallback in `backend/CLAUDE.md`), never copy CUST timestamps (they would sort before INTERNAL's own unrelated future migrations only if those are later; keep a single monotonic sequence on develop).

**Migration A — `<ts>_activity_events`** (recommended shape includes the Pipeline extension from day one, see §3; do NOT ship CUST's NOT NULL project_id then alter it):
```prisma
model ActivityEvent {
  id            Int            @id @default(autoincrement())
  // Exactly one scope is set (CHECK constraint in SQL): a project event or an
  // opportunity (Pipeline deal) event.
  projectId     Int?           @map("project_id")
  project       Project?       @relation(fields: [projectId], references: [id], onDelete: Cascade)
  opportunityId String?        @map("opportunity_id")   // TEXT, matching opportunities.id (TEXT, migration 20260814125632_pipeline_models:9)
  opportunity   Opportunity?   @relation(fields: [opportunityId], references: [id], onDelete: Cascade)
  actorId       Int?           @map("actor_id")
  actor         User?          @relation(fields: [actorId], references: [id], onDelete: SetNull)
  entityType    String         @map("entity_type")
  // Int ids only (task, comment, risk, note, member user id, share link).
  // Null for Pipeline entities, whose ids are UUIDs: the opportunity is
  // `opportunityId`; a link/note id, when needed, rides in `changes`.
  entityId      Int?           @map("entity_id")
  action        String
  entityLabel   String?        @map("entity_label")
  changes       Json?          @db.JsonB
  createdAt     DateTime       @default(now()) @map("created_at")
  notifications Notification[]

  @@index([projectId, createdAt(sort: Desc)])
  @@index([opportunityId, createdAt(sort: Desc)])
  @@index([createdAt])
  @@map("activity_events")
}
```
Hand-added SQL line in the same migration (Prisma cannot express it):
```sql
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_one_scope"
  CHECK (("project_id" IS NULL) <> ("opportunity_id" IS NULL));
```
(Prisma ignores unknown CHECK constraints in later `migrate diff` runs — verified behaviour of Prisma 5/6 for CHECKs is "not introspected, not dropped" [UNVERIFIED for the exact INTERNAL Prisma version; confirm with one follow-up `migrate dev` producing an empty diff].)
Back-relations: `Project.activityEvents ActivityEvent[]`, `Opportunity.activityEvents ActivityEvent[]`, `User.activityEvents ActivityEvent[]`.

If the user rejects the Pipeline extension, ship CUST's model verbatim (projectId NOT NULL, entityId NOT NULL).

**Migration B — `<ts>_notifications`**: CUST model verbatim + `User.notifications Notification[]`. Reasons stay a TEXT column (new Pipeline reasons need no migration).

**Migration C — `<ts>_comment_mentions`**: CUST SQL verbatim; `Comment.mentionedUserIds Int[] @default([]) @map("mentioned_user_ids")`.

A, B and C can be one migration if they ship in one PR (CUST used three because the three commits were separate waves on one branch). Recommendation: three migrations, one per task commit, same PR — keeps each commit self-contained and matches CUST provenance.

`schema.prisma` + migrations are spine — instant opus review per CLAUDE.md.

---

## 3. Pipeline extension design (required)

### 3.1 What INTERNAL's `OpportunityActivity` is

Model: INTERNAL `backend/prisma/schema.prisma:647-661` — `{ id uuid, opportunityId (FK cascade), userId Int? (SetNull), note String, createdAt }`, index `(opportunity_id)`. Free text only; no type/action/diff columns.

It is a **hybrid, permanent deal timeline**: user-entered notes AND system-generated sentences, mixed in one list, rendered verbatim.

Writers (all inside the write's transaction):

| # | INTERNAL file:line | Route | Text written | Kind |
|---|---|---|---|---|
| W1 | `routes/opportunityItems.ts:97` | `POST /opportunities/:id/activities` (`pipeline:view` — any viewer incl. SALES; also bumps `lastActivityAt`) | user's note (≤2000 chars) | **user note** (SALES "reply channel", seed.ts:22-24) |
| W2 | `routes/opportunities.ts:630` | `POST /opportunities/import` (per row, optional `activityLog` seed) | row's `activityLog` text | user-supplied (import) |
| W3 | `routes/opportunities.ts:767` | `PATCH /opportunities/:id` — only subStatus/statusTag transitions | "Waiting for Sales input" / "Input received" / "Hold released" / "Delay cleared" / "Put on hold" / "Marked as delayed" | system |
| W4 | `routes/opportunities.ts:854` | `POST /:id/move` — real stage change only | "Moved from X to Y" or "Moved from Technical Clarification to RFP, PoC skipped: <reason>" | system (embeds free-text reason) |
| W5 | `routes/opportunities.ts:932` | `POST /:id/close` | "Closed as Won" / "Closed as Lost (<category>)[: <reason>]" | system (embeds free-text reason) |
| W6 | `routes/opportunities.ts:979` | `POST /:id/reopen` | "Reopened" | system |
| W7 | `routes/opportunities.ts:1044` | `POST /:id/assign` — real PIC change only | "Assigned to <username>" | system |
| W8 | `routes/opportunities.ts:1177` | `POST /:id/handoff` | `Handed off to project "<name>"` | system |

Silent today (no OpportunityActivity row): `POST /opportunities` create (`opportunities.ts:431-496`), plain PATCH field edits incl. **PIC change via PATCH** (`opportunities.ts:713-715`, only `/assign` logs PIC), `DELETE /:id` (`:1065-1076`, cascades the timeline away), link create/patch/delete (`opportunityItems.ts:129-191`, bump `lastActivityAt` only), import-run itself (logged in `PipelineImportLog`).

Readers:
- `routes/opportunityItems.ts:63-79` `GET /opportunities/:id/activities` (`pipeline:view`, newest first, includes `user` via `PIC_SELECT`).
- `backend/scripts/import-velora.ts` (one-time Velora import copies `activity_logs` verbatim — so the table holds **historical Velora history that predates Solvro**).
- `migrations/20260925140000_opportunity_flow_redesign/migration.sql:55-76` read it to back-fill (`last_move`).
- Frontend: `lib/queries.ts:2454` type, `:2486` `pipelineKeys.activities`, `:2512` query, `:2682` `useAddOpportunityActivity`, invalidated by 7 mutations (`:2584, 2607, 2639, 2657, 2676, 2691, 2901`). `pages/OpportunityDetail.tsx:853-963` `ActivitySection` (reui `Timeline`, avatar, username, `relativeTime`, note text, "Add note" composer); `:191-199` `closedByUsername` parses the `"Closed as "` prefix for the header caption. `components/pipeline/*` do not read activities (verified grep).
- Tests asserting exact note strings: `backend/test/opportunities.test.ts`, `opportunityClose.test.ts`, `opportunityHandoff.test.ts`, `opportunityImport.test.ts`, `opportunityItems.test.ts`.

Pipeline visibility rule — INTERNAL `backend/src/lib/pipelineAccess.ts` (quoted):
- Reads are **global** for `pipeline:view` holders: every GET route uses only `requirePermission("pipeline:view")` (`opportunities.ts:385, 407, 416`; `opportunityItems.ts:63, 111`); there is no per-deal read filter. (CHANGELOG: "Deal visibility is global for `pipeline:view` holders; ownership gates writes only.")
- `assertCanWriteOpportunity(user, action, {picId})` (L23-35): passes with `pipeline:{action}_all` (or `*`), or `pipeline:{action}_own` AND `opportunity.picId === user.sub`; else 403.
- `assertCanAssignOpportunity(user, {picId})` (L51-62): `pipeline:edit_all` always; `pipeline:edit_own` only when `picId === null`.
- `ensureOpportunityEditable(user, id)` (L73-84): 404 then edit gate.
- Roles (seed.ts:13-28): SA = project:read + pipeline view/create/edit_own/delete_own; SALES = pipeline:view only; TAM = project/task read+write (no pipeline); STAKEHOLDER = project:read + view-all; ADMIN `*`.

### 3.2 Options

**(a) ActivityEvent with nullable projectId + opportunityId; replace OpportunityActivity's system sentences**
- Schema: §2.2 Migration A (CHECK one scope, `entityId` nullable). New entity types `opportunity` (actions `created|updated|deleted|moved|closed|reopened|assigned|handed_off`), `opportunity_link` (`added|updated|removed`), `opportunity_note` (`created`).
- W3-W8 stop writing OpportunityActivity; write `recordActivity` instead. OpportunityDetail's timeline becomes a merged render of OpportunityActivity (user notes + legacy/Velora system text) and ActivityEvent rows (via an `opportunity` branch in `activityText.ts`).
- Cons: 180-day retention would silently erase deal history that today is permanent (so the cleanup must exempt opportunity rows → notifications then need their own cleanup); `closedByUsername` and ~5 backend test files that assert exact note strings must be rewritten; the free-text skip/close reasons would have to move into `changes` (breaks the "no free text in changes" rule) or be dropped; two sources merged client-side with different id types (uuid vs int) and orderings. Largest churn on a module that works.

**(b) Keep OpportunityActivity as the log; add system entries for the silent cases; notifications point at it**
- Schema: add `kind TEXT` (`note|system`) and maybe `action`/`changes` to `opportunity_activities`; `Notification.activityEventId` becomes nullable + new `opportunityActivityId String?` (XOR CHECK).
- Cons: Notification becomes polymorphic (two FKs, two DTO shapes, two text renderers, two visibility joins in `visibleOwn`); notification retention no longer comes free from the event cascade (OpportunityActivity is permanent) → a second cleanup; "assigned you the deal X" must be reconstructed from free text or new columns. Pipeline changes stay invisible to the unified log, which contradicts the user decision ("EXTEND it to Pipeline changes").

**(c) Both — dual-write through one helper (RECOMMENDED)**
- OpportunityActivity stays exactly what it is: the deal's permanent, human-readable timeline (user notes + existing system sentences; Velora history intact; tests and `closedByUsername` untouched).
- ActivityEvent (opportunity-scoped, §2.2 Migration A) is added alongside as the **structured** record: diff payloads, actor, 180-day retention, and the single anchor for notifications (Notification keeps ONE FK, one DTO, one cleanup path — exactly CUST's design).
- One helper owns both writes so they cannot drift: `recordOpportunityChange(tx, { opportunityId, actorId, action, entityLabel, changes, note? })` in new `backend/src/lib/opportunityActivity.ts` → writes the OpportunityActivity sentence when `note` is given, then `recordActivity(tx, { opportunityId, … })`, returns the event for `notifyForEvent`.
- Display: OpportunityDetail keeps its Activity timeline unchanged (it already shows the system sentences); fill the currently-silent cases by adding sentences only where the user wants them (decision D-P3). Structured events surface in (1) the notification bell, (2) the handed-off project's "Recent activity" (a project-scoped event written by the handoff), and (3) optionally a later "Pipeline activity" feed (`GET /opportunities/activity`, pipeline:view) — not in this phase.
- Cost: one extra INSERT per pipeline write (trivial; all writers are already in a transaction).

### 3.3 Recommended design (c) in detail

**Event matrix for Pipeline** (all `opportunityId`-scoped, `projectId` null, `entityId` null, `entityLabel` = deal title at write time):

| Change | INTERNAL call site (insert inside existing tx) | action | changes (no free text) | OpportunityActivity sentence | Notify |
|---|---|---|---|---|---|
| Create | `opportunities.ts:487-493` (wrap: tx already exists; add after `tx.opportunity.create`) | `created` | `{ stage, pic: {id,username}|null, dealValue: number }` | none today → D-P3 ("Created") | PIC if set and ≠ actor → `assigned` (D-P1) |
| Import row | `opportunities.ts:620-635` (per-row tx) | `created` | `{ stage, source: "import" }` | unchanged (`activityLog` seed) | **none** (bulk noise; D-P2) |
| Field edit (PATCH) | `opportunities.ts:762-770` — needs a before-snapshot: `current` from `findOpportunityOr404` (`:319-323`, full row, no `pic` include, read OUTSIDE the tx) has every scalar but not the old PIC's username — re-read the row inside the tx under `SELECT … FOR NO KEY UPDATE` with `include: { pic: { select: PIC_SELECT } }` (CUST's pattern for tasks/risks/projects) so the diff and the notification are computed from the row this write replaced | `updated` | `diffOpportunityChanges(current, result)`: `title, customerName, dealValue(Number), deadline/requestDate (dayString), productSolution, leadSource, winProbability, subStatus, statusTag` as `{from,to}`; `description` → `{changed:true}`; `pic` → `{from:{id,username}|null,to:…}` | W3 sentences unchanged; PIC-via-PATCH silent → D-P3 | `pic.to` ≠ actor → `assigned` |
| Stage move | `opportunities.ts:851-857` (only when `!sameStage`) | `moved` | `{ stage: {from,to}, pocSkipped?: true }` (skip reason text stays only in the OpportunityActivity sentence) | W4 unchanged | PIC if actor ≠ PIC → `deal_updated` (D-P1, default OFF) |
| Close | `opportunities.ts:921-936` | `closed` | `{ outcome, reasonCategory|null, reason: {changed:true}? }` | W5 unchanged | PIC if actor ≠ PIC → `deal_closed` (D-P1, default ON) |
| Reopen | `opportunities.ts:970-982` | `reopened` | `{ outcome: {from, to:null} }` | W6 unchanged | none (D-P1) |
| Assign / claim | `opportunities.ts:1037-1052` | `assigned` | `{ pic: {from:{id,username}|null, to:{id,username}} }` | W7 unchanged | new PIC ≠ actor → `assigned` (a self-claim notifies nobody) |
| Handoff | `opportunities.ts:1176-1183` | `handed_off` | `{ project: { id, name } }` | W8 unchanged | — (see project event) |
| Handoff — project side | same tx, after `tx.project.create` (`:1144-1155`) | project-scoped `entityType:"project", action:"created"` | `{ fromOpportunity: { id, title }, tam: {id,username}, sa: {id,username}|null }` | — | TAM ≠ actor → `assigned` (reason text "made you TAM of …"); SA ≠ actor → `assigned` (D-P4) |
| Note added | `opportunityItems.ts:96-105` | `noted` (entity `opportunity_note`) | `{ activityId }` (uuid; never the note text) | W1 unchanged (it IS the note) | PIC ≠ actor → `commented` (D-P1, default ON — this is the SALES reply channel) |
| Link add/edit/remove | `opportunityItems.ts:140-145`, `:163-167`, `:186-189` | `link_added|link_updated|link_removed` (entity `opportunity_link`) | `{ linkId, label }` (label is short, user-entered; URL never stored) — or omit label (D-P5) | none (D-P3) | none |
| Delete | `opportunities.ts:1069-1074` | **not recorded** — FK cascade deletes the deal's events and their notifications, same as CUST's project delete | — | timeline cascades too | none |

Rules carried over from CUST: `recordActivity` returns null for an `updated` with empty diff (a no-op PATCH writes nothing); never the actor; recipients filtered to active users who can see the deal; one notification per user per event.

**BigInt trap**: `dealValue` is `BigInt` (schema:589). `Prisma.InputJsonValue` cannot hold a BigInt — convert with `Number()` before putting it in `changes` (the serializer already does this for responses; reuse the same conversion). A test must cover a dealValue edit.

**Visibility of opportunity events**
- Feed/notification read: `hasPermission(user, "pipeline:view")` (global; matches every pipeline GET). No PIC scoping.
- Recipient eligibility (new, in `lib/notifications.ts`): `filterActiveUsersWhoCanSeeOpportunity(tx, ids)` = one `user.findMany({ id in ids, active: true }, select role.permissions)` + pure `canUserSeePipeline({permissions}) = permissions includes "pipeline:view" or "*"` (reuse `hasPermission` with a synthetic payload, like CUST L332-335). Fixed query count.
- `notifyForEvent` branches on scope: `event.projectId !== null` → `filterActiveUsersWhoCanSeeProject`; else `filterActiveUsersWhoCanSeeOpportunity`.
- `routes/notifications.ts` `visibleOwn(user)` becomes:
  ```ts
  const arms: Prisma.ActivityEventWhereInput[] = [
    { projectId: { not: null }, project: { is: projectVisibilityFilter(user) } },
  ];
  if (hasPermission(user, "pipeline:view")) arms.push({ opportunityId: { not: null } });
  return { userId: user.sub, activityEvent: { OR: arms } };
  ```
  Trap: once `project` is an optional relation, CUST's `activityEvent: { project: projectVisibilityFilter(user) }` with view-all (`{}`) changes meaning; use the explicit `projectId not null` + `is:` form above and cover view-all + `*` + no-pipeline-permission users in tests. A user who loses `pipeline:view` (role change) stops seeing deal notifications (JWT permissions — effective on next token).
- Notification DTO: add `opportunityId: string|null`, `opportunityTitle: string|null` beside `projectId`/`projectName` (both nullable now). `notificationHref`: opportunity events → `/pipeline/:opportunityId` (INTERNAL `frontend/src/App.tsx:70` `path="pipeline/:id"`, verified).
- New notification reasons (TEXT column, no migration): reuse `assigned` and `commented`; add `deal_closed` (and `deal_updated` if D-P1 enables stage-move notices). `notificationText.ts` phrases by `event.entityType`: "rina assigned you the deal <X>", "rina added a note on <X>", "rina closed <X> as Lost", "rina made you TAM of <Project> (from deal <X>)".

**Where pipeline events are shown**
- OpportunityDetail: unchanged timeline (OpportunityActivity). No new panel this phase.
- Notification bell: yes.
- Project "Recent activity" of a handed-off project: the project-scoped `created` event ("rina created the project from deal X").
- `activityText.ts` gains an `opportunity` / `opportunity_note` / `opportunity_link` branch (needed by the bell's fallback sentence and any future feed).

### 3.4 Decisions for the user (Pipeline)
- **D-P0**: approve option (c) (dual-write) over (a)/(b).
- **D-P1**: which pipeline events notify the PIC: assignment (recommend ON), note by someone else (recommend ON), close by someone else (recommend ON), stage move by someone else (recommend OFF), reopen (OFF).
- **D-P2**: bulk import creates events but never notifies (recommend), or no events at all.
- **D-P3**: add OpportunityActivity sentences for the cases silent today (deal created, PIC changed via PATCH, link added/removed)? Recommend only "PIC changed via PATCH" ("Assigned to X") for parity with `/assign`; leave create/links silent in the timeline.
- **D-P4**: on handoff, notify the new project's TAM (recommend ON) and SA (recommend ON if `saId` set and ≠ actor).
- **D-P5**: store link labels in `changes`? (Labels are short user text; pipeline data is never exported; recommend yes, URL never.)
- **D-P6**: @mentions in deal notes (OpportunityActivity composer) — out of scope for this port; recommend a follow-up (would need `mentionedUserIds` on `opportunity_activities`).

---

## 4. Visibility

### 4.1 INTERNAL today — `backend/src/lib/visibility.ts` exports (quoted)
- `projectVisibilityFilter(user): Prisma.ProjectWhereInput` (L21-30): `{}` for `project:view-all`/`*`, else `{ OR: [{ tamId: user.sub }, { saId: user.sub }, { customer: { tamId: user.sub } }] }`.
- `ensureProjectVisible(user, projectId)` (L36-45): 404 `not_found` "Project not found".
- `ensureTaskVisible(user, taskId)` (L49-58): 404 "Task not found".
- `customerVisibilityFilter(user)` (L77-86): view-all `{}`; else `OR [tamId, tamId null, projects.some(projectVisibilityFilter)]`.
- `isCustomerVisible(user, customerId)` (L92-101), `ensureCustomerVisible(user, customerId)` (L108-115, 404 `customer_not_found`).
- Absent (CUST-only): `VisibilityOptions`, member arm, `ProjectVisibilityFacts`, `canUserSeeProject`, `ensureProjectOwnerAccess`, `ensureCustomerOwnerAccess`. The members spec (sibling `backend-ops.md` §1.5) already decided the owner option must drop BOTH the member arm and the SA arm (`{ ownerOnly: true }` rather than CUST's `{ viaMembership: false }`).

### 4.2 `canUserSeeProject` for INTERNAL (four arms + view-all)
```ts
/** What `canUserSeeProject` needs to know about one project. */
export interface ProjectVisibilityFacts {
  tamId: number;                 // INTERNAL Project.tamId is NOT NULL (schema:214)
  saId: number | null;           // INTERNAL-only arm
  customerTamId: number | null;  // Customer.tamId of the project's customer
  memberIds: ReadonlySet<number>; // members among the users being checked (empty until MEMBERS lands)
}
/** Pure twin of projectVisibilityFilter(user) — keep the arms in step. */
export function canUserSeeProject(user: JwtPayload, p: ProjectVisibilityFacts): boolean {
  return (
    hasPermission(user, "project:view-all") ||
    p.tamId === user.sub ||
    p.saId === user.sub ||
    p.customerTamId === user.sub ||
    p.memberIds.has(user.sub)
  );
}
```
`filterActiveUsersWhoCanSeeProject` must select `saId: true` alongside `tamId`, `customer.tamId`, `members where userId in ids`. The CUST header comment ("TWO REPRESENTATIONS OF THE SAME RULE … extend that test with any new arm", CUST visibility.ts:30-37) is ported verbatim, and the parity test (`notifications.test.ts` "the batch check agrees with projectVisibilityFilter for every arm", CUST L434) gains an SA case. SA is a visibility arm only, never an owner arm (user decision 2026-10-02) — irrelevant to notifications (they only test visibility), but `canUserSeeProject` must NOT be reused for owner checks.

### 4.3 Every visibility/member touchpoint in the ported code → INTERNAL mapping

| CUST site | Uses | INTERNAL equivalent / action |
|---|---|---|
| `routes/activity.ts:28,33` | `requirePermission("project:read")` + `ensureProjectVisible` | exists (visibility.ts:36). SALES (pipeline-only) cannot read project activity — correct. |
| `routes/notifications.ts:28-33` `visibleOwn` | `projectVisibilityFilter` via `activityEvent.project` | exists; rewrite for nullable project + pipeline arm (§3.3). |
| `lib/notifications.ts:303-340` | `canUserSeeProject`, `ProjectVisibilityFacts`, `project.members` select | add both to visibility.ts (§4.2); members select gated on MEMBERS (§4.4). |
| `routes/tasks.ts:647` comment POST | `ensureTaskVisible` (unchanged) + `filterActiveUsersWhoCanSeeProject` for mentions | exists (INTERNAL tasks.ts:367). |
| `routes/tasks.ts:438-454` PATCH, `routes/projects.ts:490-504` task create | `ensureAssigneeIsMember` → `member added` event | MEMBERS-only; omit until members lands (assignee who cannot see the project then gets NO notification — see fallback). |
| `routes/projectMembers.ts:126-143, 175-199` | member add/remove events | MEMBERS-only; the members PR (or this PR if members lands first) adds the two `recordActivity` calls. |
| `lib/projectMembers.ts` `ensureAssigneeIsMember` return type `{username}|null` | changed by 476288e | members spec must take the 476288e version (returns username) or this PR patches it. |
| `routes/shareLinks.ts:80,141` | share_link events | guest-links port (eadc065) already contains the calls; requires `lib/activity.ts` to exist first → ACTIVITY before SHARE, or SHARE ships its calls later. |
| FE `ProjectActivity.tsx:31` | `useProjectMembers` for the person filter | MEMBERS hook; fallback = TAM + SA only. |
| FE `TaskPanel.tsx` `PanelComments` | `useProject` (tam) + `useProjectMembers` for mention candidates | add `project.sa` (INTERNAL `ProjectDetail.sa`, queries.ts:127); members via hook when present. |
| FE `queries.ts` `useAddProjectMember`/`useRemoveProjectMember` | `invalidateProjectActivity` | MEMBERS hooks; add the invalidation there. |
| backend tests: `activity.test.ts:559` "visible to a member and 404 for a non-member", `:379` members events; `notifications.test.ts:404-467` arm parity | members API / ProjectMember rows | add SA cases; member cases only after MEMBERS. |
| e2e `mentions.spec.ts:69`, `project-activity.spec.ts:83` | `POST /projects/:id/members` to make a second user visible | after MEMBERS; fallback = set the second user as the project's SA via `PATCH /projects/:id { saId }` (INTERNAL projects.ts:308). |

### 4.4 Ordering with the members port
- **Recommended: MEMBERS PR first, then ACTIVITY+NOTIFICATIONS+MENTIONS PR.** CUST order is `af9a362` (members) → `2d9b0a8` (conflict) → `476288e` (activity) → `eadc065` (share). 476288e edits members code (`lib/projectMembers.ts`, `routes/projectMembers.ts`) and its tests/e2e create members. Porting in CUST order lets the code be taken nearly verbatim.
- Guest links (`eadc065`) call `recordActivity` → **ACTIVITY before SHARE**, or SHARE lands first without its two `recordActivity` calls and this PR adds them.
- **Fallback if notifications land before members**: `ProjectVisibilityFacts.memberIds = new Set()` and no `members` select; no `member` events and no `ensureAssigneeIsMember` hook; mention candidates = TAM + SA; ProjectActivity person filter = TAM + SA; e2e uses `saId` instead of members; `activityText.ts` keeps its `member` branch (dead until MEMBERS). Consequence to accept: assigning a task to someone who cannot see the project notifies nobody (CUST fixed this by auto-membership). The MEMBERS PR then (1) adds the arm to both `projectVisibilityFilter` and `canUserSeeProject`, (2) adds the members select, (3) extends the parity test, (4) adds member events.
- Conflict-warning (`2d9b0a8`) is NOT a hard dependency, but CUST's PATCH /tasks hunk is written on top of it (it moved the `FOR NO KEY UPDATE` lock + `before` read from the `expected` branch to always-on). INTERNAL must do that restructure itself (§5.6) regardless; if the conflict-warning port is also planned, land it first and take 476288e's hunk verbatim.

---

## 5. Backend file-by-file (INTERNAL target)

### 5.1 New files
| File | Source | Adaptation |
|---|---|---|
| `backend/src/lib/activity.ts` | CUST (205 lines, post-`eadc065`) | `RecordActivityInput`: `projectId?: number`, `opportunityId?: string`, `entityId?: number|null`; runtime assert exactly one scope (mirrors the SQL CHECK). Add `"opportunity" | "opportunity_note" | "opportunity_link"` to `ActivityEntityType`; add actions `moved|closed|reopened|assigned|handed_off|noted|link_added|link_updated|link_removed` (or keep CUST's 5 verbs + discriminate via `changes` — implementor's choice, but `activityText.ts` must match). `TaskSnapshot`: drop `epicId`/`itopTicketRef` unless the EPICS/ITOP ports have landed (INTERNAL schema has neither column — verified `schema.prisma` has `isCriticalPath` at :333, no `epicId`/`itopTicketRef`). Add `diffOpportunityChanges` (§3.3) and extend `diffProjectChanges` with `tamId`/`saId` as `{id,username}` pairs if D-A2 approves. `toActivityEventDto` adds `opportunityId`. |
| `backend/src/lib/activityCleanup.ts` | CUST verbatim (56 lines) | Header comment: drop the reference to `lib/itop/scheduler.ts` unless iTop is ported first. |
| `backend/src/lib/notifications.ts` | CUST (120 lines) | SA arm via `saId` select; members select only after MEMBERS; scope branch for opportunity events + `filterActiveUsersWhoCanSeeOpportunity`; new options `picId`/`recipients` for pipeline reasons; reasons union extended (`deal_closed`, …). |
| `backend/src/lib/opportunityActivity.ts` (NEW, INTERNAL-only) | — | `recordOpportunityChange(tx, …)` dual-writer (§3.2c). |
| `backend/src/routes/activity.ts` | CUST verbatim (53 lines) | none (projectId filter keeps opportunity rows out automatically). |
| `backend/src/routes/notifications.ts` | CUST (95 lines) | `visibleOwn` rewrite (§3.3); include `opportunity: { select: { id, title } }`; DTO `projectId|null, projectName|null, opportunityId|null, opportunityTitle|null`. |

### 5.2 Endpoints
| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| GET | `/projects/:id/activity` | requireAuth + `project:read` + ensureProjectVisible (404) | query `limit` 1-100 (50), `before` id, `actorId` | `{ events: ActivityEventDto[], nextBefore: number|null }` |
| GET | `/notifications` | requireAuth | `limit` 1-100 (30), `before` | `{ notifications: [{ id, reason, readAt, createdAt, event, projectId, projectName, opportunityId, opportunityTitle }], nextBefore }` |
| GET | `/notifications/unread-count` | requireAuth | — | `{ count }` |
| POST | `/notifications/:id/read` | requireAuth | — | `{ id, readAt }`; 404 for others' rows |
| POST | `/notifications/read-all` | requireAuth | — | `{ updated }` |
| POST | `/tasks/:id/comments` (changed) | requireAuth + ensureTaskVisible (unchanged; NO permission gate in either repo) | `{ body: string(1..5000), mentionedUserIds?: int[] (≤20, deduped) }` | Comment incl. `mentionedUserIds` |
| (optional, later) GET | `/opportunities/activity` | `pipeline:view` | as project feed | structured pipeline feed — NOT in this phase |

### 5.3 `backend/src/app.ts`
INTERNAL mounts at L52 (`/projects` projectsRouter) … L68-69 (opportunities). Add imports and `app.use("/projects", activityRouter)` right after L52 (after the members router once MEMBERS lands, CUST order: projects, projectMembers, activity) and `app.use("/notifications", notificationsRouter)`. No ordering hazard: activity router only defines `/:id/activity`. Diverged nearby: INTERNAL still uses `pinoHttp` (L44) and `createApp(): Express` without opts; the SECURITY/SHARE ports change those — unrelated hunks.

### 5.4 `backend/src/index.ts`
Add `startActivityCleanup()` inside the listen callback (INTERNAL L8-10) and `stopActivityCleanup()` at the top of `shutdown()` (L12-19). INTERNAL has no iTop scheduler calls there yet (diverged: CUST L13/L19 also start/stop iTop).

### 5.5 Call sites — `backend/src/routes/projects.ts` (spine: notes + baseline)
| CUST hunk | INTERNAL location | Divergence |
|---|---|---|
| PATCH `/:id` → tx + `FOR NO KEY UPDATE` + before(name,status,customerId) + `recordActivity(project, updated)` | `projects.ts:294-328`, bare `prisma.project.update` at **:325** | INTERNAL also accepts `saId` (L308-310) and `tamId` (L311) and has no owner-only gate yet. CUST does not log TAM changes (ISSUES:2276). Decision D-A2: log `tamId`/`saId` and notify the new TAM/SA. |
| POST `/:id/tasks` → `recordActivity(task, created, taskCreatedChanges)` + `notifyForEvent` (+ members auto-add event) | `projects.ts:376-442`, tx at :389, `return tx.task.create(...)` at **:409** → change to `const created = await …; record; notify; return created` | INTERNAL has no `ensureAssigneeIsMember` (MEMBERS), no epics fields. Include already selects `assignedTo {id,username,email}` — enough for `taskCreatedChanges`. |
| POST `/:id/risks` → tx + `recordActivity(risk, created)` | bare `prisma.risk.create` at **:520** (route :511-531) | none |
| POST `/:id/notes` → tx + `recordActivity(note, created, {visibility})` | bare create at **:616** (route :607-628) | none (identical body). |
| PATCH `/:id/notes/:noteId` → tx + record only when body changed | bare update at **:650** (route :633-657); `note` already loaded at :642 | none |
| DELETE `/:id/notes/:noteId` → tx + record `{visibility: note.visibility}` | bare delete at **:679** (route :660-682) | none |
| Handoff project-side event (INTERNAL-only) | n/a — lives in `opportunities.ts:1144-1155` | §3.3 |
| Not logged (parity with CUST): POST `/` (:143), DELETE `/:id` (:331), baseline (:191), services (:248), sections (:446/:460), reviews, dependencies, labels | — | D-A3: optionally log project creation (handoff already does). |

### 5.6 Call sites — `backend/src/routes/tasks.ts` (spine: task ordering)
| CUST hunk | INTERNAL location | Divergence |
|---|---|---|
| import `diffTaskChanges, recordActivity`, `filterActiveUsersWhoCanSeeProject, notifyForEvent` | top of file (INTERNAL L19 imports duplicate.js) | — |
| `createCommentSchema` + `mentionedUserIds` (max 20, dedupe transform) | INTERNAL `:71-73` | identical base schema (`body` 1..5000). |
| PATCH: lock + `before` read inside tx, `derive(before)`, `finish(after)` → record + notify, on BOTH return branches | INTERNAL `:136-281`. `current` read OUTSIDE tx at **:154-164**; derived values at :166-185; tx at **:189**; returns at **:255** (touchesOrdering branch) and **:268** | **Most divergent hunk.** INTERNAL has no `expected`/stale_write, no `derive()`, no `taskResponseInclude` constant (include is inlined twice at :257-263 and :270-276), no members auto-add, no epics. Restructure: move the `current` read into the tx after `SELECT id FROM tasks WHERE id = ${id} FOR NO KEY UPDATE`, read with the response include (assignedTo + labels), compute nextStatus/keys from it, wrap both `tx.task.update` returns in `finish()`. Keep INTERNAL's `ensureTaskVisible` first (:148). Use FOR NO KEY UPDATE (not FOR UPDATE — CUST comment: FOR UPDATE deadlocked against label/comment/subtask FK checks, 40P01). Spine: `taskOrdering`/`routes/tasks.ts` → instant review. |
| DELETE → tx { findUnique(projectId,title) → 404; delete; record } | bare delete at **:291** (route :284-295) | none |
| duplicate → record `task created` for the copy | `return tx.task.findUniqueOrThrow(...)` at **:329** → assign `copy`, record, return | none |
| comments POST → tx { task (projectId,title,assignedToId); filter mentions; create with `mentionedUserIds`; record comment created `{taskId}`; notify with `taskAssigneeId` + mentions } | bare `prisma.comment.create` at **:368** (route :360-378) | none |
| `GET /:id/comments` | :345-357 | unchanged; returns the new column automatically. |

### 5.7 `backend/src/routes/risks.ts`
PATCH: bare update at **:40** (route :26-45) → tx + `FOR NO KEY UPDATE` + before read + record `diffRiskChanges`. DELETE: select add `description` at :55-58, bare delete at **:61** → tx + record. No divergence (INTERNAL file = CUST pre-476288e).

### 5.8 `backend/src/routes/sections.ts`
POST `/:id/duplicate`: after `insertManyAfter` at **:213** (inside `if (taskCount > 0)`), add CUST's `findMany` titles + loop `recordActivity` (one per copied top-level task). Tx already has `timeout: 30_000` (:221) — fine. Perf: N sequential INSERTs; acceptable (CUST same) or use `tx.activityEvent.createMany` (implementor may batch; `recordActivity` returns nothing needed here).

### 5.9 `backend/src/routes/projectMembers.ts`, `lib/projectMembers.ts`, `routes/shareLinks.ts`
Not present in INTERNAL (MEMBERS/SHARE ports). Whichever PR lands second adds the `recordActivity` calls (CUST `projectMembers.ts:126-143` add, `:175-199` remove with `unassignedTasks`; `shareLinks.ts:80`, `:141`) and `ensureAssigneeIsMember`'s `{username}|null` return.

### 5.10 Epics
CUST logs nothing for epic CRUD; the only epic touchpoint is `epicId` in `TaskSnapshot`/`diffTaskChanges` and `FIELD_NOUN.epicId` in activityText. Include `epicId` only when the EPICS port has landed.

### 5.11 `backend/src/routes/opportunities.ts` / `opportunityItems.ts` (Pipeline extension)
Call sites and line numbers in §3.3. Every site is already inside a `prisma.$transaction` except:
- PATCH (`:762`): tx exists; add the lock+before read inside it.
- DELETE: not logged.
- `opportunityItems.ts` note POST (`:96`) and link writes (`:140`, `:163`, `:186`): tx exists.
`pipelineAccess.ts` unchanged.

### 5.12 `backend/src/routes/admin.ts` (spine)
`PUT /admin/projects/reassign` (`admin.ts:553-578`) changes `tamId` with a bare update. CUST does not log it (decision, ISSUES:2276). If D-A2 = yes, wrap and record `project updated {tamId:{from,to}}` + notify the new TAM — spine touch, instant review. Default: leave untouched.

---

## 6. Frontend file-by-file (INTERNAL target)

**Prerequisites absent in INTERNAL** (all from CUST UIPASS `489b0a4` / LIVE `25dbeec`; fe-pages.md/fe-components.md list them):
- `frontend/src/lib/formatDate.ts` (`fmtDay`, `fmtAgo`, `fmtDateTime`) — used by activityText, ProjectActivity, NotificationBell.
- `frontend/src/lib/labels.ts` (`PRIORITY_LABEL`, `PROJECT_STATUS_LABEL`, `RISK_CATEGORY_LABEL`, `RISK_STATUS_LABEL`, `TASK_STATUS_LABEL`) — used by activityText.
- `text-meta` type token in `index.css` (grep: absent in INTERNAL; `--shadow-overlay` exists at index.css:116).
- `useLiveRefresh()` in queries.ts (used by `useProjectActivity`).
- `useProjectMembers` (MEMBERS).
If UIPASS/LIVE are not ported first: carry a minimal `formatDate.ts` subset (or local helpers like INTERNAL's private `relativeTime` at `TaskPanel.tsx:903` / `OpportunityDetail.tsx:139`), local label maps (INTERNAL `StatusChip.tsx` has local `PROJECT_LABEL`/`TASK_LABEL` per fe-components.md), `text-[11px]` instead of `text-meta`, and drop `...live` from `useProjectActivity` (keep `invalidateProjectActivity` on mutations). Recommend porting UIPASS's `formatDate.ts`/`labels.ts`/`text-meta` first — otherwise three files get rewritten twice.

| File | Source | INTERNAL adaptation |
|---|---|---|
| `components/ProjectActivity.tsx` (new) | CUST 205 lines verbatim | Props: add `sa: {id,username}|null`; options = Everyone, TAM, SA (if set, deduped), members (if MEMBERS). Empty-state copy "Changes to tasks, risks, notes and members show up here." → drop "members" until MEMBERS. Uses `Select items=` (Base-UI `Select.Root items` prop — INTERNAL `ui/select.tsx` is Base-UI; prop pass-through [UNVERIFIED]). |
| `pages/views/ProjectOverview.tsx` | CUST +4 lines | import; `taskIds` memo after `sCurve` (:34); `<ProjectActivity projectId tam sa taskIds />` after the detail-panel grid (after :173, before the closing `</div>` at :174). Keep INTERNAL's DealCard (fe-pages.md 2.7 TAKE-CUST+2). |
| `lib/activityText.ts` (new) | CUST 439 lines | Add `opportunity` / `opportunity_note` / `opportunity_link` branches; add `FIELD_NOUN` for `dealValue`, `winProbability`, `customerName`, `productSolution`, `leadSource`, `subStatus`, `statusTag`, `pic`, `stage`, `deadline`, `requestDate`; labels from INTERNAL `lib/pipelineFormat.ts` (verified exports: `STAGE_LABELS` :27, `SUB_STATUS_LABELS` :117, `TAG_LABELS` :122, `OUTCOME_LABELS` :127, `OUTCOME_REASON_LABELS` :133, `formatIDR` :217, `formatWinProbability` :258, `formatPipelineDate` :277). Project branch: `tamId`/`saId` (if D-A2) read `{username}` via `valueText`. `eventTaskId` unchanged; add `eventOpportunityId`. |
| `lib/notificationText.ts` (new) | CUST 46 lines | `REASON_PHRASE` per (reason, entityType): task `assigned/commented/mentioned` as CUST; opportunity: `assigned` → "assigned you the deal", `commented` → "added a note on", `deal_closed` → "closed"; project-created handoff → "made you TAM of". `notificationHref`: opportunity → `/pipeline/${opportunityId}`; project → `/projects/:id[?task=]`. Meta line shows `projectName ?? opportunityTitle`. |
| `components/layout/NotificationBell.tsx` (new) | CUST 206 lines verbatim | Meta line uses `projectName ?? opportunityTitle`. `positionerClassName="z-101"` matches the frontend CLAUDE.md popover convention. |
| `components/layout/TopBar.tsx` | CUST +3 lines | import; `<NotificationBell />` before the theme-toggle button at **:107** (CUST places it after the Help link; INTERNAL has no Help link until the Help port). |
| `components/CommentMentions.tsx` (new) | CUST 212 lines verbatim | none |
| `lib/mentions.ts` (new) | CUST 158 lines verbatim | none |
| `components/TaskPanel.tsx` | CUST hunks (fe-components.md "MENTION" rows) | INTERNAL `:785` `<PanelComments taskId={task.id} />` → add `projectId`; `:821-` PanelComments: `useAddComment(taskId, projectId)`, `useProject(projectId)` (+ `useProjectMembers` when MEMBERS), `people` = TAM + **SA** (+ members); replace the comment `<p>` (body render) with `<CommentBody>` and the inline form (`:826-`, `:876-`) with `<CommentComposer>`. INTERNAL keeps its local `relativeTime` (:866) unless UIPASS lands (`fmtAgo`). |
| `lib/queries.ts` (spine) | CUST hunks | `useInfiniteQuery`, `InfiniteData` imports; `ActivityEvent` (+ `opportunityId`), `ActivityPage`, `Comment.mentionedUserIds?` (INTERNAL `:193-200`); `queryKeys.projectActivity`; `ACTIVITY_PAGE_SIZE=20`, `ACTIVITY_MAX_PAGES=5`; `useProjectActivity`; notifications block (`NotificationReason`, `AppNotification` + `opportunityId/opportunityTitle`, `NOTIFICATIONS_PAGE_SIZE=30`, `useUnreadNotificationCount` (60 s poll, focus refetch, staleTime 0), `useNotifications`, `useMarkNotificationRead` (optimistic onMutate/onError/onSettled — matches the frontend CLAUDE.md pattern), `useMarkAllNotificationsRead`); `invalidateProjectActivity`; add it to `useUpdateProject` (:751), `useUpdateTask` (:1045), `useDeleteTask` (:1093), `useCreateTask` (:1124), `useDuplicateTask` (:1140), `useDuplicateSection` (:1301), `useCreateRisk` (:1344), `useUpdateRisk` (:1358), `useDeleteRisk` (:1387), `useAddProjectNote` (:1581), `useUpdateProjectNote` (:1635), `useDeleteProjectNote` (:1672), `useAddComment` (:1979 — new signature `(taskId, projectId)`, body `{ body, mentionedUserIds? }`). Pipeline mutations that now emit notifications for OTHER users need no local invalidation; the handoff mutation (`queries.ts:~2901`) should also call `invalidateProjectActivity(qc, project.id)`. Key namespace: notifications use top-level `["notifications", …]` keys (not in `queryKeys`/`pipelineKeys`) as in CUST — acceptable, or add a `notificationKeys` object for convention parity (frontend CLAUDE.md says keys live in `queryKeys`; reviewer may flag). |

**Design-token notes** (docs/DESIGN.md is binding; reviewer reads it live):
- Uses only existing tokens: `bg-primary`, `text-on-primary`, `bg-primary/10`, `text-primary`, `border-outline-variant`, `bg-surface-container-lowest/-low/-high`, `text-on-surface(-variant)`, `text-error`, `shadow-overlay`, `text-label-caps`, `font-display`, `rounded-sm`/`rounded-lg`, `material-symbols-outlined`. New: `text-meta` (UIPASS).
- CUST DESIGN.md elevation table was extended to list the NotificationBell popover and the CommentMentions picker (`shadow-overlay!`) — sync INTERNAL `docs/DESIGN.md` (docs-keeper trigger only if `index.css` is touched, e.g. adding `text-meta`).
- Badge colour: CUST uses primary (not error) for the unread count — INTERNAL TopBar once had an "error dot" (CHANGELOG:3770, since removed); keep CUST's primary.
- Mobile ≥375px: popover width `min(24rem, 100vw-1rem)`; bell visible on mobile (no `md:` gate) — matches CUST.
- `OpportunityDetail.tsx` untouched by recommendation (c) (its `font-display text-[13px] uppercase tracking-wider` header predates UIPASS; out of scope).

---

## 7. Tests

### 7.1 CUST tests to port
| File | Count | Notes for INTERNAL |
|---|---|---|
| `backend/test/activity.test.ts` | 22 `it` (602 lines) | Fixtures via `createUserWithRole`/`seedRoles` (INTERNAL `test/testAuth.ts:23,40` — same API). Drop/gate: "a rejected stale write leaves no event" (:163) and "a successful `expected` save…" (:193) need CONFLICT; "logs itopTicketRef" (:225) needs ITOP; member cases (:45 member event, :379, :559) need MEMBERS. Keep: create/update/no-op/delete, concurrent identical assign (:206), duplicate task/section (:236, :253), comments (:271), risks (:294), notes privacy (:326, :363), project updates (:422), atomicity (:458, :476), GET paging/filter/limits/deleted actor (:503, :537), retention (:576). |
| `backend/test/notifications.test.ts` | 29 `it` (612 lines; +ebe8953 fix) | Gate: stale_write (:137) → CONFLICT; members arm in parity (:434) → MEMBERS. Keep the rest. |
| `frontend/src/lib/activityText.test.ts` | 34 | iTop case (:124) gated on ITOP; guest-links block (:337-) harmless (pure). |
| `frontend/src/lib/mentions.test.ts` | 22 | verbatim. |
| `frontend/src/lib/notificationText.test.ts` | 9 | verbatim + new pipeline cases. |
| `e2e/tests/notifications.spec.ts` | 2 | Uses admin API to create users/customer/project and assign — no members dependency; verbatim. |
| `e2e/tests/mentions.spec.ts` | 2 | Uses `POST /projects/:id/members` (:69) → MEMBERS, else make the second user the project SA (`PATCH /projects/:id {saId}`) — note SA role lacks `task:write` but commenting needs no permission (INTERNAL tasks.ts:360 has no `requirePermission`). |
| `e2e/tests/project-activity.spec.ts` | 2 | Uses members (:83) → same fallback. |

**"Stable notification query-count test" fix (`ebe8953`)**: Prisma emits query-log events asynchronously, so the implicit COMMIT of `createMany` could be counted in the next measurement (7 vs 8 flake in CI). The test now runs a marker statement `SELECT 'query-log-flush' AS marker` on the logging client and awaits its own log event (5 s timeout) before reading the collected statements; asserts 1-mention and 20-mention runs produce the same number of statements and ≤ 8. Port the post-fix version directly (never the pre-fix one). INTERNAL caveat: the test constructs `new PrismaClient({ log: [{emit:"event", level:"query"}] })` inside a test file — `backend/CLAUDE.md` forbids `new PrismaClient()` in routes only; tests are fine. Adding the SA arm adds `saId` to the same `project.findUnique` select (no extra statement) — the ≤8 bound still holds [verify when run].

### 7.2 New tests INTERNAL needs
Backend (`activity.test.ts` / `notifications.test.ts` / new `opportunityActivity.test.ts`):
1. SA arm: an assignee/mentionee who sees the project only as `saId` is notified; parity test case for the SA arm (`canUserSeeProject` vs `projectVisibilityFilter`).
2. SA can read `GET /projects/:id/activity` (has `project:read`); SALES gets 403 (no `project:read`); a TAM of another project gets 404.
3. Project PATCH `saId`/`tamId` changes recorded/notified (if D-A2).
4. Pipeline: each writer in §3.3 creates exactly one ActivityEvent with the documented `changes` and still writes its exact OpportunityActivity sentence (existing note-string assertions keep passing); no-op PATCH and same-PIC assign record nothing; `dealValue` BigInt edit serialises as a number; free-text close/skip reasons never appear in `changes`; deal delete cascades events + notifications; CHECK constraint rejects an event with both or neither scope (raw insert).
5. Pipeline notifications: `/assign` by an `edit_all` user notifies the new PIC; self-claim by `edit_own` notifies nobody; note by SALES notifies the PIC (if D-P1); recipient without `pipeline:view` (TAM) is skipped; inactive PIC skipped; handoff notifies the TAM (and SA, D-P4) and writes the project-scoped `created` event in the same tx (rollback test: `already_linked` race leaves no events).
6. `GET /notifications` visibility: a pipeline notification is hidden from (and not counted for) a user whose role lost `pipeline:view`; a view-all/`*` user still sees project notifications after `projectId` became nullable; ordering/paging across mixed project + pipeline rows.
7. Retention: cleanup deletes opportunity-scoped events older than 180 days too (and their notifications) — or, if D-A4 keeps them, asserts they survive.
Frontend unit: `activityText` opportunity branches; `notificationText` opportunity phrases + `/pipeline/:id` href.
E2E: one pipeline notification flow (admin assigns a deal's PIC to user B → B's bell shows "assigned you the deal …" → click opens `/pipeline/:id`). Fits `pipeline-form.spec.ts` style.

## 8. Spine-list hits, privacy, performance

**Spine hits (instant opus review each)**: `schema.prisma` + 3 migrations; `routes/tasks.ts` (PATCH lock restructure — task ordering spine); `routes/projects.ts` (notes routes + project PATCH); `lib/visibility.ts` (`canUserSeeProject`, SA arm); `frontend/src/lib/queries.ts`; `routes/admin.ts` only if D-A2 logs reassign. Not touched: `http/auth.ts`, `lib/export/`, `kanban-v2/`, `gantt-v2/`, `reui/`, date-contract files, docker/env/setup.sh (no new env var — retention is a constant; D-A5 if it should be configurable).

**Privacy (INTERNAL guardrail: INTERNAL notes never reach exports)**:
- Note events store only id + `visibility`; `entityLabel` null; the body never enters `activity_events`. Comment events store the task title + `{taskId}`, never body/mentions.
- Nothing in `frontend/src/lib/export/` reads activity or notifications; the port must not add such an import — add a `gates.sh` guardrail grep (e.g. `grep -rn "activity\|notification" frontend/src/lib/export/` must be empty) [suggestion; gates.sh contents UNVERIFIED].
- Guest links (`publicShare.ts`) must never return activity (CUST CHANGELOG:30 lists "activity" among excluded fields) — keep when porting SHARE.
- Pipeline: free-text close reasons, PoC-skip reasons and deal notes stay ONLY in `opportunity_activities` (as today); `changes` carries categories/flags. Link URLs never stored.
- Risk labels carry ≤120 chars of risk description (accepted CUST decision; risks are internal-only).
- Notification rows are per-user; read/mark endpoints are self-scoped (404 on others' ids).

**Performance**:
- Writes: +1 INSERT per change (+1 `createMany` + 2-5 SELECTs when someone is notified). The recipient check is fixed-cost (users+roles, project facts) — tested. Section duplicate does N sequential inserts (N = copied top-level tasks) inside a 30 s tx — acceptable; `createMany` would make it O(1).
- PATCH lock: `FOR NO KEY UPDATE` on the task/risk/project/opportunity row serialises concurrent saves of the SAME row only.
- Reads: feed `WHERE project_id=? [AND actor_id=?] [AND id<?] ORDER BY id DESC LIMIT 21` uses `(project_id, created_at DESC)` index — CUST measured <1 ms at 200k rows (ISSUES:2275); an `(project_id, id DESC)` index would match exactly. Actor filter has no index (fine at this scale). Opportunity index `(opportunity_id, created_at DESC)`.
- Unread count every 60 s per open tab: `notifications(user_id, read_at, created_at)` index + join to `activity_events` and `projects` (visibility OR). Fine at internal-team scale; no N+1.
- `GET /notifications` includes event → actor + project/opportunity in one Prisma query (batched relation loads, not N+1).
- Cleanup: one `deleteMany` on `(created_at)` index daily; cascades notifications via FK (index on `activity_event_id` exists).
- Sub-200 ms NFR (backend CLAUDE.md): all above are single indexed queries.

---

## 9. Task breakdown

Phase = one branch off `origin/develop` = one PR (CUST shipped C5a/C5b/C5c as one PR #20 + test fix #21). Preconditions (separate PRs, recommended first): **MEMBERS** (`af9a362`,`c6f39b2`), and ideally **UIPASS** subset (`lib/formatDate.ts`, `lib/labels.ts`, `text-meta`) and **LIVE** (`useLiveRefresh`, `25dbeec`). CONFLICT (`2d9b0a8`) optional. SHARE (`eadc065`) after this phase (it calls `recordActivity`).

| # | Task | Depends | Files (INTERNAL) | Acceptance | Size | CUST source |
|---|---|---|---|---|---|---|
| T1 | Schema + migrations: `activity_events` (dual scope + CHECK), `notifications`, `comments.mentioned_user_ids`; back-relations | — | `backend/prisma/schema.prisma`, 3 new migration dirs | `migrate deploy` clean on fresh + existing DB; follow-up `migrate dev` produces empty diff; CHECK rejects both/neither scope. Spine review. | S | `476288e` (3 migration SQLs) + INTERNAL-only opportunity columns |
| T2 | Activity backend: `lib/activity.ts`, `lib/activityCleanup.ts`, `routes/activity.ts`, app/index wiring; call sites in `projects.ts` (PATCH, task create, risk create, notes ×3), `risks.ts` (PATCH, DELETE), `sections.ts` (duplicate), `tasks.ts` (PATCH lock restructure, DELETE, duplicate, comment create) | T1 | listed in §5 | `activity.test.ts` ported (minus gated cases) green; no event on no-op/reorder; note bodies never stored; rollback leaves no event; task ordering tests (`taskOrdering.test.ts`, `taskDuplicate.test.ts`, `sectionDuplicate.test.ts`) still green. Spine review (tasks.ts, projects.ts). | L | `476288e` |
| T3 | Notifications backend: `canUserSeeProject` + `ProjectVisibilityFacts` (TAM/SA/customer-owner/members arms) in `visibility.ts`; `lib/notifications.ts`; `routes/notifications.ts`; `notifyForEvent` at task create, task PATCH, comment create | T2 | `lib/visibility.ts`, `lib/notifications.ts`, `routes/notifications.ts`, `app.ts`, `projects.ts`, `tasks.ts`, `test/notifications.test.ts` | ported tests green incl. `ebe8953` query-count fix; SA-arm parity + SA recipient tests; nullable-project `visibleOwn` covered for view-all/`*`. Spine review (visibility). | M | `476288e` + `ebe8953` |
| T4 | Activity frontend: `activityText.ts` (+test), `ProjectActivity.tsx` (TAM+SA[+members] filter), ProjectOverview mount, `queries.ts` (`useProjectActivity`, `invalidateProjectActivity` in 12 mutations) | T2 (API contract only — can start in parallel with T3 against the contract) | §6 | unit tests green; typecheck; Overview shows sentences, filter, Load more, empty/error states; mobile 375px. Spine review (queries.ts). | M | `476288e` |
| T5 | Mentions: comment schema + mention filtering/storage (backend), `mentions.ts` (+test), `CommentMentions.tsx`, TaskPanel PanelComments, `useAddComment(taskId, projectId)` | T3 | `tasks.ts`, `TaskPanel.tsx`, `queries.ts`, new FE files | `@mentions` backend tests green; picker keyboard/escape behaviour; chips only for stored ids; candidates include SA. | M | `476288e` |
| T6 | Notifications frontend: `notificationText.ts` (+test), `NotificationBell.tsx`, TopBar mount, notification hooks (60 s poll, optimistic read) | T3, T4 | §6 | unit tests; bell badge/unread/mark-all/click-through; z-101 popover over modals. | M | `476288e` |
| T7 | Pipeline backend extension: `lib/opportunityActivity.ts` dual-writer; events at create/import/PATCH/move/close/reopen/assign/handoff(+project-side)/note/links; `filterActiveUsersWhoCanSeeOpportunity`; scope branch in `notifyForEvent`; pipeline arm in `visibleOwn`; DTO opportunity fields | T3 + user decisions D-P0..D-P5 | `routes/opportunities.ts`, `routes/opportunityItems.ts`, `lib/notifications.ts`, `routes/notifications.ts`, new tests | §7.2 items 4-7 green; ALL existing opportunity tests unchanged and green (sentences preserved). | L | INTERNAL-only (no CUST source) |
| T8 | Pipeline frontend: activityText/notificationText opportunity branches, `/pipeline/:id` href, handoff mutation invalidates project activity; e2e pipeline notification | T6, T7 | `activityText.ts`, `notificationText.ts`, `queries.ts`, `e2e/tests/` | unit + e2e green desktop+mobile. | S-M | — |
| T9 | E2E + docs: port `notifications.spec.ts`, `mentions.spec.ts`, `project-activity.spec.ts` (members or SA fallback); CHANGELOG entries (orchestrator appends); `docs/plans/` plan; `docs/ISSUES.md` deferred findings (CUST ISSUES:2271-2276 equivalents); DESIGN.md elevation rows; Help topic (if Help ported) | T4-T8 | `e2e/tests/*`, docs | full `gates.sh` green (orchestrator). | M | `476288e`, `d183b57` (docs) |

**Parallel groups**: Wave 1 = T1 → T2 (serial; both spine, T2 needs the generated client). Wave 2 = T3 ∥ T4. Wave 3 = T5 ∥ T6 ∥ T7 (T5 and T6 both touch `queries.ts` and T5/T3 touch `tasks.ts` → worktree isolation; T7 is backend-pipeline-only). Wave 4 = T8 → T9. Serialize frontend `tsc` (CLAUDE.md trap).

**Estimate**: CUST's equivalent was one +4878/-143 commit. INTERNAL: ~5.5-6.5k lines incl. tests (CUST code + SA arm + Pipeline extension ≈ +1.2k). Sizes: 2×L, 5×M, 2×S/S-M → roughly 4 waves; with the spine reviews, one phase of moderate-large size. If MEMBERS is not landed first add ~0.5 task of fallback work plus a later follow-up.

**Blockers**
1. User decisions D-P0..D-P6 (pipeline) and D-A1..D-A6 (below) — T7/T8 cannot start without D-P0/D-P1.
2. MEMBERS ordering (recommended first); otherwise accept the fallback (§4.4).
3. `lib/formatDate.ts`, `lib/labels.ts`, `text-meta`, `useLiveRefresh` absent in INTERNAL — port UIPASS/LIVE subsets first or stub locally.
4. `epicId`/`itopTicketRef` absent — gate `TaskSnapshot` fields on EPICS/ITOP order.
5. INTERNAL `PATCH /tasks/:id` must be restructured (lock + in-tx before-read) — spine; coordinate with a CONFLICT port if planned.

## 10. Open questions for the user (non-pipeline)
- **D-A1** Mention candidates: TAM + SA + members (recommended). Also the customer owner (`customer.tamId`) who can see the project? (CUST excludes; server accepts them if picked by id.)
- **D-A2** Log TAM/SA changes on `PATCH /projects/:id` (and admin `PUT /admin/projects/reassign`, spine) and notify the new TAM/SA? CUST deferred this (ISSUES:2276). Recommend: log + notify on project PATCH; leave admin reassign for later.
- **D-A3** Log project creation (non-handoff `POST /projects`)? CUST: no. Recommend no (handoff path logs it).
- **D-A4** 180-day retention applies to Pipeline events too (recommended — the permanent deal history stays in `opportunity_activities`).
- **D-A5** Retention/poll interval as constants (CUST) vs env vars — recommend constants (no setup.sh/env churn).
- **D-A6** Notifications query keys: top-level `["notifications", …]` (CUST) or a `notificationKeys` namespace per frontend CLAUDE.md convention.
- **D-A7** Email notifications: CUST decision "in-app only; email later" — confirm same for INTERNAL.
- **D-A8** Handoff notifications go to the new project's TAM/SA via the project-scoped event (project visibility). A SALES user (no `project:read`) could only be told via the opportunity-scoped `handed_off` event — notify the deal's PIC on handoff by someone else? Recommend no (the PIC usually performs the handoff).
