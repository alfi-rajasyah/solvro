# Spec: Port EPICS from solvro-cust into solvro (INTERNAL)

Research date 2026-10-02. Read-only. CUST = /home/solvro-internal/solvro-cust, INTERNAL = /home/solvro-internal/solvro.

## 0. Provenance (CUST commit order)

Epics shipped in ONE commit: `8b9fa3a` "Add Epics: group tasks into Jira-style epics with progress and filters" (2026-09-25, PR #14, merge 48b8739). 39 files, +3137/-50.
Relevant CUST order (oldest->newest): iTop phases (..c3839fb, 933d3d0) -> 5caef7f Help page -> **8b9fa3a Epics** -> 489b0a4 UX pass -> 823639d archive spec -> 25dbeec refresh-on-focus -> 3a19e75 copy links -> fc02e6f deep links thru sign-in -> af9a362 project members -> 2d9b0a8 conflict warning -> 476288e activity/notifications/@mentions -> eadc065 guest links -> c729454 close collab plan.
Later commits whose diffs mention "epic" (count of lines): 489b0a4 (97), 25dbeec (4), fc02e6f (2), 2d9b0a8 (26), 476288e (7), d183b57 (3 docs), 78d2a3f (1 docs), c729454 (53 docs), 823639d (rename).

=> In CUST, Epics landed BEFORE members/conflict/activity/guest links but AFTER iTop and Help. The Epics commit itself contains no recordActivity / members / expected-stale-write code (those were added on top by later commits).

Source spec: CUST `docs/archive/plans/epics-spec.md` (moved there by 823639d). Option 3 chosen: separate `Epic` model + `Task.epicId`; Section stays "phase", `parentTaskId` depth-1 invariant untouched. Non-goals (still valid): no Task->Story rename, no issue types, no epic comments/labels/deps/Gantt bars, no swimlanes/group-by-epic, no cross-project epics, no story points/sprints/Jira import, no change to Section/parentTaskId/ordering.

## 1. Behaviour spec (user-visible)

Model semantics
- An Epic belongs to exactly one project (title <=200, description <=2000, status = TaskStatus enum TODO/IN_PROGRESS/DONE etc., color `#rrggbb` default `#94a3b8`, optional owner (User), optional start/due date, dense `position` per project).
- Only TOP-LEVEL tasks carry `epicId` ("stories"). Subtasks always have `epicId = null` and **inherit the parent's epic for display** (TaskPanel breadcrumb chip, Excel export column, Kanban/List chips use parent's epic for subtasks — verify per surface below).
- Progress = `{done, total}` over top-level tasks with that epicId; `done` counts `status = DONE`. Subtasks never count. Epic status is MANUAL (not derived from progress).
- Delete epic -> tasks kept, `epicId` -> NULL (FK ON DELETE SET NULL). Delete project -> epics cascade. Delete owner user -> FK SET NULL (migration) — note Prisma relation has no onDelete in schema but migration says SET NULL (Prisma default for optional relation = SetNull; consistent).
- Position: append = `max(position)+1` (no re-pack on delete, gaps allowed); PATCH with `position` re-packs dense 0..n-1 in a transaction (clamped). (UI in CUST does not expose drag reorder of epics — UNVERIFIED, see §4 ProjectEpics.)

Task-write rules (backend, 400s)
- `epicId` on create with `parentTaskId` -> 400 `epic_on_subtask`.
- `epicId` on update against the EFFECTIVE next parent (body.parentTaskId ?? current) non-null -> 400 `epic_on_subtask` (so `{parentTaskId:X, epicId:Y}` 400s, not silent clear).
- `epicId` referencing an epic of another project (or nonexistent) -> 400 `epic_not_found` (IDOR guard).
- `epicId: null` always clears. Re-parenting to non-null parent with epicId ABSENT from the body -> epicId cleared in the same transaction. Absent epicId + no re-parent -> untouched.
- Duplicate task / duplicate section (lib/duplicate.ts) copies `epicId` verbatim (subtasks copied keep null because source subtasks are null).

Permissions / visibility
- All epic routes `requireAuth`; reads gated only by project visibility (`ensureProjectVisible`, 404 not 403); writes (POST/PATCH/DELETE) `requirePermission("project:write")` (same as sections, NOT task:write). Task epicId writes ride on existing task routes (`task:write`).
- INTERNAL SA role (`project:read` + pipeline perms, no `project:write`/`task:write`, visibility via `Project.saId`): SA sees epics/progress/chips read-only, gets 403 on epic CRUD and cannot set a task's epic. STAKEHOLDER (`project:view-all`) sees all, 403 on writes. No new permission string needed.

UI surfaces (CUST 8b9fa3a; restyled by 489b0a4)
- **Epics tab** `/projects/:id/epics`, tab after Gantt in ProjectDetail. Table: color dot + title, StatusChip, owner, due date, progress bar done/total. Inline create (title only), inline rename, color pick, delete with confirm ("Tasks keep their data and lose the epic link"). Empty state "No epics yet. Group this project's tasks into larger deliverables." Row click opens EpicPanel.
- **EpicPanel** (deep link `?epic=<id>` on the project route, ProjectDetail shifts layout like the task panel): editable description, status select, owner select, start/due dates (DateField), story list (title + StatusChip), inline "Add story…" (POST task with `{epicId}`), click a story -> opens that task (`?task=<id>`).
- **EpicChip** component: color dot on 14% tint with regular text (after 489b0a4; originally solid bg + contrast text via lib/contrast.ts).
- **TaskPanel**: Epic select (None + project epics) on top-level tasks; hidden on subtasks, whose parent breadcrumb shows the parent's EpicChip.
- **TaskFormModal** (new/edit drawer): Epic select; disables and clears itself when a parent task is chosen.
- **Kanban** (kanban-v2/cards.tsx): EpicChip on card next to labels; filter popover "Epic" (All / No epic / one epic), render-only filter like Assignee; drop math unaffected (still topLevelAll).
- **List** (ProjectList.tsx): EpicChip on rows; toolbar Epic filter (All / No epic / one epic).
- **Gantt**: no epic rendering; only wires epic titles into Excel export.
- **Excel export** (lib/gantt/exportExcel.ts): "Epic" column after Section; subtasks show parent's epic title. PDF export: unchanged.
- **Search / command palette / global search**: NOT touched by 8b9fa3a (verified: no epic hits in CUST backend routes/search.ts or frontend command-palette code — see §4 grep). No help topic beyond one helpContent line (8b9fa3a) — check §4.
- **Live refresh** (25dbeec, later): `projectEpics` included in refetch-on-focus/30s set.
- **Deep links through sign-in** (fc02e6f, later): `?epic=` preserved (2 lines).
- Cache: every task create/update/delete/duplicate/reorder mutation invalidates the affected `projectEpics` (+ `epic` detail) so progress never stales.

