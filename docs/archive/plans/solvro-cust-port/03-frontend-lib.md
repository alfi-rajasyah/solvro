# Frontend lib / hooks / app-shell porting plan (CUST -> INTERNAL)

Scope: `frontend/src/lib/**`, `frontend/src/hooks/**`, `frontend/src/App.tsx`, `frontend/src/index.css`, `frontend/vite.config.ts`, `frontend/nginx.conf`, `frontend/CLAUDE.md`.
INTERNAL = `/home/solvro-internal/solvro` (target). CUST = `/home/solvro-internal/solvro-cust` (source).
Research only. Nothing in either repo was edited, built, type-checked or run. Facts come from `diff`, `git log/blame/show`, `grep`, and `patch --dry-run` (reads only). Items not verified that way are marked **unverified**.

## 0. Method, fork base, and the facts that decide the merge

- Fork base: INTERNAL commit `9f5fc20`. CUST's root commit `10c0b16` ("Initial import") is byte-identical to `9f5fc20` for every file in scope that I checked (`queries.ts`, `auth.tsx`, `navCommands.ts`, `tableSort.ts`, `App.tsx`, `vite.config.ts`, `queries.reorder.test.ts`) — `frontend/CLAUDE.md` differs at the root (CUST edited it in the import). So `git -C solvro-cust diff 10c0b16 HEAD` is CUST's own change, and `git -C solvro diff 9f5fc20 HEAD` is INTERNAL's own change.
- **INTERNAL changed only 5 in-scope files after the fork:** `frontend/CLAUDE.md` (+14), `lib/pipelineFormat.ts`, `lib/pipelineFormat.test.ts`, `lib/queries.reorder.test.ts`, `lib/queries.ts` (+159/-29 — **every hunk is in the imports block or the Pipeline section**, commit `abfa5dd` "Pipeline frontend: 6-stage types, close/reopen hooks…"). Every other in-scope file in INTERNAL equals the fork base, so for those the whole diff is CUST's change; only the hunks CUST made for PIPELINE-REMOVAL / SA-REMOVAL need to be skipped.
- CUST commits touching scope, with the tag I assign (CUST CHANGELOG + commit bodies):

| CUST commit | Date | Subject | Tag(s) |
|---|---|---|---|
| `d6a17cc` | 09-21 | Allow Vite dev server behind a tunnel via VITE_ALLOWED_HOSTS | OTHER (dev infra) |
| `1a3e905` | 09-22 | Remove the Pipeline module and the Solution Architect project owner | **PIPELINE-REMOVAL + SA-REMOVAL (do not port)** |
| `9467f9b` | 09-22 | Add the Admin iTop tab | ITOP |
| `33aa5ca` | 09-22 | iTop ticket strip on the Daily Review operations card | ITOP |
| `065f078` | 09-23 | Replace Work Logs with the Utilization page | UTIL |
| `ebe58e2` | 09-23 | Webhook card + task ticket field | ITOP |
| `ed35482` | 09-23 | Ticket panel, action sheets, token settings | ITOP |
| `0f16e79` | 09-23 | Ticket Board view, New-ticket sheet, strip quick actions | ITOP |
| `4657f14` | 09-23 | Ticket timer and create-from-task | ITOP |
| `933d3d0` | 09-24 | Read iTop times in the iTop server's timezone | ITOP |
| `2d6a4c8` | 09-24 | Stop admin pages bouncing to Overview after sign-in | SIGNIN / NOACCESS (`userVerified`) |
| `5caef7f` | 09-24 | Add an in-app Help page | HELP |
| `8b9fa3a` | 09-25 | Add Epics | EPIC |
| `489b0a4` | 09-29 | Professional UI pass (labels, dates, health, tiles, badges, sidebar groups, route titles, palette actions, dialog focus, skeletons, `text-meta`) | UIPASS + HEALTH + CUSTOMERS + OVERVIEW + TASKVIEWS + SIDEBAR + PALETTE + SKELETON (one mega-commit) |
| `25dbeec` | 09-29 | Refresh project data on focus and every 30 seconds | LIVE |
| `3a19e75` | 09-29 | Copy link buttons | COPYLINK |
| `fc02e6f` | 09-29 | Keep deep links through sign-in | SIGNIN |
| `af9a362` | 09-30 | Add project members | MEMBERS |
| `2d9b0a8` | 09-30 | Warn before overwriting someone else's task edit | CONFLICT |
| `476288e` | 09-30 | Activity log, notifications, @mentions | ACTIVITY + NOTIF + MENTION |
| `eadc065` | 09-30 | Read-only guest links | SHARE |

- **Dry-run proof for `queries.ts`:** `git -C solvro-cust diff 1a3e905 HEAD -- frontend/src/lib/queries.ts | patch --dry-run -p1 -d solvro` → **47 of 48 hunks apply cleanly** (offsets 17-20 lines, no fuzz needed); the only failure is hunk #6 (`ProjectSummary`/`ProjectDetail` types, CUST L173-207) because INTERNAL still has the `saId`/`sa` lines there. That single hunk is a trivial hand-merge (keep `saId`/`sa`, add `health`, add `avatarUrl?` to `tam`, add `tamId?` to `customer`).

---

## 1. `frontend/src/lib/queries.ts` (spine file)

Sizes: INTERNAL 3053 lines, CUST 4402 lines. CUST vs base: +2082/-603 (of which `1a3e905` alone is +6/-569). INTERNAL vs base: +159/-29 (Pipeline only).

### 1.1 CUST commits that touched `queries.ts` (numstat)

| Commit | Tag | +/- |
|---|---|---|
| `1a3e905` | PIPELINE-REMOVAL / SA-REMOVAL | +6 / -569 |
| `9467f9b` | ITOP (admin + read hooks) | +385 / -0 |
| `33aa5ca` | ITOP (daily strip) | +56 / -0 |
| `065f078` | UTIL | +74 / -0 |
| `ebe58e2` | ITOP (ticket ref, webhook) | +79 / -0 |
| `ed35482` | ITOP (ticket panel, token) | +164 / -1 |
| `0f16e79` | ITOP (board, create ticket) | +122 / -6 |
| `4657f14` | ITOP (time log) | +172 / -5 |
| `933d3d0` | ITOP (tz) | +8 / -0 |
| `8b9fa3a` | EPIC | +215 / -7 |
| `489b0a4` | UIPASS/HEALTH/CUSTOMERS/OVERVIEW/TASKVIEWS/SIDEBAR | +218 / -15 |
| `25dbeec` | LIVE | +67 / -0 |
| `af9a362` | MEMBERS | +93 / -2 |
| `2d9b0a8` | CONFLICT | +110 / -6 |
| `476288e` | ACTIVITY/NOTIF/MENTION | +214 / -3 |
| `eadc065` | SHARE | +111 / -1 |

### 1.2 Hunk-by-hunk walk: every export / helper CUST added or changed

Line numbers are CUST `frontend/src/lib/queries.ts` lines (from `git blame` / `grep -n`). "Commit" is the CUST commit that introduced the line (blame). Endpoints are as called by the hook (all under `/api`).

#### Imports / module plumbing

| Item | Tag | CUST change | Note for INTERNAL |
|---|---|---|---|
| `import { useCallback, useSyncExternalStore } from "react"` (L1) | LIVE | added | needed by `useLiveRefresh` |
| `useInfiniteQuery`, `InfiniteData`, `QueryClient` type imports (L2-10) | ACTIVITY/NOTIF | added | |
| `apiRequestWithHeaders` import (L11) | TASKVIEWS (`489b0a4`) | added | requires the `api.ts` hunk (§2) |
| `shouldPauseRefresh, subscribeDragActivity` from `./dragActivity` (L14) | LIVE | added | requires CUST-only `lib/dragActivity.ts` |
| `labelsFromIds, parseStaleWrite, SupersededWriteError, isSupersededWrite, TaskExpected` from `./taskConflict` (L15-21) | CONFLICT | added | requires CUST-only `lib/taskConflict.ts` (which itself imports `labels.ts`, `formatDate.ts`) |
| `ownerOf` + Pipeline types from `./pipelineFormat` (INTERNAL L6-14) | PIPELINE-REMOVAL | **removed in CUST** | **KEEP** (INTERNAL-only) |

#### Types