## 2. Schema

### 2.1 CUST (8b9fa3a, unchanged at HEAD)
`backend/prisma/schema.prisma`:
```prisma
// User:    epicsOwned  Epic[]
// Project: epics       Epic[]
// Task (after itopTicketRef):
  epicId            Int?             @map("epic_id")
  epic              Epic?            @relation(fields: [epicId], references: [id], onDelete: SetNull)
  ...
  @@index([epicId])

model Epic {
  id          Int        @id @default(autoincrement())
  projectId   Int        @map("project_id")
  project     Project    @relation(fields: [projectId], references: [id], onDelete: Cascade)
  title       String
  description String?
  status      TaskStatus @default(TODO) // reuse the enum so StatusChip works unchanged
  color       String     @default("#94a3b8") // same default as Section
  ownerId     Int?       @map("owner_id")
  owner       User?      @relation(fields: [ownerId], references: [id])
  startDate   DateTime?  @map("start_date") // manual; date contract via lib/dateBoundary.ts / z.coerce.date()
  dueDate     DateTime?  @map("due_date")
  position    Int        @default(0) // dense 0..n-1 per project
  createdAt   DateTime   @default(now()) @map("created_at")
  updatedAt   DateTime   @updatedAt @map("updated_at")
  tasks       Task[]

  @@index([projectId])
  @@index([projectId, position])
  @@map("epics")
}
```
(Model placed after `model Section` in CUST; comment block above it cites `docs/plans/epics-spec.md` — use `docs/archive/plans/epics-spec.md` per INTERNAL citation rule.)

### 2.2 CUST migration `backend/prisma/migrations/20260924131112_epics/migration.sql` (verbatim)
```sql
-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "epic_id" INTEGER;

-- CreateTable
CREATE TABLE "epics" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "color" TEXT NOT NULL DEFAULT '#94a3b8',
    "owner_id" INTEGER,
    "start_date" TIMESTAMP(3),
    "due_date" TIMESTAMP(3),
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "epics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "epics_project_id_idx" ON "epics"("project_id");
-- CreateIndex
CREATE INDEX "epics_project_id_position_idx" ON "epics"("project_id", "position");
-- CreateIndex
CREATE INDEX "tasks_epic_id_idx" ON "tasks"("epic_id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_epic_id_fkey" FOREIGN KEY ("epic_id") REFERENCES "epics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "epics" ADD CONSTRAINT "epics_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "epics" ADD CONSTRAINT "epics_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```
No backfill. Depends only on `tasks`, `projects`, `users`, enum `TaskStatus` (INTERNAL has TaskStatus TODO/IN_PROGRESS/DONE — schema.prisma:21-25, identical).

### 2.3 INTERNAL fresh migration
- INTERNAL's newest migration is `20260925140000_opportunity_flow_redesign` — newer than CUST's `20260924131112`. Do NOT reuse the CUST folder name; create `backend/prisma/migrations/<fresh UTC ts, e.g. 20261002HHMMSS>_epics/migration.sql` via `docker compose exec -it backend npx prisma migrate dev --name epics` (or the non-interactive `migrate diff --script` fallback in backend/CLAUDE.md, with a THROWAWAY shadow DB — see the trap CUST added in 8b9fa3a to backend/CLAUDE.md; INTERNAL lacks that trap line, the patch hunk applies clean).
- Expected SQL = the CUST SQL above byte-for-byte modulo statement order (acceptance: diff the generated file against §2.2).
- Rule for all ported features (members/activity/notifications/share links also carry CUST timestamps 20260930*): every port gets a fresh timestamp later than the newest existing migration at authoring time, so folder order = landing order. (UNVERIFIED: whether `prisma migrate dev` complains about an unapplied migration whose name sorts before already-applied ones; `migrate deploy` applies it. Avoid the question by using monotonic fresh timestamps.)
- INTERNAL schema hunks: CUST hunks 1,2,5 apply (offsets 75/35/19); hunks 3,4 FAIL only because the context is `itopTicketRef` (CUST iTop field; INTERNAL Task ends at `successors` line 353 and indexes at 355-363). Hand-place: `epicId`/`epic` after `successors` (schema.prisma:353), `@@index([epicId])` after `@@index([projectId, position])` (:362). User relation `epicsOwned Epic[]` after `assignedTasks` (:176). Project `epics Epic[]` after `sections` (~:236). Epic model after Section (:390-404).

## 3. Backend

### 3.1 `grep -rn -i epic` CUST backend (HEAD), per file
| CUST file:lines | Origin commit | What | Entanglement |
|---|---|---|---|
| `backend/prisma/schema.prisma` Task 335-342, 354; Epic model 398-425; User/Project relation lines | 8b9fa3a | model | none (iTop context only) |
| `backend/prisma/migrations/20260924131112_epics/migration.sql` | 8b9fa3a | DDL | none |
| `backend/src/app.ts:18,69` | 8b9fa3a | `import { epicsRouter }`, `app.use("/epics", epicsRouter)` | none — applies clean in INTERNAL |
| `backend/src/lib/epics.ts` (48 lines) | 8b9fa3a, unchanged since | `assertValidEpic(tx, projectId, epicId)` -> 400 `epic_not_found`; `assertEpicNotOnSubtask(epicId, effectiveParent)` -> 400 `epic_on_subtask` | none. Imports `HttpError` from `../http/errors.js` (INTERNAL has it) |
| `backend/src/routes/epics.ts` (185 lines) | 8b9fa3a, unchanged since | GET/PATCH/DELETE `/epics/:id`, `ensureEpicVisible`, `insertEpicAt`, `getEpicProgress` | none — NO recordActivity in CUST even after 476288e; members visibility arrives implicitly through `ensureProjectVisible` |
| `backend/src/routes/projects.ts` 34 (import), 120 (createTaskSchema `epicId`), 133-140 (`createEpicSchema`), 485-487 (assert on create), 531 (`epicId: body.epicId ?? null`), 599-677 (GET/POST `/:id/epics`) | 8b9fa3a | collection routes + task create | ACTIVITY: in CUST HEAD the task-create block also has `recordActivity` (476288e) right after line 531 — not epic-specific. Applies clean on INTERNAL today |
| `backend/src/routes/tasks.ts` 24 (import), 44 (expectedTaskSchema.epicId), 80 (updateTaskSchema.epicId), 176 (findStaleFields "epicId"), 410-430 (epicIdUpdate), 489-491 (data.epic) | 8b9fa3a except 44,176 (2d9b0a8 CONFLICT) and `current`->`cur` rename at 425 (2d9b0a8) | task update | CONFLICT (44, 176). ITOP: only context (`itopTicketRef` lines in updateTaskSchema). On INTERNAL `patch --dry-run` applies all 3 hunks (fuzz); `git apply` refuses hunk @39 (itop context) |
| `backend/src/lib/duplicate.ts` 21-24 (comment), 38, 67 | 8b9fa3a | copy epicId | ITOP context only (hunk 1 fails on the itopTicketRef comment; hunks 2-3 apply). Hand-add comment |
| `backend/src/lib/activity.ts:89,113` | 476288e ACTIVITY | `TaskSnapshot.epicId`, diff scalar `"epicId"` | ACTIVITY-owned |
| `backend/test/epics.test.ts` (495 lines, 29 `it`) | 8b9fa3a, unchanged | see §5 | none; helpers `seedRoles/createAdminAndToken/createUserWithRole` exist in INTERNAL `backend/test/testAuth.ts:23,40,62` |
| `backend/test/taskDuplicate.test.ts:54,83,106-107,196-211` | 8b9fa3a | +1 test "keeps epicId on the copy" + `createEpic` helper | none; applies clean |
| `backend/test/taskStaleWrite.test.ts:150` | 2d9b0a8 CONFLICT | `expected.epicId: null` | CONFLICT-owned |
| `backend/scripts/seed-demo.ts` (2, 79, 90, 120, 214-318, 373-436, 497-502, 528…) | 489b0a4 UX pass (file created there) | demo epics per project | UXPASS-owned; INTERNAL has no seed-demo.ts |
| `backend/CLAUDE.md` (shadow DB trap) | 8b9fa3a | doc trap | none, applies clean |

`search.ts`, `overview.ts`, `dailyReview.ts`, `portfolio.ts`, `visibility.ts`: no epic code in CUST (verified by grep) — epics never enter search, portfolio progress, or overdue. Option-3 design guarantees flat task queries stay correct.

### 3.2 Endpoints
| Method | Path | Guard | Request | Response |
|---|---|---|---|---|
| GET | `/projects/:id/epics` | requireAuth + `ensureProjectVisible` (404) | — | `200 Epic[]` ordered `[position asc, id asc]`, each `{...epic, owner:{id,username,email}|null, progress:{done,total}}`; 1 findMany + 1 `task.groupBy(by:[epicId,status], where:{projectId, epicId not null, parentTaskId null})` |
| POST | `/projects/:id/epics` | `project:write` + visibility | `{title 1..200, description? <=2000, color? #rrggbb, ownerId? int|null, startDate? date|null, dueDate? date|null}` | `201 {...epic, owner, progress:{0,0}}`; position = max+1 |
| GET | `/epics/:id` | requireAuth + `ensureEpicVisible` (404 `not_found` if missing or project invisible) | — | `200 {...epic, owner, progress, tasks: Task[]}` (top-level only, ordered by position; include assignedTo, labels, section, _count) |
| PATCH | `/epics/:id` | `project:write` + ensureEpicVisible | any of title, description(nullable), status (TaskStatus), color, ownerId(nullable), startDate/dueDate (nullable, z.coerce.date), position (>=0) | `200 {...epic, owner, progress}` ; position -> transaction re-pack (clamped) |
| DELETE | `/epics/:id` | `project:write` + ensureEpicVisible | — | `204`; FK SetNull on tasks |
| POST | `/projects/:id/tasks` | existing (`task:write`) | + `epicId?: int|null` | 400 `epic_on_subtask` / `epic_not_found` |
| PATCH | `/tasks/:id` | existing | + `epicId?: int|null`; (after CONFLICT port) `expected.epicId` | as §1 rules |

Findings worth fixing during the port (CUST bugs, minor):
- `ownerId` is never validated: nonexistent id -> Prisma P2003 FK error on create (likely 500; INTERNAL `http/errors.ts:41-45` maps only P2025/P2002) and P2025 on PATCH connect (-> mapped 404, misleading). Owner may be any user incl. PENDING/inactive. Suggest a 400 `owner_not_found` check (UNVERIFIED runtime behaviour, read from code).
- Dates use `z.coerce.date()` — INTERNAL backend CLAUDE.md date contract (lib/dateBoundary.ts) should be checked by the implementor; CUST sections/tasks use the same coercion so it is consistent.

### 3.3 INTERNAL SA visibility on epic routes
- `ensureProjectVisible` (INTERNAL `backend/src/lib/visibility.ts:36-47`) uses `projectVisibilityFilter` (:21-30: tamId | saId | customer.tamId, `project:view-all` bypass). So an SA attached via `Project.saId` sees GET epic routes; SA role has `project:read` only (seed.ts:15-21) -> 403 on POST/PATCH/DELETE epics and on task epicId writes (no task:write). No code change needed; ADD an INTERNAL-only test: SA with saId sees `GET /projects/:id/epics` + `GET /epics/:id` (200), gets 403 on POST; SA without saId gets 404.
- After the MEMBERS port, CUST's `ensureProjectVisible` adds a `members` arm — epic routes inherit it with no edit (epics.ts untouched by af9a362). Members spec decision "SA not an owner" does not affect epics (epic writes are permission-gated, not owner-gated; CUST never calls `ensureProjectOwnerAccess` on epics).