| Type | Tag | Commit | CUST change | Endpoint it mirrors | Note for INTERNAL |
|---|---|---|---|---|---|
| `UserSummary.active: boolean`, `.avatarUrl: string \| null` (L41-43) | MEMBERS | `af9a362` | added, **required** | `GET /users` | Backend `/users` must return both. INTERNAL-only fixture `lib/handoffDefaults.test.ts` `makeUser()` (L19-25) builds a `UserSummary` without them → **typecheck break**; add `active: true, avatarUrl: null`. Pipeline user pickers (`OpportunityFormModal.tsx` L25 `useUsers()`, `handoffDefaults.ts` SA eligibility L56) should start filtering `active` (CUST convention: "pickers filter them out"). |
| `Epic`, `EpicDetail` (L69-91) | EPIC | `8b9fa3a` | added | `GET /projects/:id/epics`, `GET /epics/:id` | copy |
| `CustomerSummary.health?` + `CustomerHealth` (L103-118) | CUSTOMERS/HEALTH | `489b0a4` | added (optional) | `GET /customers?today=` | copy |
| `ProjectHealth` (L161-172) | HEALTH | `489b0a4` | added | `GET /projects`, `/projects/:id`, `/customers/:id` | copy |
| `ProjectSummary`: `saId`, `sa` | SA-REMOVAL | `1a3e905` | **removed** | | **KEEP** `saId: number \| null` (INTERNAL L110) and `sa` (L120) |
| `ProjectSummary.health?` (L191) | HEALTH | `489b0a4` | added | | the only hunk that fails to auto-apply (sits next to the `sa` lines) — hand-merge |
| `ProjectDetail`: `sa` with email | SA-REMOVAL | `1a3e905` | **removed** | | **KEEP** (INTERNAL L127) |
| `ProjectDetail.health?: ProjectHealth & { slipDays }` (L196) | HEALTH | `489b0a4` | added | `GET /projects/:id?today=` | |
| `ProjectDetail.tam.avatarUrl?` (L197), `.customer.tamId?` (L199) | MEMBERS | `af9a362` | added (optional) | | `customer.tamId` feeds `ownerAccess.canOwnProject`. Consider also `sa.avatarUrl?` if the header shows the SA avatar (**unverified**, UI choice). |
| `ProjectMember` (L209-219) | MEMBERS | `af9a362` | added | `GET /projects/:id/members` | Doc says "Members have the same access as the TAM". The SA is **not** a member and is not in this list (backend decision; see §3 `ownerAccess`/`projectMembers`). |
| `ActivityEntityType` (L220-227) | ACTIVITY (+SHARE adds `"share_link"`) | `476288e`/`eadc065` | added | | **Extend for Pipeline** (user decision: activity log extended to Pipeline) — e.g. `"opportunity"`; `activityText.ts` needs a matching `case` (§3). Union is closed, so a backend that emits a new type before the frontend learns it is still rendered by `activityText`'s default branch (it "tolerates any shape"). |
| `ActivityAction`, `ActivityEvent`, `ActivityPage` (L228-260) | ACTIVITY | `476288e` | added | `GET /projects/:id/activity` | Pipeline activity is per-opportunity, not per-project; a Pipeline activity feed probably needs its own endpoint/hook (new work, not a port). |
| `ShareLink`, `CreatedShareLink`, `PublicPhaseStatus`, `PublicShare` (L262-295) | SHARE | `eadc065` | added | `/projects/:id/share-links`, `/public/share/:token` | copy |
| `Task.epicId: number \| null` (L~316) | EPIC | `8b9fa3a` | added, **required** | all task payloads | every hand-built `Task` fixture needs it (CUST fixtures already have it) |
| `Task.itopTicketRef: string \| null` (L~327) | ITOP | `ebe58e2` | added, **required** | all task payloads | same |
| `Comment.mentionedUserIds?` (L~375) | MENTION | `476288e` | added (optional) | `GET /tasks/:id/comments` | |
| `OverviewResponse.workCounts: WorkCounts` + `WorkCounts` (L402-419) | OVERVIEW | `489b0a4` | added, **required** | `GET /overview` | backend must send it |
| `TasksFilter.open?`, `dueFrom?`, `dueTo?`, `sort?` (L~492-499) + `TasksResult` (L504) | TASKVIEWS | `489b0a4` | added | `GET /tasks` (+ `X-Total-Count` header) | |
| `NavBadgesResponse` (L860) | SIDEBAR | `489b0a4` | added | `GET /overview/badges` | |
| `NotificationReason`, `AppNotification`, `NotificationsPage`, `NOTIFICATIONS_PAGE_SIZE=30` (L1127-1144) | NOTIF | `476288e` | added | `/notifications*` | `AppNotification` is always project-scoped (`projectId`, `projectName`); a Pipeline notification (e.g. deal assigned to a PIC) would need a nullable projectId or a new shape — new work. |
| `CreateProjectInput.saId?`, `UpdateProjectInput.saId?` | SA-REMOVAL | `1a3e905` | **removed** | | **KEEP** (INTERNAL L699, L744) |
| `CreatedProject = Omit<ProjectSummary, "sa" \| "tam" \| …>` + doc comment mentioning `/opportunities/:id/handoff` | SA/PIPELINE-REMOVAL | `1a3e905` | changed | | **KEEP INTERNAL** (L707-716) — `useHandoffOpportunity` returns `CreatedProject` |
| `UpdateTaskInput.itopTicketRef?` / `.epicId?` (L1648-1652) | ITOP / EPIC | `ebe58e2`/`8b9fa3a` | added | `PATCH /tasks/:id` | |
| `CreateTaskInput.epicId?` (L~1997) | EPIC | `8b9fa3a` | added | `POST /projects/:id/tasks` | |
| `AdminUser.projectsAsSA` | SA-REMOVAL | `1a3e905` | **removed** | | **KEEP** (INTERNAL L2003) |
| `AdminProject.saId`, `.sa` | SA-REMOVAL | `1a3e905` | **removed** | | **KEEP** (INTERNAL L2025, L2030) |
| iTop read types: `ItopTicketScope`, `ItopTicketClass`, `ItopStatus`, `ItopTicketRow`, `ItopTicketCounts`, `CustomerTicketsResponse` (L3034-3097) | ITOP | `9467f9b` | added | `/itop/status`, `/itop/customers/:id/tickets` | copy |
| `MyItopTokenStatus` (L3113) | ITOP | `ed35482` | added | `/itop/me/token` | |
| `ItopTicketLogEntry`, `ItopTicketDetail`, `ItopTicketWriteResult`, `ItopTicketActionName`, `ItopTicketActionInput`, `ItopTicketTeamOption` (L3268-3313) | ITOP | `ed35482` | added | `/itop/tickets/:id*` | |
| `ItopTimeLogEntry`, `ItopTimeLogResult`, `ItopTimeLogStale`, `ItopTimeLogWriteResult`, `isStaleTimeLog`, `LogTicketTimeInput` (L3352-3390) | ITOP | `4657f14` | added | `POST /itop/tickets/:id/time` | |
| `ItopServiceOption`, `ItopContactOption`, `CreateTicketInput`, `ItopTicketCreateStale`, `ItopTicketCreateResult`, `isStaleTicketCreate` (L3532-3589) | ITOP | `0f16e79` | added | `/itop/services`, `/itop/customers/:id/contacts`, `POST /itop/tickets` | |
| `DailyItopCustomer`, `DailyItopResponse` (L3623-3638) | ITOP | `33aa5ca` | added | `GET /itop/daily` | |
| `UtilizationScope`, `UtilizationTilesData`, `UtilizationRow`, `UtilizationResponse` (L3675-3711) | UTIL | `065f078` | added | `GET /utilization` | Utilization rows are per TAM per customer. Whether SA time appears is a backend question (**unverified**). |
| Admin iTop types `ItopReadClass` … `ItopPersonsResponse` (L4007-4108), `ItopWebhookSecretResult` (L4137) | ITOP | `9467f9b`/`ebe58e2` | added | `/admin/itop/*` | |

#### Query keys (`queryKeys`, CUST L692-823; `adminQueryKeys` L3773-3783)

| Key | Tag | Shape | Note |
|---|---|---|---|
| `projectMembers(id)` | MEMBERS | `["projects", id, "members"]` | |
| `projectShareLinks(id)` | SHARE | `["projects", id, "share-links"]` | |
| `publicShare(token)` | SHARE | `["public-share", token]` (outside the projects tree on purpose) | |
| `projectActivity(id, actorId)` | ACTIVITY | `["projects", id, "activity", actorId ?? "all"]` | |
| `projectEpics(id)`, `epic(id)` | EPIC | `["projects", id, "epics"]`, `["epics", id]` | |
| `customerNotesRoot(id)`, `customerNotes(id, limit)` | CUSTOMERS | `["customers", id, "notes", limit]` | |
| `navBadges(today)`, `navBadgesRoot` | SIDEBAR | `["nav-badges", today]` | |
| `itopStatus`, `myItopToken`, `itopTicket(id)`, `itopTicketByRefRoot`, `itopTicketByRef(ref)`, `customerTicketsRoot(id)`, `customerTickets(id, scope, cls)`, `itopDailyRoot`, `itopDaily(date, offset)`, `utilizationRoot`, `utilization(week, scope, offset)`, `itopServices`, `itopContacts(customerId)` | ITOP / UTIL | all under `["itop", …]` | |
| `adminQueryKeys.itopSettings/itopOrganizations/itopCustomers/itopPersons` | ITOP | `["admin","itop",…]` | |
| `dailyReviewRoot` doc comment | PIPELINE-REMOVAL | comment drops "same shape as `pipelineKeys.root`" | cosmetic; keep INTERNAL wording (comes for free — that hunk is in `1a3e905`) |
| **Changed keys (not new):** `useProjects` → `[...projects(filter), today]`; `useCustomers` → `[...customers, today]`; `useCustomer` → `[...customer(id), today]`; `useProject` → `[...project(id), today]` | HEALTH (`489b0a4`) | day appended | Prefix invalidation (`["projects"]`, `queryKeys.customers`, `queryKeys.project(id)`) still matches. **Exact-key reads break**: any `getQueryData/setQueryData(queryKeys.project(id))` would miss. I grepped INTERNAL: no `getQueryData`/`setQueryData` outside `queries.ts`, and the Pipeline block only invalidates by prefix (`useHandoffOpportunity` L2944-2957: `["projects"]`, `queryKeys.customers`) — safe. `invalidateProjectHealth` (below) **depends on this exact key shape** (`k.length === 3 && isDayKey(k[2])`), so the key change and that helper must land together. |
| `pipelineKeys` (INTERNAL L2471-2490) | PIPELINE-REMOVAL | `["pipeline","opportunities",…]` | **KEEP**. No collision with any CUST key prefix (checked: CUST roots are `projects`, `customers`, `tasks`, `epics`, `itop`, `notifications`, `nav-badges`, `public-share`, `daily-review`, `recent-notes`, `admin`, …). |