## 4. Frontend

Method: `git format-patch -1 8b9fa3a` dry-run against INTERNAL working tree (`patch -p1 --dry-run`, `git apply --check`; nothing written). Result: 30 of 39 file patches apply cleanly; EVERY failure is caused by iTop/Help/Utilization context lines, not by INTERNAL divergence in epic-relevant code. The frontend view/component files apply at **zero offset** — INTERNAL's TaskFormModal, SolvroKanban, cards, ProjectList, ProjectDetail, SolvroGantt, exportExcel(+test), LabelChip are byte-identical to CUST's pre-Epics state in the hunk regions.

### 4.1 `grep -rn -i epic` CUST frontend/src (HEAD) — mention counts and origin
| File | hits | Origin commit(s) | Notes |
|---|---|---|---|
| `pages/views/ProjectEpics.tsx` (NEW, 560 @8b9fa3a / 564 HEAD) | 103 | 8b9fa3a; 489b0a4 (skeletons, `fmtDay`) | Epics tab |
| `lib/queries.ts` | 98 | 8b9fa3a (15 hunks); 25dbeec (live refresh comment/options); 489b0a4 | spine |
| `components/EpicPanel.tsx` (NEW, 371 @8b9fa3a / 359 HEAD) | 51 | 8b9fa3a; 489b0a4 (`fmtRange`, `TASK_STATUS_LABEL`) | `?epic=` panel |
| `pages/views/ProjectList.tsx` | 38 | 8b9fa3a; 489b0a4 | chip + filter |
| `components/TaskPanel.tsx` | 35 | 8b9fa3a (8 hunks); 2d9b0a8 (`epics` lookups for conflict dialog, HEAD L983); 489b0a4 | select + breadcrumb chip |
| `components/kanban-v2/SolvroKanban.tsx` | 27 | 8b9fa3a; 489b0a4; 25dbeec | filter |
| `components/TaskFormModal.tsx` | 25 | 8b9fa3a; 2d9b0a8 (`adopt.has("epicId")`, `epics` lookups HEAD L662); 489b0a4 | select |
| `lib/gantt/exportExcel.ts` / `.test.ts` | 24/24 | 8b9fa3a; 489b0a4 (11 lines) | Epic column |
| `components/EpicChip.tsx` (NEW, 30) | 11 | 8b9fa3a; 489b0a4 (dot + 14% tint, drops `pickContrast`) | |
| `components/kanban-v2/cards.tsx` | 10 | 8b9fa3a; 489b0a4 | chip |
| `pages/ProjectDetail.tsx` | 8 | 8b9fa3a | tab at L50; `epicPanelOpen` L83-89; `md:mr-[380px]` L164 |
| `lib/taskConflict.ts` / `.test.ts` | 8/7 | 2d9b0a8 CONFLICT | `epicId` in fields, form, patch, label "Epic", lookups.epics, formatConflictValue |
| `components/gantt-v2/SolvroGantt.tsx` | 5 | 8b9fa3a | `useProjectEpics` L32, L356-358; passes `epics` to export L897, deps L950 (spine: gantt-v2/) |
| `lib/activityText.ts` / `.test.ts` | 3/2 | 476288e ACTIVITY | FIELD_NOUN `epic`/`epicId` -> "epic"; test "changed the epic of …" |
| `App.tsx` | 2 | 8b9fa3a | import L21, `<Route path="epics">` L62 |
| `lib/safeRedirect.test.ts` | 2 | fc02e6f SIGNIN | `?epic=3&task=42` preserved |
| `lib/paletteActions.ts` | 1 (comment) | 489b0a4 | merges query string so `?task=`/`?epic=` panels survive |
| `lib/helpContent.ts` | 1 | 8b9fa3a (file from 5caef7f Help) | "Epics: group top-level tasks…" under "Project tabs" (HEAD L119) |
| `lib/contrast.ts` (NEW) | 1 | 8b9fa3a | `pickContrast` extracted from LabelChip; DEAD CODE at CUST HEAD (no importers after 489b0a4) |
| `kanban-v2/adapter.test.ts`, `commitMapper.test.ts` | 1/1 | 8b9fa3a | `epicId: null` in task factories |
| `components/DateField.tsx`, `reui/gantt/gantt-nav.tsx` | — | false positives (`GanttDatePicker` matches /epic/) | ignore |

Not touched by Epics in CUST (verified grep, 0 hits): CommandPalette, routeMeta (doesn't exist in either repo), INTERNAL `lib/navCommands.ts` (has no per-project tab commands — nothing to add), Tasks.tsx, global search, Overview/Portfolio, PDF export, Timeline, gantt geometry.

### 4.2 New files (port the 8b9fa3a version, not HEAD, unless the UX pass already landed)
- `frontend/src/components/EpicChip.tsx` @8b9fa3a imports `@/lib/contrast` (`pickContrast`). Props `{epic: Pick<Epic,'id'|'title'|'color'>, compact?, className?}`; `data-testid="epic-chip"`, `data-epic-id`, `title` tooltip, `max-w-[160px]` truncate.
- `frontend/src/lib/contrast.ts` (14 lines) + LabelChip hunk (move `pickContrast` out) — applies clean.
- `frontend/src/components/EpicPanel.tsx` @8b9fa3a imports: `InlineDateRangeEditor` (spine consumer — no edit to it), `TaskStatusChip`, `reui/alert`, `ApiError`, `hasPermission/useAuth`, `dayFromIso/dayToDate` (lib/dateField), `useCreateTask/useEpic/useUpdateEpic/useUsers`, `UpdateEpicInput`, `TaskStatus`. ALL exist in INTERNAL (verified: StatusChip.tsx:66, lib/auth.tsx:59/185, lib/dateField.ts:55/82/100, queries.ts:599/1124, reui/alert.tsx).
- `frontend/src/pages/views/ProjectEpics.tsx` @8b9fa3a imports `useProjectContext` (INTERNAL ProjectDetail.tsx:256 ✓), `ConfirmModal` (default tone; INTERNAL Tone = primary|warning ✓ — the HEAD version uses `confirmTone="danger"` which INTERNAL lacks), `EpicPanel`, `Alert`, `TaskStatusChip`, `ApiError`, auth, `dayFromIso/formatDisplay`, `SECTION_COLOR_PRESETS` (INTERNAL lib/gantt/palette.ts:198 ✓), epic hooks.
- HEAD versions additionally need UX-pass helpers absent from INTERNAL: `components/skeletons` (`CardGridSkeleton`, `TableSkeleton`), `lib/formatDate` (`fmtDay`, `fmtRange`), `lib/labels` (`TASK_STATUS_LABEL`), `ConfirmModal confirmTone="danger"`, `text-meta` token (index.css). => Port @8b9fa3a; the UX-pass spec then applies 489b0a4's epic-file hunks (EpicChip 17, EpicPanel 30, ProjectEpics 40 lines).

### 4.3 Shared-file edits (8b9fa3a) vs INTERNAL
| File | 8b9fa3a hunks | INTERNAL apply result | Difficulty |
|---|---|---|---|
| `lib/queries.ts` (spine) | 15: Epic/EpicDetail types (after Section), `Task.epicId`, queryKeys `projectEpics(id)=["projects",id,"epics"]`, `epic(id)=["epics",id]`; `UpdateTaskInput.epicId`; `reorderTasksLocally` clears epicId on re-parent; `useUpdateTask` optimistic clears epicId when parentTaskId set, ctx `prevEpicId`, invalidates projectEpics + old/new epic; `useDeleteTask` ctx epicId + invalidations (fallback `["epics"]`); `CreateTaskInput.epicId` + invalidation; `useDuplicateTask` + `useDuplicateSection` invalidations; new `useProjectEpics/useEpic/useCreateEpic/useUpdateEpic/useDeleteEpic` (+`CreateEpicInput/UpdateEpicInput`; delete also invalidates projectTasks + `["tasks"]`) | 14/15 apply (offsets +9..-40); hunk 4 (`UpdateTaskInput`) fails on `itopTicketRef` context -> add `epicId?: number|null` by hand (INTERNAL ~L979-990) | S |
| `components/TaskPanel.tsx` | 8: imports (EpicChip, useProjectEpics), epics query, `editingEpic` state, `taskEpic`/`parentEpic`/`taskEpicPending`, breadcrumb parent chip, Epic row in meta grid | 6/8 apply (offset -13); hunk 2 (import list containing `useItopStatus`) and hunk 8 (Epic row anchored before `{itopConfigured && …}` block) fail on iTop context -> hand-place import and put the Epic row after the Section/Parent row where INTERNAL's grid ends (CUST @8b9fa3a L638-692) | S-M |
| `components/TaskFormModal.tsx` | Epic select; disabled + cleared when parent chosen; `epicId` in create/update payloads | clean, 0 offset | S |
| `kanban-v2/SolvroKanban.tsx` | `filterEpicId` ("" all / null none / id), `epicMap`, predicate in render-only `derivedColumns`, badge count, select in popover, clear; `epicMap` to TaskCard | clean | S |
| `kanban-v2/cards.tsx` | `epicMap?` prop, EpicChip in labels row | clean | S |
| `kanban-v2/adapter.test.ts`, `commitMapper.test.ts` | `epicId: null` in factories | FAIL on `itopTicketRef: null` context -> add `epicId: null` after `_count` | trivial |
| `pages/views/ProjectList.tsx` | epicMap, Filter button/popover (Epic select), `isTaskVisible`, `visibleGrouped` (render-only; drag math still on unfiltered `tasks`), EpicChip in desktop + mobile rows | clean, 0 offset | M (largest hunk set, ~15) — treat with spine care (drives reorder) |
| `pages/ProjectDetail.tsx` | tab `{to:"epics",label:"Epics"}` after Gantt; `useLocation`; `epicPanelOpen` (only on `/epics` route) -> `md:mr-[380px]` | clean | S |
| `App.tsx` | import + `<Route path="epics">` | import hunk fails (context: `Utilization` import, CUST-only) -> hand-add; route hunk applies (+2) | trivial |
| `gantt-v2/SolvroGantt.tsx` (spine) | `useProjectEpics`, pass `epics` to Excel export | clean | S |
| `lib/gantt/exportExcel.ts` + test | "Epic" column after Section; subtasks show parent's epic; 3 new unit tests | clean | S |
| `components/LabelChip.tsx` + `lib/contrast.ts` | extract `pickContrast` | clean | trivial |
| `lib/helpContent.ts` | one bullet | file absent in INTERNAL (Help not ported) | defer to Help spec |

### 4.4 Later-commit epic hunks owned by OTHER specs (apply as-is if Epics lands first)
- CONFLICT 2d9b0a8: `backend/src/routes/tasks.ts` expectedTaskSchema `epicId` (L44), findStaleFields `"epicId"` (L176), `current`->`cur` rename inside the epic block (L425); `frontend/src/lib/taskConflict.ts` L25, 44, 199, 235, 255, 266, 328-329; `taskConflict.test.ts` 7 lines; TaskFormModal `adopt.has("epicId") -> setEpicId` + `epics` passed to conflict dialog lookups; TaskPanel `epics` lookups (HEAD L983); `backend/test/taskStaleWrite.test.ts:150`.
- ACTIVITY 476288e: `backend/src/lib/activity.ts` L89 (`TaskSnapshot.epicId`), L113 (diff scalar); `frontend/src/lib/activityText.ts` L73-74 (FIELD_NOUN), L113 comment; `activityText.test.ts:116-117`. NOTE: CUST records NO activity for epic create/rename/delete (`recordActivity` absent from routes/epics.ts and the epic routes in projects.ts; ActivityEvent entityTypes used: project, member, task, risk, note). Only a task's epic change is logged ("changed the epic of X").
- LIVE 25dbeec: queries.ts `useLiveRefresh` options on `useProjectEpics`/`useEpic` (comment "List/Kanban/Gantt/Epics/detail views…").
- SIGNIN fc02e6f: `safeRedirect.test.ts:7-8` `?epic=` case.
- UXPASS 489b0a4: EpicChip tint, EpicPanel/ProjectEpics skeleton+format helpers, `text-meta` on chips, LabelChip tint (makes contrast.ts dead), `paletteActions.ts` comment, `backend/scripts/seed-demo.ts` epics.
- HELP 5caef7f(+8b9fa3a line): helpContent "Epics:" bullet.
- MEMBERS af9a362 / GUEST eadc065: no epic lines (verified: neither commit's diff mentions epic). Guest share page (PublicShare) does not show epics.

## 5. Tests

Backend vitest (all apply clean on INTERNAL):
- NEW `backend/test/epics.test.ts` — 29 tests in 6 describes: create/list (5: append order, defaults TODO/#94a3b8, 404 invisible, 403 STAKEHOLDER create, append after deletes), PATCH fields (3), PATCH position re-pack (5 incl. 404/403), GET detail (4: progress + ordered tasks, DONE subtask not counted, list progress excludes subtasks, 404), DELETE (3: 204 + SetNull keeps data, 404, 403), task epicId validation (9: cross-project create/update 400 epic_not_found, same-project ok, epicId+parentTaskId create 400, epicId on existing subtask 400, epicId returned on GET /projects/:id/tasks and GET /tasks, re-parent clears, parentTaskId+epicId update 400, null clears). Uses `createProject` via prisma with `tamId` only (INTERNAL Project.saId optional ✓).
- `backend/test/taskDuplicate.test.ts` +1 test ("keeps epicId on the copy") + `createEpic` helper.
- INTERNAL-only additions (recommended): SA visibility test (saId SA: 200 on GET list/detail, 403 on POST/PATCH/DELETE epic and on task epicId PATCH; non-linked SA 404); `sectionDuplicate.test.ts` case that a duplicated section keeps epic links (CUST relies on duplicate.ts, untested at section level).
- Later specs: `taskStaleWrite.test.ts:150` (CONFLICT) and activity tests reference epicId.

Frontend vitest:
- `lib/gantt/exportExcel.test.ts` +3 tests (Epic column: task with epic, subtask inherits parent's epic, empty cell).
- `kanban-v2/adapter.test.ts`, `commitMapper.test.ts`: factory gains `epicId: null` (hand-apply).
- Any other frontend code/test constructing a full `Task` literal must add `epicId` — UNVERIFIED (tsc not run); `lib/queries.reorder.test.ts` (INTERNAL-only) builds no Task literals.

E2E (Playwright, both projects desktop + mobile):
- `e2e/fixtures/seed.ts`: + `SeededEpic` + `createEpic(base, token, projectId, {title, color?, description?})` (applies at +6).
- NEW `e2e/tests/epics.spec.ts` — 1 test: create, rename, story progress (Add story… then DONE via `PATCH /api/tasks/:id`), delete keeps the task.
- NEW `e2e/tests/task-epic-select.spec.ts` — 4 tests: set epic on top-level task + chip survives reload; select absent on subtask; parent's epic chip in subtask breadcrumb; create via modal with epic carries chip.
- `e2e/tests/kanban-dnd.spec.ts` +1 test G11 (chip on assigned card only, filter narrows, filtered drag persists after reload) (+86/-? lines incl. helpers).
- `e2e/tests/list-dnd.spec.ts` +1 test (chip on tagged row, filter narrows/clears) + `apiPatchTask`, `closeFilterPopover` helpers.
- Total new e2e: 7 tests x 2 projects. All patch-apply clean. Known fixture-pollution caveat (CUST ISSUES.md entry, hunk applies clean to INTERNAL docs/ISSUES.md): epics.spec leaves an orphan "story" in the worker-shared seeded project; task-epic-select scopes chip locators to panel/drawer for this reason.
- Later: UX pass changed label text ("In Progress" -> "In progress", "Active" -> "In progress") in kanban/list specs — not epic-related.

## 6. INTERNAL-specific

- **Pipeline won-deal handoff** (`backend/src/routes/opportunities.ts:1076-1180` POST `/:id/handoff`; `frontend/src/lib/handoffDefaults.ts` `computeHandoffDefaults`): creates a Project only (field-for-field mirror of POST /projects), no tasks/sections. No epic awareness required. Optional future: seed one epic per OpportunityItem on handoff — NOT in CUST, open question.
- **Pipeline module** pages (Pipeline*, OpportunityDetail, DealCard): no task/epic surfaces. If ACTIVITY is "extended to Pipeline", that is independent of epics.
- **Helpers CUST epic code imports that INTERNAL lacks**:
  - @8b9fa3a: NONE in code (all imports verified present). Only missing: `lib/helpContent.ts` (Help page, 5caef7f) and iTop context lines (`itopTicketRef`, `useItopStatus`, `itopConfigured`) — context only.
  - @HEAD (if someone copies HEAD files instead): `components/skeletons/*` (UX pass), `lib/formatDate` (`fmtDay`, `fmtRange`, UX pass) — INTERNAL has `lib/dateField` `formatDisplay`/`dayFromIso` instead; `lib/labels` (`TASK_STATUS_LABEL`, UX pass) — INTERNAL has labels inline in StatusChip; `ConfirmModal confirmTone="danger"` — INTERNAL has primary|warning; `text-meta` CSS role (index.css, UX pass) — INTERNAL uses `text-[11px]`; `lib/taskConflict` (CONFLICT) ; `useAssigneeMembership` (MEMBERS, TaskPanel only); `TaskTicketField` (iTop, TaskPanel only).
  - Backend: none (`HttpError`, `validate`, `requirePermission`, `ensureProjectVisible`, taskOrdering exports all present).
- **SA visibility**: see §3.3 — read-only via `saId`, no code change.
- **Plan citation**: code comments cite `docs/archive/plans/epics-spec.md` — copy CUST's archived spec into INTERNAL `docs/archive/plans/epics-spec.md` in the same PR (INTERNAL citation rule: archive path from the start). Also the 8b9fa3a hunk to `docs/plans/epics-spec.md` (a 1-line status edit) is moot.

## 7. Spine-list hits and design-system notes

Spine (gates.sh:207) touched by this port -> instant opus review for: `backend/prisma/schema.prisma`, `backend/prisma/migrations/<ts>_epics/`, `backend/src/routes/tasks.ts`, `backend/src/routes/projects.ts`, `frontend/src/lib/queries.ts`, `frontend/src/components/gantt-v2/SolvroGantt.tsx`. NOT hit: `kanban-v2/adapter.ts`/`commitMapper.ts` (only their tests), `lib/visibility.ts`, `http/auth.ts`, `reui/`, `lib/export/` (INTERNAL has no such dir; Excel export lives in `lib/gantt/exportExcel.ts`; it never touches ProjectNote so the INTERNAL-notes guardrail is unaffected), date-contract files (EpicPanel CONSUMES `InlineDateRangeEditor` without editing it).

Design:
- Epic colours are user data (hex), not tokens. Default `#94a3b8` = Section default; picker reuses `SECTION_COLOR_PRESETS` (`frontend/src/lib/gantt/palette.ts:198`). No new `index.css` tokens in 8b9fa3a (verified: 8b9fa3a does not touch index.css; 489b0a4 adds `text-meta`).
- Chip: @8b9fa3a solid colour bg + `pickContrast` text (same as INTERNAL LabelChip today). After UX pass: 8px dot + `color-mix(in srgb, <c> 14%, transparent)` + `text-on-surface` for both LabelChip and EpicChip (CUST DESIGN.md L345). Guardrail "StatusChip/PriorityBadge/LabelChip stay bespoke, never rebased on reui/badge": EpicChip follows the same bespoke pattern — compliant either way. Status uses existing `TaskStatusChip` (no new tones).
- DESIGN.md hunk from 8b9fa3a: add "Epic detail panel | EpicPanel.tsx" row to the elevation/surface table (after "Task detail panel", INTERNAL DESIGN.md:291) and append `ProjectEpics.tsx`'s `ColorDot` popover to the Popovers row (:294). The CUST hunk fails only because its context includes the iTop "Ticket detail panel" row — hand-apply. Docs-keeper trigger: DESIGN.md text change only (no index.css) — orchestrator can apply inline.
- Shadows: panel uses the sanctioned `shadow-overlay` (ColorDot popover is a clone of TreeCells `SectionColorCell`).

## 8. Ordering, task breakdown, open questions

### 8.1 Ordering vs ACTIVITY / MEMBERS / CONFLICT

CUST order: 5caef7f Help -> **8b9fa3a Epics** -> 489b0a4 UX pass -> … -> af9a362 Members -> 2d9b0a8 Conflict -> 476288e Activity/Notifications/@mentions -> eadc065 Guest links. The Epics commit contains zero ACTIVITY/MEMBERS/CONFLICT code; those later commits each carry their own small epic hunks (§4.4).

**(a) Epics lands BEFORE them (RECOMMENDED — mirrors CUST, least rework)**
- Strip from the Epics port: nothing feature-wise. Only resolve 9 context-only hunk failures caused by iTop/Help/Utilization lines that INTERNAL doesn't have (schema hunks 3-4, duplicate.ts hunk 1, tasks.ts hunk @39 under `git apply`, App.tsx import, TaskPanel hunks 2 & 8, queries.ts hunk 4, adapter/commitMapper test factories, DESIGN.md row, CHANGELOG). Skip `helpContent.ts` (absent).
- Follow-up hunks owned by later specs, which they apply AS-IS from CUST (do not strip):
  - CONFLICT (2d9b0a8): `expectedTaskSchema.epicId`, `findStaleFields "epicId"`, `taskConflict.ts` epicId field/label "Epic"/`lookups.epics`/`formatConflictValue("epicId")`, TaskFormModal `adopt.has("epicId")`, TaskPanel+TaskFormModal pass `epics` to the conflict dialog, `taskStaleWrite.test.ts:150`.
  - ACTIVITY (476288e): `TaskSnapshot.epicId`, diff scalar `"epicId"`, `activityText` FIELD_NOUN `epic`/`epicId`, test "changed the epic of …". (Epic entity CRUD logging is NOT in CUST — new decision if wanted, see Q2.)
  - HELP (5caef7f + 8b9fa3a bullet): add the "Epics: …" bullet to helpContent "Project tabs".
  - UX PASS (489b0a4): restyle EpicChip/LabelChip (tint), EpicPanel/ProjectEpics skeletons + fmtDay/fmtRange/TASK_STATUS_LABEL, `text-meta`; `seed-demo.ts` epics; delete or keep now-dead `lib/contrast.ts`.
  - LIVE (25dbeec): `useLiveRefresh` on epic queries. SIGNIN (fc02e6f): `?epic=` safeRedirect test.
  - MEMBERS / GUEST: no epic hunks.
- Bonus: frontend sibling plans mark ProjectList/TaskPanel/TaskFormModal/kanban files "TAKE-CUST+0" (copy HEAD file). Those HEAD files contain epic code; with Epics already in, a whole-file take compiles with no stripping.

**(b) Epics lands AFTER them**
- Each earlier spec must STRIP its epic lines (they would not compile: `current.epicId`/`Prisma.TaskSelect.epicId` don't exist without the column):
  - CONFLICT: remove `epicId` from `expectedTaskSchema` (CUST tasks.ts:44) and `findStaleFields` list (:176); taskConflict.ts L25/44/199/235/255/266/328-329; taskConflict.test lines; TaskFormModal/TaskPanel `epics` lookups + `adopt.has("epicId")`; taskStaleWrite.test:150 `epicId: null`.
  - ACTIVITY: remove `epicId` from `TaskSnapshot` (activity.ts:89) and scalar list (:113). activityText FIELD_NOUN entries are inert strings — may stay.
  - Any HEAD-file whole copies (TaskPanel, TaskFormModal, ProjectList, SolvroKanban, cards, SolvroGantt, App.tsx, ProjectDetail) must drop ~40 epic hunks.
- Then the Epics port re-adds all of the above, and its own 8b9fa3a hunks no longer apply at zero offset (they would land on post-UX/conflict/activity code: TaskPanel 83+ changed lines, ProjectList 93, SolvroKanban 46, queries 233 in 489b0a4 alone) — effectively a re-port from HEAD by hand.
- Cost: roughly 2x the Epics frontend effort plus strip work in 2-4 other specs. Not recommended.

Recommendation: **(a)**, slotted as early as possible — ideally first in the collaboration wave (before UX pass, Members, Conflict, Activity). Position relative to iTop/Help doesn't matter much (context-only conflicts either way); if iTop/Help are ported first, the 8b9fa3a patch applies nearly verbatim.

### 8.2 Tasks (source: CUST 8b9fa3a unless noted)

| # | Task | Files | Deps | Size | Spine | Acceptance |
|---|---|---|---|---|---|---|
| E1 | Backend: model, fresh migration, lib/epics.ts, routes/epics.ts, mount, task create/update epicId, duplicate copy | `backend/prisma/schema.prisma`, `backend/prisma/migrations/<fresh>_epics/`, `backend/src/lib/epics.ts`, `backend/src/routes/epics.ts`, `backend/src/app.ts`, `backend/src/routes/projects.ts`, `backend/src/routes/tasks.ts`, `backend/src/lib/duplicate.ts`, `backend/test/epics.test.ts`, `backend/test/taskDuplicate.test.ts`, NEW SA test (e.g. in epics.test.ts), `backend/CLAUDE.md` (shadow-DB trap) | — | M | yes (instant review) | 29+1 CUST tests + SA tests green on isolated DB; backend tsc clean; generated SQL == §2.2; list = 1 findMany + 1 groupBy |
| E2 | Frontend data layer | `frontend/src/lib/queries.ts`, `kanban-v2/adapter.test.ts`, `kanban-v2/commitMapper.test.ts` | contract only (parallel with E1) | S | yes (queries.ts) | types/keys/5 hooks; every task mutation invalidates projectEpics (+epic detail); frontend typecheck clean |
| E3 | Epics tab + EpicPanel + EpicChip | NEW `components/EpicChip.tsx`, `lib/contrast.ts`, `components/LabelChip.tsx`, NEW `components/EpicPanel.tsx`, NEW `pages/views/ProjectEpics.tsx`, `App.tsx`, `pages/ProjectDetail.tsx`, `e2e/fixtures/seed.ts`, NEW `e2e/tests/epics.spec.ts` | E1, E2 | M | no | epics.spec green desktop+mobile; `?epic=` deep link opens panel; SA sees tab read-only (no create/delete controls — `hasPermission("project:write")`) |
| E4 | Task surfaces | `components/TaskPanel.tsx` (hand-place 2 hunks), `components/TaskFormModal.tsx`, NEW `e2e/tests/task-epic-select.spec.ts` | E3 (EpicChip) | S-M | no | 4 e2e green; select hidden on subtasks; drawer clears epic when parent chosen |
| E5 | Kanban chip + filter | `kanban-v2/cards.tsx`, `kanban-v2/SolvroKanban.tsx`, `e2e/tests/kanban-dnd.spec.ts` (G11) | E3 | S | no (adapter/commitMapper untouched) | G11 green; drop math unaffected under filter |
| E6 | List chip + filter | `pages/views/ProjectList.tsx`, `e2e/tests/list-dnd.spec.ts` | E3 | S-M | no (treat with care: drives reorder) | list-dnd epic test green; drag math on unfiltered tasks |
| E7 | Excel Epic column | `lib/gantt/exportExcel.ts`, `.test.ts`, `components/gantt-v2/SolvroGantt.tsx` | E2 | S | yes (gantt-v2) | 3 unit tests green; PDF untouched |
| E8 | Docs | `CHANGELOG.md` (reworded public entries — CUST lines 134-149 as template, minus process words), `docs/DESIGN.md` (2 rows), `docs/ISSUES.md` (fixture-pollution note), copy `docs/archive/plans/epics-spec.md` | all | S | no | gates CHANGELOG presence; citations resolve |

Waves (serialize frontend `tsc`, lock-file poll): W1 = E1 ∥ E2; W2 = E3 ∥ E7; W3 = E4 ∥ E5 ∥ E6 (disjoint files); E8 at integration by orchestrator. One PR, branch `feat/epics` off `origin/develop`.

Estimate: ~3,100 changed lines, ~75% patch-applicable verbatim; 8 tasks (1 M backend, 1 M UI, rest S). Roughly 1-1.5 orchestrated days including two instant reviews and one phase review.

### 8.3 Blockers / risks
- None hard. Migration timestamp must be fresh (§2.3). Dev-DB shadow trap (backend/CLAUDE.md hunk) — follow it.
- iTop context collisions only cosmetic; the iTop spec must re-place `itopTicketRef` next to `epicId` in schema/duplicate/queries/test factories if it lands after.
- e2e fixture pollution (shared seeded project) slightly worsens.
- Owner validation gap (§3.2) — decide fix-now vs port-as-is.

### 8.4 Open questions for the user
1. Confirm ordering (a): Epics ships before UX pass / Members / Conflict / Activity.
2. Activity log "extended to Pipeline": should epic create/rename/status/delete also be logged (new `entityType: "epic"`)? CUST logs only a task's epic change.
3. Should SA users be able to create/edit epics on projects where they are `saId`? Today SA lacks `project:write` -> read-only (CUST-equivalent behaviour).
4. Epic owner picker: any user (CUST, `/users`) or restrict to project TAM/SA/members once Members lands? Fix the unvalidated `ownerId` (400) during the port?
5. Port the 8b9fa3a chip style (solid + contrast text, matches INTERNAL LabelChip today) and let the UX pass restyle, or go straight to the tinted style?
6. Won-deal handoff: create epics from OpportunityItems automatically? (Default: no; not in CUST.)
7. Add epics to INTERNAL `db:seed`, or leave to the UX-pass `seed-demo.ts` port?
8. CUST spec §9 Jira questions (story points, issue types, Jira import, epic as Kanban/Gantt row) remain unanswered upstream — out of scope for v1?

## 9. Unverified items
- No tsc/vitest/playwright run (read-only). Zero-offset application is from `patch --dry-run`, not compile.
- Prisma behaviour for out-of-order migration names (§2.3).
- Runtime status codes for bad `ownerId` (§3.2) inferred from code.
- Whether any INTERNAL-only frontend file constructs a full `Task` literal needing `epicId` (tsc will tell).