#### Polling / refetch settings (complete list in CUST)

| Hook | Setting | Tag |
|---|---|---|
| `liveRefreshOptions` / `useLiveRefresh` (L940-972) | `refetchInterval: () => paused ? false : 30_000` (`LIVE_REFRESH_MS`), `refetchOnWindowFocus: () => !paused`, `refetchIntervalInBackground: false`; paused while any drag is live (`dragActivity`) **or any mutation is pending app-wide** (`qc.isMutating() > 0`); `useSyncExternalStore` re-renders on gate flips so the timer is re-armed. Applied **per hook, not globally** (comment L~915: global defaults also govern iTop/admin queries). | LIVE |
| `...live` spread into: `useCustomer` (L986), `useProject` (L1000), `useProjectTasks` (L1013), `useProjectMembers` (L1024), `useProjectActivity` (L1097), `useProjectSections` (L2098), `useProjectEpics` (L2232), `useProjectDependencies` (L4329) | as above | LIVE (+ each feature) |
| `useNavBadges` (L868) | `staleTime 60s`, `refetchOnWindowFocus: true`, `placeholderData: prev` | SIDEBAR |
| `useUnreadNotificationCount` (L1152) | `staleTime 0`, `refetchInterval 60_000`, `refetchIntervalInBackground: false`, `refetchOnWindowFocus: true` | NOTIF |
| `useNotifications` (L1165) | infinite, `staleTime 0` (mount only while list open) | NOTIF |
| `useProjectActivity` (L1097) | infinite, `getNextPageParam` stops after `ACTIVITY_MAX_PAGES=5` × `ACTIVITY_PAGE_SIZE=20`; deliberately **not** `maxPages` (would evict newest page) | ACTIVITY |
| `usePublicShare` (L1078) | `retry: false`, `refetchOnWindowFocus: false`, `staleTime 60s`, `auth: false` | SHARE |
| `useCustomerTickets` (L3157) | `staleTime 30s`, `refetchInterval: poll ? 60_000 : false`, background off ("the first refetchInterval in the app") | ITOP |
| `useItopDaily` (L3639) | `staleTime 30s`, `refetchInterval: (q) => q.state.data?.configured ? 60_000 : false`, background off | ITOP |
| `useRequestItopRefresh` (L3210) | `setTimeout(…, 3000)` then invalidates customer tickets / `["itop"]`, status, by-ref root | ITOP |
| `useItopStatus` 60s, `useMyItopToken` 60s, `useItopTicketByRef` 60s + `retry:false`, `useItopTicket` 30s, `useItopServices` 5 min, `useItopContacts` 60s, `useUtilization` 30s, `useItopOrganizations` 60s + `retry:false` | staleTime only | ITOP/UTIL |
| `useCustomers` | unchanged `staleTime 30s`, key gains `today` | HEALTH |

INTERNAL Pipeline hooks have **no** refetch settings (grep of L2380-3053 for `refetch|staleTime|placeholderData` is empty). Adopting LIVE for the Pipeline board is optional and would require the Pipeline kanban to register drags via `dragActivity.useDragActivityGuard`/`beginDrag` (as CUST's `SolvroKanban`, `SolvroGantt`, `ProjectList` do) — otherwise a 30 s refetch can move a deal card mid-drag. Note: the LIVE pause already reacts to Pipeline **mutations** (it is app-wide `isMutating()`), so nothing breaks if Pipeline does not adopt it.

#### Hooks: new in CUST

| Hook (CUST line) | Tag | Commit | Endpoint | Note for INTERNAL |
|---|---|---|---|---|
| `useNavBadges` (L868) | SIDEBAR | `489b0a4` | `GET /overview/badges?today=` | `dailyReviewPending` counts customers with ACTIVE projects not reviewed today — the SA visibility rule applies server-side (**unverified** whether an SA-only user's Daily Review should count). |
| `LIVE_REFRESH_MS`, `subscribeRefreshGate`, `liveRefreshOptions`, `useLiveRefresh` (L940-972) | LIVE | `25dbeec` | — | copy verbatim |
| `useProjectMembers` (L1024) | MEMBERS | `af9a362` | `GET /projects/:id/members` | |
| `useShareLinks`, `useCreateShareLink`, `useRevokeShareLink` (L1035-1077) | SHARE | `eadc065` | `GET/POST /projects/:id/share-links`, `DELETE …/:linkId` | create/revoke are owner-only in CUST UI (`ownerAccess`). Decide whether the SA may create guest links (user decision says SA is not an owner → no). |
| `usePublicShare` (L1078) | SHARE | `eadc065` | `GET /public/share/:token` (unauthenticated) | |
| `ACTIVITY_PAGE_SIZE`, `ACTIVITY_MAX_PAGES`, `useProjectActivity` (L1093-1126) | ACTIVITY | `476288e` | `GET /projects/:id/activity?limit&before&actorId` | |
| `useUnreadNotificationCount`, `useNotifications`, `useMarkNotificationRead` (optimistic), `useMarkAllNotificationsRead` (L1152-1243) + private `NOTIFICATIONS_LIST_KEY`, `NOTIFICATIONS_COUNT_KEY`, `invalidateNotifications`, `NotificationsData` | NOTIF | `476288e` | `/notifications`, `/notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-all` | Notification keys are **module-private consts**, not in `queryKeys` — a deviation from the frontend CLAUDE.md "keys in queryKeys" rule; acceptable or move into `queryKeys` during the port. |
| `useAddProjectMember`, `useRemoveProjectMember` (optimistic) (L1244-1292) | MEMBERS | `af9a362` | `POST /projects/:id/members`, `DELETE …/:userId` | both call `invalidateProjectHealth` + `invalidateProjectActivity` → depend on HEALTH and ACTIVITY helpers. |
| private `DAY_KEY_RE`, `isDayKey`, `invalidateProjectHealth` (L1313-1346) | HEALTH | `489b0a4` | — | predicate-based; relies on the day-suffixed key shapes. |
| private `invalidateProjectActivity` (L1318) | ACTIVITY | `476288e` | — | |
| private `tasksQueryOptions`, `selectTasks`; `useTasks` (now `select`s the array), **new** `useTasksWithTotal` (L1347-1405) | TASKVIEWS | `489b0a4` | `GET /tasks` via `apiRequestWithHeaders`, reads `X-Total-Count` | `useTasks` keeps its public signature/return shape (`data` is still `TaskWithProject[]`), so INTERNAL callers keep working. |
| `useProjectEpics`, `useEpic`, `useCreateEpic`, `useUpdateEpic`, `useDeleteEpic` (L2232-2317) | EPIC | `8b9fa3a` | `/projects/:id/epics`, `/epics/:id` | |
| `useCustomerNotes` (L2997) | CUSTOMERS | `489b0a4` | `GET /customers/:id/notes?limit=` | |
| iTop read/write hooks: `useItopStatus` (3098), `useMyItopToken`/`useSaveMyItopToken`/`useRemoveMyItopToken` (3126-3156), `useCustomerTickets` (3157), `useItopCustomerMapped` (3198), `useRequestItopRefresh` (3210), `useItopTicketByRef` (3248), `useItopTicket` (3314), `useLogTicketTimeFor`/`useLogTicketTime` (3391/3422), `useTicketActionFor`/`useTicketAction` (3448/3490), `useAddTicketLog` (3498), `useItopServices`/`useItopContacts` (3544/3552), `useCreateTicket` (3590), `useItopDaily` (3639) | ITOP | `9467f9b`…`933d3d0` | `/itop/*` | One contiguous block, CUST **L3025-3672** — copy as a unit. |
| `useUtilization` (L3712) | UTIL | `065f078` | `GET /utilization?week&scope&utcOffsetMinutes` | contiguous with the iTop block (L3673-3731). Replaces Work Logs (user decision overrides the old `WorkLogs.tsx` standing decision). |
| Admin iTop hooks: `useItopSettings` … `useMatchItopPersons` (L4109-4278) | ITOP | `9467f9b`/`ebe58e2` | `/admin/itop/*` | One contiguous block, CUST **L3997-4278** (inserted between `useGoogleAuthConfig` and `Holiday`). |

#### Hooks: changed in CUST (existed at the fork)

| Hook | Tag(s) | What changed | Note for INTERNAL |
|---|---|---|---|
| `useProjects` | HEALTH | `today` param in URL + key | |
| `useCustomers` | HEALTH/CUSTOMERS | `?today=` + key | |
| `useCustomer` | HEALTH + LIVE | `?today=`, key, `...live` | |
| `useProject` | HEALTH + LIVE | `?today=`, key, `...live` | |
| `useProjectTasks`, `useProjectSections`, `useProjectDependencies` | LIVE | `...live` | |
| `useTasks` | TASKVIEWS | rebuilt on `tasksQueryOptions` + `select` | same public shape |
| `useUpdateProject` | ACTIVITY | + `invalidateProjectActivity` | |
| `useDeleteProject` | PIPELINE-REMOVAL | CUST dropped `pipelineKeys.root` invalidation + comment | **KEEP INTERNAL** (L770-785) |
| `reorderTasksLocally` | EPIC | re-parenting clears `epicId` | |
| `useUpdateTask` (CUST L1802-1944) | CONFLICT + EPIC + HEALTH + ACTIVITY + MEMBERS | `mutationKey ["updateTask", projectId]`; optional `expected` → body; `serialiseTaskWrite` per-task queue (`taskWriteTails`, `taskWriteSeq`, `taskStaleAt` L1764-1800); optimistic merge clears `epicId` on re-parent and mirrors `labelIds` → `labels` via `labelsFromIds`; `onError` ignores `SupersededWriteError`; `onSettled` refetches project tasks only when it is the last in-flight update (or after a stale/superseded write), invalidates members if `assignedToId` set, health, activity, epics list + affected epic(s) | the most interleaved hunk in the file — five features touch it. Port it whole, in CUST's final form. |
| `useDeleteTask` | EPIC + HEALTH + ACTIVITY | read-only `onMutate` captures `epicId`; invalidations | |
| `useCreateTask` | EPIC + HEALTH + ACTIVITY + MEMBERS | invalidations incl. members when `assignedToId` | **SA nuance:** CUST backend auto-adds a non-member assignee who "cannot see the project" (`backend/src/routes/projects.ts` L490-500, `ensureAssigneeIsMember`); in INTERNAL the SA can already see the project, so the SA should not be auto-added — backend concern, but the frontend's notice (`assigneeAddsMember`) must agree (§3). |
| `useDuplicateTask`, `useDuplicateSection` | EPIC + HEALTH + ACTIVITY | invalidations | |
| `useCreateRisk`, `useUpdateRisk`, `useDeleteRisk` | HEALTH + ACTIVITY | invalidations | |
| `useAddProjectNote`, `useUpdateProjectNote`, `useDeleteProjectNote` | ACTIVITY | + `invalidateProjectActivity` | INTERNAL-notes guardrail: the activity log stores no note bodies (CUST `ActivityEvent` doc, L~231) and `activityText` never prints them — keep it that way (no export path involved). |
| `useMarkProjectReviewed`, `useUnmarkProjectReviewed` | SIDEBAR | + `navBadgesRoot` | |
| `useAddCustomerNote`, `useUpdateCustomerNote`, `useDeleteCustomerNote` | CUSTOMERS | + `customerNotesRoot(id)` | |
| `useSaveWeeklyUpdate` | CUSTOMERS/HEALTH | + customers-list predicate (`length === 2`) + `customer(id)` | |
| `useAddComment(taskId)` → **`useAddComment(taskId, projectId)`**, `mutate({ body, mentionedUserIds })` | MENTION + ACTIVITY | **signature change** | every caller changes (CUST: `TaskPanel`/`CommentMentions`); INTERNAL has no Pipeline caller (Pipeline uses `useAddOpportunityActivity`). |

### 1.3 INTERNAL-only exports and lines CUST lacks (must survive the port)

All verified with `grep -n` on INTERNAL `frontend/src/lib/queries.ts` (3053 lines).

| INTERNAL lines | What | Why it must stay |
|---|---|---|
| L6-14 | `import { ownerOf } from "./pipelineFormat"` + `import type { IdleState, PipelineOutcome, PipelineOutcomeReason, PipelineStage, PipelineStatusTag, PipelineSubStatus }` | Pipeline types |
| L110, L120 | `ProjectSummary.saId`, `ProjectSummary.sa` | SA owner field |
| L127 | `ProjectDetail.sa` (with email) | SA header / settings |
| L535 | `dailyReviewRoot` comment mentioning `pipelineKeys.root` | cosmetic |
| L699 | `CreateProjectInput.saId?` | project form + `useHandoffOpportunity` input |
| L707-716 | `CreatedProject` doc + `Omit<ProjectSummary, "sa" \| "tam" \| "customer" \| "_count">` | handoff result type |
| L744 | `UpdateProjectInput.saId?` | SA reassignment |
| L770-785 | `useDeleteProject`: comment + `qc.invalidateQueries({ queryKey: pipelineKeys.root })` | deleting a handed-off project nulls the deal's `projectId` |
| L2003 | `AdminUser.projectsAsSA` | Admin users table |
| L2025, L2030 | `AdminProject.saId`, `AdminProject.sa` | Admin project override |
| **L2381-3053** | the whole Pipeline section: `OpportunityPic` (2389), `Opportunity` (2395, incl. post-fork `subStatus`, `waitingInputSince`, `statusTag`, `outcome`, `outcomeReasonCategory`, `outcomeReason`, `closedAt`, `lastActivityAt`, `owner`, `idle`), `OpportunityActivity` (2454), `OpportunityLink` (2463), `pipelineKeys` (2471), `useOpportunities` (2491), `useOpportunity` (2498), `useOpportunityActivities` (2506), `useOpportunityLinks` (2517), `CreateOpportunityInput` (2525), `useCreateOpportunity` (2541), `UpdateOpportunityInput` (2552), `useUpdateOpportunity` (2572), `useAssignOpportunity` (2599), `CloseOpportunityInput` (2612), `useCloseOpportunity` (2628), `useReopenOpportunity` (2649), `useDeleteOpportunity` (2662), `useAddOpportunityActivity` (2682), `CreateOpportunityLinkInput` (2696), `useAddOpportunityLink` (2701), `UpdateOpportunityLinkInput` (2715), `useUpdateOpportunityLink` (2717), `useDeleteOpportunityLink` (2731), `MoveOpportunityInput` (2742), `reorderOpportunitiesLocally` (2762), `applyMoveSideEffects` (2825), `useMoveOpportunity` (2853), `HandoffOpportunityResult` (2923), `useHandoffOpportunity` (2928), `ImportOpportunityRow` (2974), `ImportRowResult` (2994), `ImportOpportunitiesResult` (3001), `useImportOpportunities` (3009), `PipelineImportLogEntry` (3035), `usePipelineImports` (3047) | 36 exports, the entire Pipeline data layer. INTERNAL changed this block after the fork (`abfa5dd`), so it must come from INTERNAL, never from the fork base. |

Things to add to the Pipeline block during/after the port (adaptation, not port): `useHandoffOpportunity` creates a project, so it should also invalidate `queryKeys.navBadgesRoot` (new customer/project can change the Daily Review pending count) and — if handoff should log a project `created` event — `invalidateProjectActivity` is moot for a brand-new project. `useDeleteOpportunity`/`useMoveOpportunity` etc. need `invalidateProjectActivity`-style calls only once a Pipeline activity feed exists.

### 1.4 Merge-direction recommendation for `queries.ts`

**Apply CUST's hunks onto INTERNAL** (i.e. replay CUST commits `9467f9b … eadc065` on INTERNAL's file; never replay `1a3e905`). Concretely: `git -C solvro-cust diff 1a3e905 eadc065 -- frontend/src/lib/queries.ts` applied to INTERNAL (`git apply -3` or `patch`).

Reasoning:
1. Proven mechanically: 47/48 hunks apply with only line offsets; the one failure (CUST hunk at L173-207, `ProjectSummary`/`ProjectDetail`) is a 6-line hand-merge.
2. INTERNAL's own post-fork work (`abfa5dd`) lives entirely in the Pipeline block and the imports — regions CUST never touches after `1a3e905` — so no CUST hunk lands inside it.
3. The opposite direction ("take CUST file, re-add INTERNAL blocks") means re-inserting ~14 scattered SA/Pipeline sites plus a 673-line block by hand — far more chances to drop a line (e.g. the `pipelineKeys.root` invalidation in `useDeleteProject`, or `AdminUser.projectsAsSA`) with no tool to catch it except the type checker.

Post-apply manual edits (all small): (a) the `ProjectSummary`/`ProjectDetail` hunk; (b) nothing else is required for compilation inside `queries.ts` (**unverified** — no tsc was run); (c) outside `queries.ts`: `handoffDefaults.test.ts` fixture (`active`, `avatarUrl`), and any INTERNAL-only fixture building `Task` (none found in Pipeline files; `components/pipeline/adapter.ts` / `commitMapper.ts` mention `Task` only in comments).

### 1.5 Porting `queries.ts` incrementally, per feature PR

Proven by dry-run: every **cumulative** CUST prefix applies to INTERNAL — `git diff 1a3e905 <X> -- queries.ts` for X = each of the 15 commits applies cleanly up to `8b9fa3a` (EPIC), and from `489b0a4` on only the `ProjectSummary` hunk fails. **Standalone** single-commit patches mostly do **not** apply (e.g. `476288e` alone: 14 of 21 hunks fail) because each commit's context includes the previous ones. So the cheap path is **chronological**: port features in CUST's order, one PR per group:

| Order | PR group | CUST commits (queries.ts) | Separable hook groups | Depends on |
|---|---|---|---|---|
| 1 | ITOP + UTIL | `9467f9b`, `33aa5ca`, `065f078`, `ebe58e2`, `ed35482`, `0f16e79`, `4657f14`, `933d3d0` | `Task.itopTicketRef`, `UpdateTaskInput.itopTicketRef`, iTop keys, iTop read block (CUST L3025-3731), admin block (L3997-4278), `adminQueryKeys.itop*` | nothing in this file (`auth.tsx` logout timer cleanup from `4657f14`) |
| 2 | HELP | — (no queries.ts change) | — | |
| 3 | EPIC | `8b9fa3a` | types, keys, epic hooks, epic invalidations in task mutations, `reorderTasksLocally` | — |
| 4 | UIPASS bundle (HEALTH, CUSTOMERS, OVERVIEW, TASKVIEWS, SIDEBAR) | `489b0a4` | health types + `today` keys + `invalidateProjectHealth`; `WorkCounts`; `TasksResult`/`useTasksWithTotal`/`tasksQueryOptions` (+ `api.ts`); `useNavBadges` + review invalidations; `useCustomerNotes` + note invalidations | `api.ts` hunk; first commit with the SA hand-merge |
| 5 | LIVE | `25dbeec` | `useLiveRefresh` + `...live` spreads | `dragActivity.ts` |
| 6 | MEMBERS | `af9a362` | `UserSummary.active/avatarUrl`, `ProjectMember`, member hooks, `projectMembers` key, member invalidation in create/update task | HEALTH helper (calls `invalidateProjectHealth`) |
| 7 | CONFLICT | `2d9b0a8` | `serialiseTaskWrite` + `useUpdateTask` rewrite | `taskConflict.ts` (+ `labels.ts`, `formatDate.ts`) |
| 8 | ACTIVITY + NOTIF + MENTION | `476288e` | activity types/key/hook, `invalidateProjectActivity` in ~20 mutations (incl. member hooks), notifications block, `useAddComment` signature | MEMBERS (`ActivityEntityType "member"`) |
| 9 | SHARE | `eadc065` | share types/keys/hooks, `ActivityEntityType "share_link"` | ACTIVITY |

If the user wants a different order (e.g. MEMBERS before ITOP), the earlier commits' context must be hand-merged — feasible but no longer mechanical. Alternative worth considering: land the **whole** `queries.ts` (+ `api.ts`, `dragActivity.ts`, `taskConflict.ts`, `labels.ts`, `formatDate.ts`) as one "data layer" PR with one spine review, then UI PRs per feature. Risk of that route: required fields (`Task.epicId`, `Task.itopTicketRef`, `UserSummary.active/avatarUrl`, `OverviewResponse.workCounts`) would type-lie until the matching backend PRs ship, and `useTasks` would read `X-Total-Count`(falls back safely to `data.length`).

---

## 2. Other differing files under `lib/` and `hooks/`

For every file below INTERNAL == fork base (verified: not in INTERNAL's post-fork diff-stat), so "take CUST, minus the `1a3e905` hunks" is exact. Dry-runs of `git diff 1a3e905 HEAD -- <file>` onto INTERNAL: `auth.tsx` and `tableSort.ts` apply cleanly (all their SA/Pipeline removals are inside `1a3e905` and therefore skipped); `navCommands.ts` (1/1 hunk) and `navCommands.test.ts` (1/3) fail — see below.

| File | CUST hunk (CUST lines) | Tag | Commit | What must be preserved / adapted in INTERNAL |
|---|---|---|---|---|
| `lib/auth.tsx` | `BUILTIN_ROLES` drops `"SA"` (L16) | SA-REMOVAL | `1a3e905` | **KEEP INTERNAL** `["SA","TAM","ADMIN","STAKEHOLDER","PENDING"]`. |
| `lib/auth.tsx` | `PERMISSION_CATALOG`: six `pipeline:*` rows removed; `project:view-all` hint reworded to "assigned TAM or … customer you own" (L37-44) | PIPELINE-REMOVAL / SA-REMOVAL | `1a3e905` | **KEEP** the six `pipeline:view/create/edit_own/edit_all/delete_own/delete_all` rows. **Adapt** the `project:view-all` hint: INTERNAL says "as SA/TAM"; after MEMBERS it should say something like "where you're the TAM, the SA or a member, or that belong to a customer you own" (new wording, not a port). |
| `lib/auth.tsx` | `AuthContextValue.userVerified` + `setUserVerified` set on `/auth/me` success, login, Google login; reset on logout (L74-81, L113, L133, L161, L181, L193) | SIGNIN / NOACCESS | `2d6a4c8` | copy. Consumers are the guards (`AdminGuard`, `ExecutiveGuard`) — INTERNAL's **`PipelineGuard`** (INTERNAL-only, not in CUST) must adopt the same rule — **verified**: INTERNAL `components/PipelineGuard.tsx` redirects to `/overview` as soon as `hasPermission(user, "pipeline:view")` is false, with no `userVerified` wait, i.e. exactly the bug CUST fixed in `AdminGuard`/`ExecutiveGuard` (`if (!userVerified) return <AuthLoading />;`). Port the same 2 lines into `PipelineGuard`. |
| `lib/auth.tsx` | `persistUser()` written synchronously on login (L89-95, L158, L178) | SIGNIN | `2d6a4c8` | copy |
| `lib/auth.tsx` | `/auth/me` gets `AbortSignal.timeout(15_000)` (L126-129) | SIGNIN | `2d6a4c8` | copy |
| `lib/auth.tsx` | logout clears `localStorage` keys `solvro.itopTimer.*` (L194-197) | ITOP | `4657f14` | copy with ITOP |
| `lib/api.ts` | `apiRequest` becomes a wrapper over new `apiRequestWithHeaders` returning `{ data, headers }` (L31-69) | TASKVIEWS | `489b0a4` | copy verbatim; no behaviour change for existing callers. |
| `lib/clipboard.ts` | restores focus after the `execCommand` textarea fallback (L12-15, L29) | COPYLINK | `3a19e75` | copy verbatim |
| `lib/isoWeek.ts` | `formatWeekRange` delegates to `fmtWeek` from `formatDate.ts`; drops local `MONTH_ABBR` (L37, L169-181) | UIPASS | `489b0a4` | copy; needs `formatDate.ts` |
| `lib/dailyReviewStats.ts` (+test) | `dueDateLabel` → `fmtDay` (adds year when not current year); test pins the clock | UIPASS | `489b0a4` | copy both |
| `lib/weeklySyncTable.ts` | `HEALTH_LABEL` = `WEEKLY_HEALTH_LABEL` from `labels.ts` | UIPASS | `489b0a4` | copy; needs `labels.ts` |
| `lib/tableSort.ts` | comment "TAM/SA usernames" → "TAM usernames" (L11) | SA-REMOVAL | `1a3e905` | **KEEP INTERNAL** comment (SA columns still exist). |
| `lib/utils.ts` (+test) | `text-meta` added to the `extendTailwindMerge` `theme.text` list; comments say seven roles; new test | UIPASS | `489b0a4` | copy; must land with the `index.css` `--text-meta` token. |
| `lib/navCommands.ts` | adds `NavGroup`, `NAV_GROUPS`, `group` field on every entry (sidebar sections Workspace/Cadence/Insights/System) | SIDEBAR | `489b0a4` | adapt: **re-add Pipeline** with a group. |
| `lib/navCommands.ts` | Work Logs comment replaced by Utilization entry `/utilization` (Insights) | UTIL | `065f078` | copy |
| `lib/navCommands.ts` | Pipeline entry `{ to: "/pipeline", …, requires: "pipeline:view" }` removed | PIPELINE-REMOVAL | `1a3e905` | **KEEP**; give it `group: "Workspace"` (it is a work surface, and the test requires each group's entries to be contiguous and in `NAV_GROUPS` order, so it must sit between Customers and Daily Review, or add a fifth group e.g. "Sales" — **user decision**). Its hunk fails the dry-run only because the Pipeline line is still there; hand-merge. |
| `lib/navCommands.test.ts` | imports `NAV_GROUPS`; "Utilization" added to the no-permission list; `/pipeline` → `/utilization` in the full list; Pipeline-gating test replaced by a group-order test and a "keeps /tasks out" test | SIDEBAR / UTIL / PIPELINE-REMOVAL | `489b0a4`, `065f078`, `1a3e905` | adapt: keep INTERNAL's "hides Pipeline without pipeline:view" test; put `/pipeline` back in the full-route list; add Pipeline to the group-order expectation. Keep the new `/tasks` test (it enforces the Tasks guardrail). |
| `lib/gantt/exportExcel.ts` (+test) | `buildTasksSheet(rows, epics = [])` adds an **Epic** column after Section (subtasks inherit the parent's epic via `parentRowId`); `epics?` option; status/priority text from `labels.ts` | EPIC + UIPASS | `8b9fa3a`, `489b0a4` | copy. The test adds a `taskFixture` with `epicId`/`itopTicketRef` — consistent with the new `Task` type. No notes in this export (INTERNAL-notes guardrail unaffected). |
| `lib/gantt/exportPdf.ts` | status/priority text from `labels.ts` (drops local `STATUS_LABEL`) | UIPASS | `489b0a4` | copy |
| `lib/gantt/geometry.ts` | `fmtDateDDMM` / `fmtDateRangeDDMM` delegate to `formatDate.fmtDay/fmtRange` (empty range now reads "No dates", not "—") | UIPASS | `489b0a4` | copy. `components/gantt-v2/TreeCells.test.ts` in CUST has the matching expectations (fe-components.md). |
| `lib/gantt/palette.ts` | legend labels come from `TASK_STATUS_LABEL` / `PRIORITY_LABEL` ("To do", "In progress" casing changes) | UIPASS | `489b0a4` | copy |
| `hooks/` | no file differs; CUST adds two new hooks (§3) | | | |

Note on the spine list: `lib/gantt/` is not on INTERNAL's spine list (`lib/export/` is; INTERNAL has no `lib/export/` dir change here). The `gantt-v2/` UI that calls `exportGanttToExcel({ epics })` is spine — covered in fe-components.md.

---

## 3. CUST-only files in `lib/` and `hooks/`

Importers are from `grep` in CUST `frontend/src` (tests excluded). "Verbatim" = copy unchanged; "Adapt" = INTERNAL needs Pipeline/SA changes.

| File (lines) | Tag | Added in | Purpose | Exports | Importers (CUST) | Verdict for INTERNAL |
|---|---|---|---|---|---|---|
| `lib/activityText.ts` (439) + test | ACTIVITY (+SHARE) | `476288e`, `eadc065` | Turns an `ActivityEvent` into a sentence (parts for rich rendering + plain text); total over unknown shapes; never prints note/comment bodies | `ActivityPart`, `ActivitySentence`, `eventTaskId`, `describeActivity` | `components/ProjectActivity.tsx`, `lib/notificationText.ts` | **Adapt.** (1) `FIELD_NOUN` (L64-89) has no `sa`/`saId` (nor `tam`/`tamId`): a project SA change would read via `humanizeField` as "sa" — add `sa: "Solution Architect"`, `saId: …` (and `tam`/`tamId` "TAM" for symmetry). (2) For the Pipeline extension: add `case "opportunity"` (or whatever entity types the backend emits) to the `describeActivity` switch (L311-410) and teach `valueText` the Pipeline enums (`STAGE_LABELS`, `SUB_STATUS_LABELS`, `TAG_LABELS`, `OUTCOME_LABELS` from `pipelineFormat.ts`) — new work. |
| `lib/contrast.ts` (14) | EPIC | `8b9fa3a` | `pickContrast(hex)` readable ink for a colored chip | `pickContrast` | **none** — dead code in CUST (grep finds no caller; `LabelChip` moved to a tint style in `489b0a4`) | Skip, or copy only if a Pipeline chip wants it. |
| `lib/dragActivity.ts` (100) + test | LIVE | `25dbeec` | Token-based "a drag is live" registry + subscription, used to pause LIVE polling | `subscribeDragActivity`, `beginDrag`, `isDragActive`, `shouldPauseRefresh`, `useDragActivityGuard`, `usePointerPressActivity` | `queries.ts`, `kanban-v2/SolvroKanban.tsx`, `gantt-v2/SolvroGantt.tsx`, `pages/views/ProjectList.tsx` | Verbatim. Optional Pipeline follow-up: `SolvroPipelineKanban` should call `useDragActivityGuard` if Pipeline queries ever adopt `useLiveRefresh`. |
| `lib/formatDate.ts` (239) + test | UIPASS | `489b0a4` | Single day-first, 24-hour, locale-independent date formatter set | `MONTH_NAMES`, `MONTH_ABBR`, `fmtDay`, `fmtDayFull`, `fmtDayLong`, `fmtRange`, `fmtDue`, `fmtWeek`, `fmtTime`, `fmtDateTime`, `fmtAgo`, `isTaskOverdue` | 38 files (pages, gantt, daily-review, itop, `isoWeek`, `dailyReviewStats`, `taskConflict`, `activityText`, `gantt/geometry`) | Verbatim. **Convention clash:** CUST's new frontend/CLAUDE.md rule says "show dates only through `formatDate.ts` — never `toLocaleDateString`/`Intl`". INTERNAL Pipeline violates it: `pipelineFormat.formatPipelineDate` uses `Intl.DateTimeFormat("id-ID")` (pipelineFormat.ts L277-284); `toLocale*`/`Intl`/month lists also appear in `components/pipeline/quarterLogic.ts`, `components/pipeline/analytics.ts`, `components/DealCard.tsx`, `pages/OpportunityDetail.tsx`, `pages/views/PipelineList.tsx`, `pages/views/PipelineClosed.tsx` (grep). Either migrate them (follow-up PR) or word the convention to exempt them for now. Same for `text-[10px]`/`text-[11px]`: 26 hits across Pipeline files vs the new "no arbitrary sub-12px" rule. Note `formatIDR` (currency) is unaffected. |
| `lib/helpContent.ts` (489) + test | HELP (+EPIC, UIPASS edits) | `5caef7f`, `8b9fa3a`, `489b0a4` | Static Help page content; `filterHelpTopics(has, query)` gates topics like the sidebar | `HelpEntry`, `HelpShortcut`, `HelpTopic`, `HELP_TOPICS`, `filterHelpTopics` | `pages/Help.tsx` | **Adapt.** (1) L42 "Solvro is the delivery workspace for TAMs" → mention SAs/Pipeline. (2) "Who can do what" L69-75: add `pipeline:*` permissions, SA visibility ("projects where you are the TAM or SA"), members. (3) Add a **Pipeline** topic with `requires: "pipeline:view"` — the test "gates each page topic exactly like the sidebar entry it links to" (helpContent.test.ts L43-47) enforces that. (4) Content is **stale even for CUST**: last edited in `489b0a4` (09-29), so it says nothing about members, guest links, activity log, notifications or @mentions (grep for "member" finds none) — write those topics during the port. (5) L240 says "pick the Solution Architect from the user list" for customers — check against INTERNAL's customer form (**unverified**). |
| `lib/labels.ts` (116) + test | UIPASS (+SHARE) | `489b0a4`, `eadc065` | Display words for domain enums + select options + risk level | `TASK_STATUS_LABEL`, `PRIORITY_LABEL`, `RISK_STATUS_LABEL`, `RISK_CATEGORY_LABEL`, `PROJECT_STATUS_LABEL`, `PHASE_STATUS_LABEL`, `SHARE_LINK_STATUS_LABEL`, `MILESTONE_UPCOMING_LABEL`, `WEEKLY_STATUS_LABEL`, `WEEKLY_HEALTH_LABEL`, `LabelOption`, `taskStatusOptions`, `priorityOptions`, `riskStatusOptions`, `riskCategoryOptions`, `projectStatusOptions`, `RiskLevel`, `riskLevelFromScore`, `riskLevel` | 28 files incl. `StatusChip`, `PriorityBadge`, gantt exports | Verbatim. Pipeline labels already live in `pipelineFormat.ts` (`STAGE_LABELS`, `SUB_STATUS_LABELS`, `TAG_LABELS`, `OUTCOME_LABELS`, `OUTCOME_REASON_LABELS`) — leave them there (domain-local) or re-export from `labels.ts`; either satisfies "never hand-write enum words in a component". Imports `ShareLinkStatus` from `shareLinks.ts`, so it needs that file even before SHARE ships (or trim the share labels in an earlier PR). |
| `lib/mentions.ts` (158) + test | MENTION | `476288e` | `@` query detection, candidate filtering, insertion, server-id derivation, comment splitting | `MentionUser`, `MAX_MENTIONS`, `MentionQuery`, `activeMentionQuery`, `filterMentionCandidates`, `insertMention`, `MentionMatch`, `findMentions`, `deriveMentionedIds`, `CommentPiece`, `splitComment` | `components/CommentMentions.tsx` | Verbatim. Candidate list is built by the caller; whether the SA is mentionable (and notified) depends on the backend's "can see the project" rule — in INTERNAL the SA can, so include them (**unverified** backend side). Pipeline activity notes (`OpportunityActivity`) do not get @mentions unless built new. |
| `lib/notificationText.ts` (46) + test | NOTIF | `476288e` | Sentence + href for a notification | `NotificationSentence`, `describeNotification`, `notificationHref` | `components/layout/NotificationBell.tsx` | Verbatim for project notifications. `notificationHref` always builds `/projects/:id…`; a Pipeline notification would need `/pipeline/:id` — adapt only if Pipeline notifications are added. |
| `lib/ownerAccess.ts` (62) + test | MEMBERS | `af9a362` | Client mirror of the backend `owner_only` guard: who may change TAM/customer, delete a project, change/delete a customer | `hasViewAll`, `canOwnProject`, `canOwnCustomer`, `OWNER_ONLY_MESSAGE`, `isOwnerOnlyError`, `saveErrorMessage` | `ProjectMembers.tsx`, `ProjectFormModal.tsx`, `CustomerFormModal.tsx`, `ProjectShare.tsx`, `pages/ProjectDetail.tsx`, `pages/Customers.tsx`, `pages/CustomerDetail.tsx` | **Verbatim works for "SA is not an owner"**: `canOwnProject(user, {tamId}, customerOwnerId)` returns true only for view-all, the project TAM, or the customer's owner — **a user who is only the project's SA gets `false`** (same as a member), so owner-only controls (change TAM/customer, delete project, guest links, member management in CUST's UI) are hidden for them. Adapt: (1) decide whether **changing `saId`** is owner-only too (INTERNAL's project form has an SA picker; CUST has none) — if yes, `ProjectFormModal` must gate the SA field with `canOwnProject`; the backend must agree. (2) `OWNER_ONLY_MESSAGE` wording is fine. (3) `canOwnCustomer` is unaffected by SA. |
| `lib/paletteActions.ts` (59) + test | PALETTE | `489b0a4` | "Actions" group of ⌘K: New project, New customer, Add task (deep link `?new=`) | `PaletteAction`, `NEW_PARAM`, `projectIdFromPath`, `buildPaletteActions` | `components/CommandPalette.tsx`, `hooks/useNewParam.ts` | Verbatim. Optional: add "New opportunity" gated on `pipeline:create` → `/pipeline?new=1`, with `useNewParam` wired in `Pipeline.tsx`. |
| `lib/projectMembers.ts` (63) + test | MEMBERS | `af9a362` | Pure membership helpers | `ASSIGN_ADDS_MEMBER_NOTICE`, `assigneeAddsMember`, `memberCandidates`, `splitMemberOverflow`, `removalWarning` | `ProjectMembers.tsx`, `AssigneeMembershipNotice.tsx`, `lib/useAssigneeMembership.ts`, `pages/views/ProjectList.tsx` | **Adapt.** `assigneeAddsMember(assigneeId, tamId, members, active)` treats everyone except the TAM and existing members as "would be added". CUST's backend adds an assignee only if they "cannot see the project" (`ensureAssigneeIsMember`, backend `routes/projects.ts` L490-500). In INTERNAL the SA can see the project, so assigning the SA would show a false "also adds them to the project" notice. Add an `saId` parameter treated like `tamId`. (CUST already has the same imprecision for the customer owner and view-all users — worth fixing in the same change.) `memberCandidates` excludes TAM + members; also exclude the SA (adding the SA as a member is redundant) — **user decision**. |
| `lib/routeMeta.ts` (106) + test | UIPASS/SIDEBAR | `489b0a4` | Route → TopBar title + breadcrumbs | `Crumb`, `CrumbContext`, `RouteKind`, `RouteMatch`, `matchRoute`, `routeTitle`, `buildCrumbs` | `components/layout/TopBar.tsx` | **Adapt.** `STATIC_TITLES` (L35-48) lacks `pipeline` → `/pipeline` would be titled "Overview" (the fallback). Add `pipeline: "Pipeline"`. For `/pipeline/:id` (opportunity ids are UUID strings, so the `NUMERIC` test never matches) either accept the static "Pipeline" title or add an `"opportunity"` `RouteKind` with crumbs `Pipeline › <deal name>` (`CrumbContext` gains `opportunityName`). Also `share` (`/share/:token`) is outside the shell, so no entry needed. Add test cases. |
| `lib/safeRedirect.ts` (25) + test | SIGNIN | `fc02e6f` | Validates the post-login `from` path (blocks `//`, `/\`, control chars, cross-origin) | `DEFAULT_POST_LOGIN_PATH`, `safeRedirectPath` | `pages/Login.tsx` | Verbatim. `/pipeline/...` deep links survive sign-in automatically. |
| `lib/shareLinks.ts` (135) + test | SHARE | `eadc065` | Guest-link helpers: status, title, absolute URL, label normalisation, public timeline layout | `SHARE_LABEL_MAX`, `SHARE_EXPIRY_OPTIONS`, `DEFAULT_SHARE_EXPIRY_DAYS`, `ShareLinkStatus`, `shareLinkStatus`, `shareLinkTitle`, `absoluteShareUrl`, `normalizeShareLabel`, `PhaseTone`, `PHASE_STATUS_TONE`, `phaseStatusOf`, `PhaseBar`, `TimelineLayout`, `MIN_BAR_PERCENT`, `timelineLayout` | `components/ProjectShare.tsx`, `pages/PublicShare.tsx`, `lib/labels.ts` | Verbatim. Public payload has no SA/opportunity data — nothing to add. Guardrail check: public payload is phases + milestones only, no notes. |
| `lib/taskConflict.ts` (360) + test | CONFLICT | `2d9b0a8` | Stale-write (409 `stale_write`) model: tracked fields, `expected` building, conflict rows, superseded-write error | `TRACKED_FIELDS`, `TrackedField`, `TaskExpected`, `StaleWriteConflict`, `StaleWrite`, `SupersededWriteError`, `isSupersededWrite`, `parseStaleWrite`, `buildExpected`, `datePatchFromEdit`, `labelsFromIds`, `fieldsToAdopt`, `TaskFormValues`, `diffTaskForm`, `CONFLICT_FIELD_LABEL`, `ConflictLookups`, `ConflictRow`, `withServerTask`, `formatConflictValue`, `formatConflictRows` | `queries.ts`, `TaskConflictDialog.tsx`, `TaskPanel.tsx`, `TaskFormModal.tsx` | Verbatim (task-only; Pipeline untouched). Opportunities have no stale-write protection — out of scope unless requested. |
| `lib/useAssigneeMembership.ts` (20) | MEMBERS | `af9a362` | Hook: "would assigning this user add them?" from cached project/members/users | `useAssigneeMembership` | `AssigneeMembershipNotice.tsx`, `TaskPanel.tsx`, `pages/views/ProjectList.tsx` | **Adapt** with `projectMembers.ts`: pass `project?.saId` (INTERNAL `ProjectDetail.saId` exists) into `assigneeAddsMember`. (A hook living in `lib/` rather than `hooks/` — CUST's own placement; keep or move.) |
| `hooks/useDialogFocus.ts` (71) | UIPASS | `489b0a4` | Modal focus-in, Tab trap, focus return | `useDialogFocus` | `components/Modal.tsx` | Verbatim. Every Pipeline dialog built on `Modal.tsx` inherits it; Pipeline dialogs not built on `Modal` (check `CloseDealDialog`, `MoveReasonModal`, `PipelineImportDialog`) do not (**unverified**; see fe-components.md). |
| `hooks/useNewParam.ts` (27) | PALETTE | `489b0a4` | One-shot `?new=<value>` opener for create forms | `useNewParam` | `pages/ProjectDetail.tsx`, `pages/Customers.tsx`, `pages/Projects.tsx` | Verbatim; optional Pipeline use (see `paletteActions`). |

---

## 4. App shell and config

### 4.1 `frontend/src/App.tsx`

Dry-run of `git diff 1a3e905 HEAD -- frontend/src/App.tsx` onto INTERNAL: 5/6 hunks apply; hunk #2 (the import block) fails because INTERNAL still imports `PipelineGuard`/`OpportunityDetail`/`Pipeline`.

| CUST hunk | Tag | Commit | Note |
|---|---|---|---|
| `import { …, useLocation }`; `ProjectIndexRedirect` component carrying `search`/`hash` across `/projects/:id` → `overview` (L1, L30-37, index route L57) | SIGNIN / COPYLINK | `fc02e6f` | copy |
| `import { PipelineGuard }`, `OpportunityDetail`, `Pipeline` removed | PIPELINE-REMOVAL | `1a3e905` | **KEEP** |
| `import { Help }` + `<Route path="help">` (L83) | HELP | `5caef7f` | copy |
| `import { PublicShare }` + `<Route path="/share/:token">` outside `AuthGuard`/Shell (L43-44) | SHARE | `eadc065` | copy; must pair with nginx + vite denylist hunks |
| `import { Utilization }` + `utilization` route; `work-logs` → `<Navigate to="/utilization">`; `WorkLogs` import removed | UTIL | `065f078` | copy (user decision supersedes the WorkLogs standing decision — CLAUDE.md's Standing decisions line must be edited by the user) |
| `import { ProjectEpics }` + `projects/:id/epics` route (L62) | EPIC | `8b9fa3a` | copy; also needs the `ProjectDetail.tsx` tab (frontend CLAUDE.md rule) |
| `pipeline` and `pipeline/:id` routes inside `PipelineGuard` | PIPELINE-REMOVAL | `1a3e905` | **KEEP** (INTERNAL L60-76 region) |
| `Tasks` route | — | — | unchanged in both (guardrail satisfied) |

### 4.2 `frontend/src/index.css`

One hunk: `--text-meta: 12px; --text-meta--line-height: 1.35; --text-meta--font-weight: 500;` in the primary `@theme inline` block (CUST L114-116). Tag UIPASS (`489b0a4`). Copy; pairs with `lib/utils.ts`. Triggers a `docs/DESIGN.md` sync (docs-keeper trigger: `index.css` touched).

### 4.3 `frontend/vite.config.ts`

| Hunk | Tag | Commit | Note |
|---|---|---|---|
| `navigateFallbackDenylist: [/^\/api\//, /^\/share\//]` (L50-53) | SHARE | `eadc065` | copy — the PWA shell must not serve `/share/*` (nginx headers needed) |
| `server.allowedHosts` from `VITE_ALLOWED_HOSTS` (L87-93) | OTHER (dev infra) | `d6a17cc` | INTERNAL solves the same problem with an untracked `frontend/vite.config.local.ts` (excluded via `.git/info/exclude`; see user memory "Tunnel + Vite allowedHosts"). Porting is optional; if ported, the local override becomes unnecessary. **User decision.** |

`vite.config.ts` is a docs-keeper trigger file.

### 4.4 `frontend/nginx.conf`

Two new locations, both SHARE (`eadc065`): `location ^~ /api/public/share/` (proxy to `backend:3000/public/share/`, `access_log off` — the token is in the path) and `location ^~ /share/` (`access_log off`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, `rewrite ^ /index.html break`). Copy verbatim. Spine list item (`nginx.conf`) → instant review; docs-keeper trigger. Also check `setup.sh`'s generated nginx/compose in INTERNAL carries the same (outside this scope, **unverified**).

### 4.5 `frontend/CLAUDE.md`

INTERNAL's file was untracked at the fork and was committed unchanged in `c86f463`; it equals CUST's root version. CUST changes (dry-run applies cleanly):

| CUST line | Change | Tag | Port? |
|---|---|---|---|
| Server state | drops the `pipelineKeys` sentence; adds "Mutations invalidate exactly what they touch, never by prefix accident" as a general rule | PIPELINE-REMOVAL + generalisation | **Keep INTERNAL's `pipelineKeys` sentence** and also keep CUST's generalised sentence. Consider adding the CUST-era conventions that are only in code comments today: "project-scoped queries opt into `useLiveRefresh()` per hook — never via global defaults" (queries.ts L~915) and "notification keys…" (if moved into `queryKeys`). |
| new **Display dates and words** bullet | `formatDate.ts` only; enum words from `labels.ts`; `text-meta` for 12px; no sub-12px `text-[Npx]` | UIPASS | Port, but resolve the Pipeline clash (§3 `formatDate.ts`): Pipeline currently uses `Intl("id-ID")` dates and `text-[10px]/[11px]`. Either migrate Pipeline in a follow-up or note the temporary exemption. Pipeline enum words in `pipelineFormat.ts` already satisfy the "not in a component" intent. |
| Navigation | adds "top-bar titles/breadcrumbs come from `src/lib/routeMeta.ts`" | UIPASS | Port (and add the Pipeline routes to `routeMeta`). |

Note: CUST `queries.ts` cites "frontend/CLAUDE.md's Task 1.8" for the polling rule (comment in `useCustomerTickets`), but no such line exists in CUST's frontend/CLAUDE.md — a dangling reference; either add the polling convention or drop the citation.

---

## 5. INTERNAL-only lib files

| File | Pipeline-only? | Evidence |
|---|---|---|
| `lib/pipelineFormat.ts` (+test) | Yes | Exports only Pipeline types/labels/formatters (`PipelineStage`, `STAGE_*`, `SUB_STATUS_LABELS`, `TAG_LABELS`, `OUTCOME_*`, `REASONS_BY_OUTCOME`, `isClosed`, `isSkipJump`, `ownerOf`, `PIPELINE_SLA_HINT`, `formatIDR`, `formatIDRCompact`, `formatWinProbability`, `formatPipelineDate`). Importers are all Pipeline files plus `queries.ts` and `handoffDefaults.ts`. Deleted in CUST by `1a3e905`. INTERNAL changed it after the fork (+162/-49, `abfa5dd`). Keep as is. Port-related follow-up: `formatPipelineDate` vs the `formatDate.ts` convention. |
| `lib/handoffDefaults.ts` (+test) | Yes | `computeHandoffDefaults(deal, customers, users)` prefills the handoff project form incl. `saId` from the deal PIC. Imports `CustomerSummary`, `Opportunity`, `UserSummary`. Deleted by `1a3e905`. **Breaks on port:** `handoffDefaults.test.ts` `makeUser()` lacks the now-required `UserSummary.active`/`avatarUrl` (and uses `role: "SA"`, fine since INTERNAL keeps the SA role). Consider requiring `active` for the PIC → SA prefill (an inactive PIC should not be prefilled as SA). |
| `lib/queries.reorder.test.ts` | Yes | Tests only `reorderOpportunitiesLocally` (describe at L56) and `applyMoveSideEffects` (L210), imports only those + `Opportunity`. At the fork it contained only the `reorderOpportunitiesLocally` suite. CUST deleted it in `1a3e905` ("Remove the Pipeline module…") because everything it tests was deleted from `queries.ts`. Not a sign of a missing CUST test for task reordering. Keep. |

---

## 6. Summary: counts per tag, top risks, surprises

### 6.1 Counts per tag (in-scope items)

Counted as hunks/items in this report (queries.ts counted by exported symbol + changed hook; other files by hunk; new files by file).

| Tag | queries.ts new exports | queries.ts changed hooks/types | other lib/hooks/App/config hunks | new files |
|---|---|---|---|---|
| ITOP | 72 exports (types + hooks; keys separate; read block L3025-3672, admin block L3997-4278) | `Task`, `UpdateTaskInput` (+1 field each) | auth logout timer cleanup | 0 |
| UTIL | 5 (`useUtilization` + 4 types) + 2 keys | — | navCommands entry, App route + redirect | 0 |
| EPIC | 9 + 2 keys | `Task`, `CreateTaskInput`, `UpdateTaskInput`, `reorderTasksLocally`, 5 task/section mutations | exportExcel (+test), App route | `contrast.ts` (dead) |
| HEALTH / CUSTOMERS / OVERVIEW / TASKVIEWS / SIDEBAR (UIPASS mega-commit data parts) | 8 (`CustomerHealth`, `ProjectHealth`, `WorkCounts`, `TasksResult`, `NavBadgesResponse`, `useNavBadges`, `useTasksWithTotal`, `useCustomerNotes`) + 4 keys | 4 query keys gain `today`; `useTasks`; 3 risk, 5 task, 3 customer-note, 2 review, weekly-update mutations | `api.ts`, navCommands groups | — |
| UIPASS (presentation) | — | — | isoWeek, dailyReviewStats(+test), weeklySyncTable, utils(+test), 4 gantt files, index.css, frontend/CLAUDE.md (2 bullets) | `formatDate`, `labels`, `routeMeta`, `useDialogFocus` |
| PALETTE | — | — | — | `paletteActions`, `useNewParam` |
| LIVE | 4 | 8 hooks spread `...live` | — | `dragActivity` |
| MEMBERS | 4 (`ProjectMember`, 3 hooks) + 1 key | `UserSummary`, `ProjectDetail`, `useUpdateTask`, `useCreateTask` | — | `ownerAccess`, `projectMembers`, `useAssigneeMembership` |
| CONFLICT | 0 (private queue helpers) | `useUpdateTask` | — | `taskConflict` |
| ACTIVITY / NOTIF / MENTION | 14 + 1 key | ~20 mutations gain `invalidateProjectActivity`; `Comment`; `useAddComment` signature | — | `activityText`, `notificationText`, `mentions` |
| SHARE | 8 + 2 keys | `ActivityEntityType` | App route, vite denylist, nginx (2 locations) | `shareLinks` |
| HELP | — | — | App route | `helpContent` |
| SIGNIN / NOACCESS / COPYLINK | — | — | auth `userVerified`/`persistUser`/timeout, App `ProjectIndexRedirect`, clipboard focus | `safeRedirect` |
| OTHER | — | — | vite `allowedHosts` | — |
| PIPELINE-REMOVAL / SA-REMOVAL (**do not port**) | — | 14 sites in queries.ts (§1.3) + 673-line block | auth (role + 6 perms + hint), navCommands(+test), tableSort comment, App imports/routes, frontend/CLAUDE.md sentence | 3 INTERNAL files CUST deleted |

### 6.2 Top risks

1. **`useUpdateTask` is a five-feature knot** (CONFLICT, EPIC, HEALTH, ACTIVITY, MEMBERS). Port it whole in its final CUST form; partial ports leave subtle refetch/optimistic bugs (e.g. CONFLICT's "skip refetch while another update is in flight" without the per-task queue).
2. **Key-shape coupling**: `invalidateProjectHealth` matches `["projects", id, today]` / `["customers", today]` by length and a day regex. Any INTERNAL code (now or later, e.g. Pipeline handoff) that adds a 3-segment `["projects", id, <yyyy-mm-dd-like>]` key, or reads `queryKeys.project(id)` exactly, interacts with it. Today none does (grep).
3. **Required type fields** (`Task.epicId`, `Task.itopTicketRef`, `UserSummary.active/avatarUrl`, `OverviewResponse.workCounts`) assume the backend ports land first or together; `handoffDefaults.test.ts` breaks immediately.
4. **SA semantics leak through CUST helpers**: `assigneeAddsMember`/`useAssigneeMembership` would show a false "adds them to the project" notice for the SA; `routeMeta` titles `/pipeline` "Overview"; `activityText` prints "sa" for SA changes; Help text says Solvro is "for TAMs". `PipelineGuard` lacks the `userVerified` fix.
5. **Convention clash**: the new "dates only via `formatDate.ts`, no sub-12px text" rule is already violated by Pipeline (`Intl("id-ID")`, 26 `text-[10/11px]` hits).
6. Merge order: only chronological (CUST order) feature PRs apply mechanically; reordering features means hand-merging `queries.ts`.

### 6.3 Surprises

- INTERNAL's post-fork `queries.ts` work touched **only** imports and the Pipeline block, so CUST's 2082 added lines apply almost untouched (47/48 hunks).
- `lib/contrast.ts` is dead code in CUST (no importer).
- `helpContent.ts` predates CUST's own 09-30 features (members, guest links, activity, notifications, mentions) — Help is stale in CUST too.
- Notification query keys are module-private constants, not in `queryKeys`, contrary to the stated convention.
- `queries.reorder.test.ts` is purely a Pipeline test (deleted with Pipeline), not a lost task-ordering test.
- A CUST comment cites a "frontend/CLAUDE.md Task 1.8" polling convention that does not exist in CUST's frontend/CLAUDE.md.
- CUST and INTERNAL solved the Vite tunnel `allowedHosts` problem differently (env var vs untracked local config).
