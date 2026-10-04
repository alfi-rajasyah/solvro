# Spec: Project Members + Guest Links port (CUST -> INTERNAL)
_Research in progress — sections appended incrementally._

Date: 2026-10-02. Sources: CUST `/home/solvro-internal/solvro-cust` (commits af9a362 members, c6f39b2 avatar spacing, b98ac14 member docs, eadc065 guest links, 2ecb148 guest docs; plan `docs/archive/plans/collaboration-and-sharing.md`), INTERNAL `/home/solvro-internal/solvro` (develop @154b42f).

## 0. Key facts that shape the port (verified)

- **CUST commits**: `af9a362` Add project members (37 files, +2605/-91) · `c6f39b2` member avatars side by side (ProjectMembers.tsx 4/4) · `b98ac14` docs (backend/CLAUDE.md visibility line + plan) · `eadc065` guest links (31 files, +3122/-7) · `2ecb148` guest docs (CONFIGURATION.md, ISSUES.md, backend/CLAUDE.md, plan). Activity log `476288e` sits BETWEEN members and guest links: guest-link code calls `recordActivity` (share_link created/removed) and edits `lib/activity.ts` (+9). Members code calls `recordActivity` (member added/removed) — so members/guest links depend on the activity-log port (other spec) or need stubbing.
- **INTERNAL SA role has NO write permissions by default**: `backend/prisma/seed.ts:15-21` → SA = `project:read, pipeline:view, pipeline:create, pipeline:edit_own, pipeline:delete_own`. TAM = `project:read, project:write, task:read, task:write` (:26). STAKEHOLDER = `project:read, project:view-all` (:27). The seed runs on EVERY prod container start (`setup.sh:150` → `prisma migrate deploy && prisma db seed`) and its upsert `update:` branch **rewrites built-in role permissions** (`seed.ts:33-37`) — so an admin's Admin > Roles edit to SA (`routes/admin.ts` only protects PENDING, :26) is silently reverted at next restart (pre-existing issue, worth an ISSUES.md line). Consequence: with stock roles an SA already gets 403 `forbidden` (missing `project:write`/`task:write`) on every mutating project/task/customer route — the owner gate only bites an SA whose role was given `project:write` (custom role, or the window before the next restart), or a user whose role has write perms AND who is attached only as `saId`.
- **INTERNAL has no assignee visibility arm**: `lib/visibility.ts:21-30` arms = `tamId | saId | customer.tamId`; `routes/tasks.ts:75-79` `buildVisibilityWhere` reuses it. A task assignee who is not TAM/SA/customer-owner (and lacks view-all) **cannot open the project, cannot see the task in GET /tasks, and cannot PATCH it** (ensureTaskVisible 404) today.
- **INTERNAL lacks** CUST's `lib/dailyReviewScope.ts` and `GET /overview/badges` (both from other CUST features); Daily Review scope is inline in `routes/dailyReview.ts:141-247`. The member arm must be added to the inline `projectWhere` at `dailyReview.ts:197-208` (or to dailyReviewScope.ts if the nav-badge spec ports it first).
- **CUST migrations have no backfill** (`20260930090000_project_members/migration.sql` and `20260930150000_share_links/migration.sql` are pure DDL).

## 1. Behaviour spec (as shipped in CUST, with INTERNAL deltas marked **[INT]**)

### 1.1 Project members (CUST `af9a362`; contract = `docs/archive/plans/collaboration-and-sharing.md:34-61`)

**Data**: `ProjectMember(projectId, userId, addedById?, createdAt)`, PK `(projectId,userId)`, index `userId`, cascade on project/user delete, `addedBy` SetNull. The project's TAM is never stored as a member row.

**API** (CUST `backend/src/routes/projectMembers.ts`, 203 lines, mounted `app.use("/projects", projectMembersRouter)` right after `projectsRouter`):
| Route | Perm | Gate order | Result |
|---|---|---|---|
| `GET /projects/:id/members` | `project:read` (:67) | params → `ensureProjectVisible` (404) (:51-55,69) | rows ordered by username, excluding the current TAM (`user.projectsAsTAM none {id}` :75): `{ userId, username, email, avatarUrl, addedAt, addedBy:{id,username}|null, assignedTaskCount }` (:37-47, groupBy :81-86) |
| `POST /projects/:id/members` `{userId}` | `project:write` (:93) | params → visible 404 → body validate (so hidden ≠ 400) | 400 `is_tam` (:105-107); 404 `user_not_found` (:112); existing member → **200** idempotent even if since deactivated (:115-122); 400 `user_inactive` for a NEW add (:123); `createMany skipDuplicates` race-safe, 201 on insert, records activity `member/added` (:127-150) |
| `DELETE /projects/:id/members/:userId` | `project:write` (:156) | visible 404 | 204 always (idempotent). In one tx: delete row; if a row was removed AND userId ≠ current TAM → `task.updateMany({projectId, assignedToId:userId}) → assignedToId null` (:167-184); activity `member/removed` with `changes.unassignedTasks` (:185-199) |

**Who may manage members**: anyone who can SEE the project and holds `project:write` — TAM, customer owner, existing members, view-all writers (plan :47, test `projectMembers.test.ts:181` "an existing member can add another member"). **Not** owner-gated.

**Member rights**: identical to TAM for everything except owner-only actions (§1.2). Visibility arm `members.some({userId})` (CUST `visibility.ts:51-53`) flows through every `projectVisibilityFilter` caller (tasks, sections, labels, risks, dependencies, notes feed, search, overview, customers via the project arm, iTop reads in CUST).

**Auto-add on assignment** (`backend/src/lib/projectMembers.ts:26-47` `ensureAssigneeIsMember(tx, projectId, assigneeId, addedById)`): no-op if project missing, assignee is the TAM, or assignee unknown/inactive; else `createMany skipDuplicates`; returns `{username}` only when a NEW row was created → caller records `member/added` activity. Call sites:
- `POST /projects/:id/tasks` when `assignedToId != null` (CUST `projects.ts:490-504`) — **[INT]** insert into the tx at INTERNAL `projects.ts:388-401` (before `countSiblings`).
- `PATCH /tasks/:id` only when `body.assignedToId != null && body.assignedToId !== current.assignedToId` (CUST `tasks.ts:430-455`) — **[INT]** add `assignedToId: true` to the `current` select at INTERNAL `tasks.ts:154-164` and call inside the tx at `tasks.ts:194-` before the `data` build.
- Never in `lib/duplicate.ts` (comment only, CUST `duplicate.ts:19-20`) — a copy must not re-grant a removed member. **[INT]** add the same comment to `lib/duplicate.ts`.
- Known accepted gap (`lib/projectMembers.ts:22-24`): `task:write` alone can add a member by assigning, while the members API needs `project:write`.
- **[INT] decision**: CUST skips only the TAM. In INTERNAL the project SA (and customer owner) already see the project; CUST would still insert a redundant member row for them and the picker would show "adds them to the project". Recommend: skip when `assigneeId === project.saId` too (treat SA like TAM — "already has access"), mirror in frontend `assigneeAddsMember`/`memberCandidates` (exclude `saId`), and in `POST /members` either allow (harmless) or 400 `is_sa` — recommend allow-but-hide-from-candidates to keep the API simple. Customer owner: keep CUST behaviour (row inserted) — unverified whether the user cares.

**Removal unassigns**: see DELETE row above; frontend warns first with `removalWarning(assignedTaskCount)` (CUST `frontend/src/lib/projectMembers.ts:57-62`). Self-removal → user who lost access is sent to `/projects` (plan :53; e2e `project-members.spec.ts:196`).

**Membership notice UI**: `ASSIGN_ADDS_MEMBER_NOTICE = "Assigning this person also adds them to the project."` (`lib/projectMembers.ts:5`). `assigneeAddsMember(assigneeId, tamId, members, active)` — false while members loading, for inactive, for TAM, for existing member (`:22-34`). `useAssigneeMembership(projectId)` (20 lines) reads `useProject`, `useProjectMembers`, `useUsers` caches. `AssigneeMembershipNotice.tsx` (28 lines) = plain `<p data-testid="assignee-membership-notice">` (deliberately not role=status). Used in `TaskFormModal` (notice under picker), `TaskPanel` (options marked "(not on project)" + line, fe-components.md L545-574), `views/ProjectList.tsx` inline picker (`AssigneeOptions`). Frontend invalidates the members query after any task save that sets `assignedToId` (`lib/queries.ts`).

**Daily Review / overview / badges scope**: "mine" = `tamId = me OR members.some(me)` replaces `tamId = me` in the attached-customer and no-customer project arms (CUST `lib/dailyReviewScope.ts` diff in af9a362). Owned customers unchanged. `/overview/badges` uses the same `resolveDailyReviewScope`. **[INT]**: patch inline `routes/dailyReview.ts:197-208` (`{ tamId: user.sub, customerId: { in: attachedIds } }` and `{ tamId: user.sub, customerId: null }`) → `{ AND: [mine, {customerId: …}] }`. SA projects stay OUT of Daily Review as today (comment `dailyReview.ts:226-236` explicitly prunes customers reached "purely as SA") — keep; adding the SA to "mine" would be a separate product change. Overview KPI (`routes/overview.ts:18` `projectScope`) picks up members automatically via `projectVisibilityFilter`. Badges: only if the nav-badge feature is ported (not in INTERNAL today).

**Other members-commit edits**: `GET /users` adds `active`, `avatarUrl` (CUST `users.ts` +4; **[INT]** `routes/users.ts` 35 lines, same hunk). `projectDetailInclude` adds `tam.avatarUrl` and `customer.tamId` (needed by frontend `canOwnProject`) — **[INT]** `projects.ts:76-86` also has `sa:{…}`; add `avatarUrl` to `sa` too for header avatars (optional). Blocked-link copy: project 404 → "This project doesn't exist or isn't shared with you. Ask the project's TAM to add you as a member."; customer → "This customer doesn't exist or isn't shared with you." (plan :54).

### 1.2 Owner-only gates (CUST — every call site)

Shape: `throw new HttpError(403, "owner_only", "Only the project's TAM can do this")` (CUST `visibility.ts:109`) / `"Only the customer's owner can do this"` (:201); rendered by the global handler as `{ error, code: "owner_only", details }`. Always AFTER the 404 visibility check (`ensureProjectOwnerAccess` calls `ensureProjectVisible` first, :103).

| # | File:line (CUST) | Action | Gate |
|---|---|---|---|
| G1 | `routes/projects.ts:355-370` | `PATCH /projects/:id` with `tamId` or `customerId` that **differs** from current (re-saving current values is not a change) | `ensureProjectOwnerAccess` |
| G2 | `routes/projects.ts:421` | `DELETE /projects/:id` | `ensureProjectOwnerAccess` (replaces `ensureProjectVisible`) |
| G3 | `routes/customers.ts:455-460` | `PATCH /customers/:id` with `tamId` ≠ existing | `ensureCustomerOwnerAccess` |
| G4 | `routes/customers.ts:504` | `DELETE /customers/:id` | `ensureCustomerOwnerAccess` |
| G5 | `routes/shareLinks.ts:47-50` (`requireOwner` middleware) | POST/GET/DELETE `/projects/:id/share-links[/:linkId]` | `ensureProjectOwnerAccess` |
| — | `lib/visibility.ts:143-155,191-203` | `customerVisibilityFilter(user, {viaMembership:false})` used only by `ensureCustomerOwnerAccess` | |

`viaMembership:false` is used ONLY inside `visibility.ts` (:105, :197) — no route passes it directly (grep verified). Not gated in CUST (members may do them): all task/section/label/risk/dependency/note/baseline/WIP/service edits, project name/description/status/excludeFromPortfolio, member add/remove, customer name/AM/description edits.

**Frontend mirror** `frontend/src/lib/ownerAccess.ts` (62 lines): `canOwnProject(user, {tamId}, customerOwnerId)` = view-all | TAM | customer owner (`:21-30`); `canOwnCustomer(user, {tamId}, projectTamIds)` = view-all | owner | unowned | TAM of one of its visible projects (`:37-46`); `OWNER_ONLY_MESSAGE`, `isOwnerOnlyError`, `saveErrorMessage` (:48-62). Consumers: `ProjectDetail` (Delete in ⋯ menu, Share button `canEdit && isOwner`, `ProjectFormModal canChangeOwnership={isOwner}` disables TAM/customer fields), `Customers`/`CustomerDetail` (Delete only where owner; `CustomerFormModal canChangeOwner`). Tests `ownerAccess.test.ts` (13).

### 1.3 Guest links (CUST `eadc065`; contract = plan :112-142)

- **Create** `POST /projects/:id/share-links` `{label?: ≤80 trimmed (empty→null), expiresInDays?: int 1-90 default 30}` → 201 `{id,label,expiresAt,createdAt,url:"/share/<token>"}` (relative; client prefixes `window.location.origin`). Perm `project:write` + owner (`routes/shareLinks.ts:56-95`). The UI offers 7 / 30 / 90 days (`frontend/src/lib/shareLinks.ts` / `ProjectShare.tsx` — the API accepts any 1-90). Activity `share_link/created` with label only.
- **List** `GET …/share-links` perm `project:read` + owner → `[{id,label,createdAt,expiresAt,revokedAt,lastUsedAt,createdBy:{id,username}|null}]` desc by createdAt,id — never token/hash (:97-119). STAKEHOLDER (view-all, read-only) can list, not create/revoke.
- **Revoke** `DELETE …/share-links/:linkId` perm `project:write` + owner; 404 `not_found` if link not in that project; sets `revokedAt` via `updateMany where revokedAt null` (idempotent, activity only on the real revoke) → 204 (:121-153).
- **Token**: `randomBytes(32).toString("base64url")` = 43 chars, 256-bit (`lib/shareLinks.ts:26-28`); stored as SHA-256 hex `tokenHash @unique` (:31-33). Shown once. Format gate `/^[A-Za-z0-9_-]{43}$/` (:23) — malformed never hits the DB.
- **Public** `GET /public/share/:token` (`routes/publicShare.ts`): router-level `Cache-Control: no-store` + `X-Robots-Tag: noindex` on every response incl. 404/429 (:22-28); rate limit 60/min per IP (:9-15,29); `findActiveShareLink` by hash, null if missing/revoked/`expiresAt <= now` (`lib/shareLinks.ts:139-146`); uniform 404 `{error:"This link has expired or is no longer available", code:"not_found"}` (:17-18,37); malformed percent-escape (Express 400 URIError) remapped to the same 404 (:49-58). `touchShareLink` bumps `lastUsedAt` at most once/hour via conditional `updateMany` (`lib/shareLinks.ts:149-157`).
- **Payload** (allow-list `select`, `lib/shareLinks.ts:84-132`): `{ project:{name, customerName|null, status}, phases:[{name,startDate,endDate,status:"done"|"in_progress"|"not_started"}], milestones:[{title,date,done}], generatedAt }`. Phases = sections in `position,id` order, dates from their tasks (start = min(start??due), end = max(due??start)), status derived (`derivePhase` :69-82). Milestones = all `isMilestone` tasks (incl. subtasks — unverified whether intended) with a due/start date, sorted by date. Never notes, comments, risks, people, emails, iTop, activity, non-milestone task detail (test `shareLinks.test.ts:514`).
- **Frontend**: `ProjectShare.tsx` (411) dialog: create (label, expiry), show new link once + Copy, list (label, created by, expiry, last used, revoked), Revoke. `pages/PublicShare.tsx` (295) at `/share/:token` outside AuthGuard/Shell, phases timeline + milestones + "Updated <time>", unavailable page on 404; `lib/shareLinks.ts` (135: `PHASE_STATUS_TONE`, `phaseStatusOf`, `timelineLayout`, expiry options); `usePublicShare` in queries.ts (must not attach the bearer/redirect to login on 401 — verify api client behaviour in INTERNAL, unverified).

## 2. Merged visibility design for INTERNAL

### 2.1 Target semantics
- **See** a project (read + write subject to role perms): `project:view-all` OR `tamId = me` OR `saId = me` OR `customer.tamId = me` OR `members.some(userId = me)` — four arms.
- **Own** a project (owner-only gates): `project:view-all` OR `tamId = me` OR `customer.tamId = me`. **SA excluded, member excluded.**
- **See** a customer: view-all OR `tamId = me` OR `tamId = null` OR `projects.some(<see project>)` (so SAs and members reach the customer behind their project — same as today for SA).
- **Own** a customer: view-all OR `tamId = me` OR `tamId = null` OR `projects.some(<own project>)` (= CUST's rule; SA-via-project no longer qualifies).
- Owner gate = 404 if not visible, then 403 `owner_only` if visible but not owned.

CUST's boolean `viaMembership:false` is not expressive enough (it would keep the SA arm in the owner rule). Replace it with an explicit **access level**.

### 2.2 Pseudo-code (`backend/src/lib/visibility.ts`, spine)
```ts
export type ProjectAccess = "see" | "own";

export function projectVisibilityFilter(user: JwtPayload, access: ProjectAccess = "see"): Prisma.ProjectWhereInput {
  if (hasPermission(user, "project:view-all")) return {};
  const arms: Prisma.ProjectWhereInput[] = [
    { tamId: user.sub },
    { customer: { tamId: user.sub } },
  ];
  if (access === "see") {
    arms.push({ saId: user.sub });                              // SA arm (INTERNAL only) — visibility, never ownership
    arms.push({ members: { some: { userId: user.sub } } });     // member arm (from CUST)
  }
  return { OR: arms };                                          // only top-level key stays `OR` (AND-compose rule unchanged)
}

export interface ProjectVisibilityFacts {
  tamId: number | null; saId: number | null; customerTamId: number | null; memberIds: ReadonlySet<number>;
}
export function canUserSeeProject(user, p: ProjectVisibilityFacts): boolean {   // pure twin (needed only once notifications are ported)
  return hasPermission(user, "project:view-all") || p.tamId === user.sub || p.saId === user.sub
      || p.customerTamId === user.sub || p.memberIds.has(user.sub);
}
export function canUserOwnProject(user, p): boolean {                           // optional pure twin for tests/UI parity
  return hasPermission(user, "project:view-all") || p.tamId === user.sub || p.customerTamId === user.sub;
}

export async function ensureProjectVisible(user, projectId)   // unchanged body (uses "see")
export async function ensureTaskVisible(user, taskId)          // unchanged
export async function ensureProjectOwnerAccess(user, projectId) {
  await ensureProjectVisible(user, projectId);                 // 404 first
  const owned = await prisma.project.findFirst({ where: { id: projectId, ...projectVisibilityFilter(user, "own") }, select: { id: true } });
  if (!owned) throw new HttpError(403, "owner_only", "Only the project's TAM or the customer's owner can do this");
}

export function customerVisibilityFilter(user, access: ProjectAccess = "see"): Prisma.CustomerWhereInput {
  if (hasPermission(user, "project:view-all")) return {};
  return { OR: [ { tamId: user.sub }, { tamId: null }, { projects: { some: projectVisibilityFilter(user, access) } } ] };
}
export async function isCustomerVisible(user, id)       // unchanged ("see")
export async function ensureCustomerVisible(user, id)   // unchanged
export async function ensureCustomerOwnerAccess(user, customerId) {
  await ensureCustomerVisible(user, customerId);
  const owned = await prisma.customer.findFirst({ where: { id: customerId, ...customerVisibilityFilter(user, "own") }, select: { id: true } });
  if (!owned) throw new HttpError(403, "owner_only", "Only the customer's owner can do this");
}
```
Message wording: CUST says "Only the project's TAM can do this" though customer owners also pass — suggest the wording above (frontend shows its own `OWNER_ONLY_MESSAGE` anyway). Keep the `code` exactly `owner_only`.

Comment block to rewrite at `visibility.ts:6-20` (mention SA = see-not-own; cite `docs/archive/plans/<this plan>.md`). backend/CLAUDE.md's visibility convention line must be updated too (CUST `b98ac14` changed it) — this is a convention change, so allowed by Docs Discipline.

### 2.3 Caller mapping

INTERNAL callers (all keep default `"see"` unless stated; every one gains the member arm automatically):
| INTERNAL file:line | Helper | After port |
|---|---|---|
| `routes/projects.ts:127` GET / | projectVisibilityFilter | unchanged (members now listed) |
| `projects.ts:149` POST / | isCustomerVisible | unchanged (a member may create under a customer seen via membership — same as CUST) |
| `projects.ts:177` GET /:id | projectVisibilityFilter | unchanged; include adds `customer.tamId`, `tam.avatarUrl` |
| `projects.ts:198,255` baseline | ensureProjectVisible | unchanged |
| `projects.ts:302` PATCH /:id | ensureProjectVisible | + owner check when `tamId`/`customerId` (and **saId — decision D2**) differ from current (CUST pattern `projects.ts:357-370`) |
| `projects.ts:313` PATCH customerId | isCustomerVisible | unchanged (runs after owner check) |
| `projects.ts:336` DELETE /:id | ensureProjectVisible | → `ensureProjectOwnerAccess` |
| `projects.ts:356,385,450,467,500,517,577,613,640,665,705,741,776,793,865,882` nested (tasks, sections, labels, risks, notes, reviews, services, deps, gantt…) | ensureProjectVisible | unchanged |
| `projects.ts:385` POST /:id/tasks | ensureProjectVisible | + `ensureAssigneeIsMember` in tx |
| `routes/tasks.ts:76` list / `:148,290,308,350,367` | projectVisibilityFilter / ensureTaskVisible | unchanged; PATCH (:148) + `ensureAssigneeIsMember` on assignee change |
| `routes/customers.ts:175,183,196,209` list + counts | customerVisibilityFilter / projectVisibilityFilter | unchanged |
| `customers.ts:216` GET /:id | customerVisibilityFilter | unchanged |
| `customers.ts:242,390(DELETE),410,437,463,496,551,573` | ensureCustomerVisible | `:390` DELETE → `ensureCustomerOwnerAccess`; rest unchanged |
| `customers.ts:341` PATCH (inline) | customerVisibilityFilter | + `if (body.tamId !== undefined && body.tamId !== existing.tamId) await ensureCustomerOwnerAccess(user,id)` before building `data` (CUST `customers.ts:455-460`). Keep INTERNAL's `tam_required` un-owning guard. |
| `routes/notes.ts:64,81` feed | both filters | unchanged |
| `routes/labels.ts:18`, `sections.ts:24`, `risks.ts:38,59`, `dependencies.ts:27` | ensureProjectVisible | unchanged |
| `routes/overview.ts:18` | projectVisibilityFilter | unchanged |
| `routes/search.ts:30,68` | both | unchanged |
| `routes/dailyReview.ts:154,160` | both | unchanged; **edit `:197-208` project "mine" arms** (§1.1) |
| `routes/opportunities.ts:1129` handoff | isCustomerVisible | unchanged |
| `routes/reports.ts:24` | (comment: deliberately unscoped) | unchanged |

CUST-only callers to bring along: `routes/projectMembers.ts:53` (ensureProjectVisible), `routes/shareLinks.ts:48` (ensureProjectOwnerAccess), `routes/customers.ts:459,504` (ensureCustomerOwnerAccess), `routes/projects.ts:368,421` (ensureProjectOwnerAccess), `routes/activity.ts:33`, `routes/notifications.ts:31`, `lib/notifications.ts:74` (canUserSeeProject — **must get `saId` in facts**, other spec), `lib/dailyReviewScope.ts:36,42` (if nav badges ported), `routes/epics.ts:23`, `routes/itop.ts:*` (other specs — they inherit the four-arm rule for free).

### 2.4 Truth table — SA-only user (attached only via `Project.saId`, not TAM/customer owner/member, no view-all)

Columns: **SA** = stock SA role (`project:read` + pipeline perms only); **SA+w** = a role with `project:write`+`task:write` (custom role, or SA role edited in Admin until the next restart re-seeds it).

| Action (route) | Today SA | Today SA+w | After SA | After SA+w | Note |
|---|---|---|---|---|---|
| Open project, tasks, Gantt, notes (GET) | 200 | 200 | 200 | 200 | unchanged |
| Edit project name/status/desc/WIP (PATCH /projects/:id) | 403 forbidden | 200 | 403 forbidden | 200 | |
| Change TAM (PATCH tamId) | 403 forbidden | **200** | 403 forbidden | **403 owner_only** | REGRESSION for SA+w (intended) |
| Change customer (PATCH customerId) | 403 forbidden | **200** | 403 forbidden | **403 owner_only** | REGRESSION for SA+w (intended) |
| Change SA (PATCH saId) | 403 forbidden | 200 | 403 forbidden | 200 or 403 owner_only | **decision D2** (recommend owner_only) |
| Delete project | 403 forbidden | **204** | 403 forbidden | **403 owner_only** | REGRESSION for SA+w (intended) |
| Create task (POST /projects/:id/tasks, project:write) | 403 | 201 | 403 | 201 (+ may auto-add assignee as member) | |
| Edit/delete task (task:write) | 403 | 200 | 403 | 200 | |
| List members | n/a | n/a | 200 | 200 | project:read + visible |
| Add/remove members | n/a | n/a | 403 forbidden | 201/204 | CUST rule = any visible writer; **decision D3** |
| List share links | n/a | n/a | **403 owner_only** | 403 owner_only | SA passes project:read, fails owner |
| Create/revoke share link | n/a | n/a | 403 forbidden | 403 owner_only | user decision: SA not owner |
| Customer: see it (via SA project) | 200 | 200 | 200 | 200 | unchanged |
| Customer: edit name/AM/description | 403 | 200 | 403 | 200 | |
| Customer: change owner (PATCH tamId) | 403 | **200** | 403 | **403 owner_only** | REGRESSION for SA+w — closes a real hole: today an SA+w can take over (or delete) another TAM's customer just by being SA on one of its projects |
| Customer: delete | 403 | **204** | 403 | **403 owner_only** | same |
| Won-deal handoff | 403 (no project:write) | 201, caller becomes TAM by default | same | same | not owner-gated (creation) |

**Regression verdict**: with the shipped roles (seed overwrites SA perms on every start, `seed.ts:33-37`) **no SA user loses anything** — they already get 403 `forbidden` on every write. Only SA+w users (custom roles / transient Admin edits) lose: change TAM, change customer, delete project, change/delete customer — exactly the user's decision. Frontend: hide those controls for SA via `canOwnProject` (no SA arm).

**Customer visibility for SAs**: today = owned | unowned | via any project where they are TAM/SA/customer owner (`visibility.ts:77-86`). After = same + via member projects. No SA loses customer visibility. Daily Review for SAs: unchanged (SA projects remain out of "mine").

## 3. Pipeline interplay

- **Handoff** (`backend/src/routes/opportunities.ts:1094-1220`): gates = `assertCanWriteOpportunity(user,"edit",deal)` (pipelineAccess) + explicit `project:write` (:1110-1113); `tamId = body.tamId ?? caller` (:1124); `isCustomerVisible` → 400 (:1129-1131); one tx creates the project (`saId: body.saId`, :1137-1148) and links the deal. It is a **creation**, not an owner action — no owner gate applies and none should be added. The frontend (`components/DealCard.tsx:245-285`, `HandoffProjectModal`) requires an explicit TAM and prefills `saId` = deal PIC via `lib/handoffDefaults.ts:57-61` when the PIC is in the users list, then navigates to `/projects/:id`.
- **Members on handoff**: not needed. TAM and SA arms already grant visibility to both people the handoff names. Recommend: no `ProjectMember` rows from handoff (keeps "the TAM is never a member row" and avoids a redundant SA row). Edge (pre-existing, unchanged): a caller who sets another TAM and is not the SA/view-all is navigated to a project they cannot open (404 → now shows the "isn't shared with you" copy).
- **Consequence of "SA is not owner"**: the deal PIC (an SA) handed a project cannot create guest links, delete the project, or re-parent it; they keep full visibility and (with write perms) can edit tasks/fields and — under CUST's rule — manage members (decision D3).
- **`lib/pipelineAccess.ts` vs owner gating**: no overlap. pipelineAccess gates **Opportunity** rows by `picId` + `pipeline:*_own/_all` (`:22-36`, `:38-62`); owner gating gates **Project/Customer** rows by TAM/customer owner/view-all. The only intersection is the handoff route, which composes pipeline-edit + `project:write` and needs no change. Do NOT reuse pipelineAccess for projects. `PIC_SELECT` (`:15`, includes `avatarUrl`) is a reusable user-shape precedent for member rows.
- **Project delete with a linked deal**: `Opportunity.projectId` is `onDelete: SetNull` (comment `projects.ts:340-345`); delete becomes owner-gated — no pipeline change. CUST ProjectDetail's delete wording dropped INTERNAL's "unlinks any won deal" sentence — keep INTERNAL's wording (fe-pages.md).
- **Required changes**: none in `opportunities.ts`, `pipelineAccess.ts`, `handoffDefaults.ts`. Add one backend test: after handoff by an ADMIN with `saId = SA user`, the SA sees the project (200) and gets 403 `owner_only` on `POST /projects/:id/share-links` / `DELETE /projects/:id` (when given write perms). Extend `test/opportunityHandoff.test.ts` or the new `projectOwnership.test.ts`.

## 4. Schema

### 4.1 CUST models (verbatim, `backend/prisma/schema.prisma:224-242`, `:758-779`)
```prisma
// User additions
  projectMemberships     ProjectMember[]       @relation("ProjectMemberUser")
  projectMembersAdded    ProjectMember[]       @relation("ProjectMemberAddedBy")
  shareLinksCreated      ShareLink[]
// Project additions
  members              ProjectMember[]
  shareLinks           ShareLink[]

model ProjectMember {
  projectId Int      @map("project_id")
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  userId    Int      @map("user_id")
  user      User     @relation("ProjectMemberUser", fields: [userId], references: [id], onDelete: Cascade)
  addedById Int?     @map("added_by_id")
  addedBy   User?    @relation("ProjectMemberAddedBy", fields: [addedById], references: [id], onDelete: SetNull)
  createdAt DateTime @default(now()) @map("created_at")
  @@id([projectId, userId])
  @@index([userId])
  @@map("project_members")
}

model ShareLink {
  id          Int       @id @default(autoincrement())
  projectId   Int       @map("project_id")
  project     Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  tokenHash   String    @unique @map("token_hash")
  label       String?
  createdById Int?      @map("created_by_id")
  createdBy   User?     @relation(fields: [createdById], references: [id], onDelete: SetNull)
  createdAt   DateTime  @default(now()) @map("created_at")
  expiresAt   DateTime  @map("expires_at")
  revokedAt   DateTime? @map("revoked_at")
  lastUsedAt  DateTime? @map("last_used_at")
  @@index([projectId])
  @@map("share_links")
}
```
Note: INTERNAL `User` already has two `Project` relations (`ProjectSA`, `ProjectTAM`, schema.prisma:173-174), so the named relations on ProjectMember are required (two User FKs on one model) — ShareLink has only one User FK so its relation can stay unnamed. `users.avatar_url` and `users.active` already exist in INTERNAL (:168, :171).

### 4.2 CUST migration SQL (verbatim)
`20260930090000_project_members/migration.sql`:
```sql
CREATE TABLE "project_members" ("project_id" INTEGER NOT NULL, "user_id" INTEGER NOT NULL, "added_by_id" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "project_members_pkey" PRIMARY KEY ("project_id","user_id"));
CREATE INDEX "project_members_user_id_idx" ON "project_members"("user_id");
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```
`20260930150000_share_links/migration.sql`:
```sql
CREATE TABLE "share_links" ("id" SERIAL NOT NULL, "project_id" INTEGER NOT NULL, "token_hash" TEXT NOT NULL, "label" TEXT,
  "created_by_id" INTEGER, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3), "last_used_at" TIMESTAMP(3), CONSTRAINT "share_links_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "share_links_token_hash_key" ON "share_links"("token_hash");
CREATE INDEX "share_links_project_id_idx" ON "share_links"("project_id");
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```
**No backfill in either** (verified).

### 4.3 INTERNAL fresh migrations
INTERNAL's latest migration is `20260925140000_opportunity_flow_redesign`. Generate with `docker compose exec -it backend npx prisma migrate dev --name project_members` and later `--name share_links` (never hand-copy CUST's directory names/timestamps; let Prisma stamp them). Expected SQL = §4.2 byte-for-byte (same table/column names; INTERNAL `projects`/`users` tables match). Order relative to the activity-log migration (other spec) does not matter (no FK between them), but each phase's migration should land in its own PR/commit. Spine: `schema.prisma` + migrations → instant opus review.

### 4.4 Backfill (USER DECISION D4)
Today in INTERNAL an assignee who is not TAM/SA/customer owner **cannot see the project or the task** (no assignee arm; `ensureTaskVisible` 404; GET /tasks filtered). Such "orphan assignments" exist only if someone assigned a non-attached user (the picker offers all users — `ProjectFormModal`/task pickers use `useUsers()` unfiltered). After the port, NEW assignments add membership; OLD orphan assignments stay invisible to their assignee.
Options: (a) no backfill (CUST parity; orphans stay invisible until reassigned); (b) data migration that grants access to existing assignees:
```sql
-- optional, append to the project_members migration (or a separate one-off migration)
INSERT INTO "project_members" ("project_id", "user_id", "added_by_id", "created_at")
SELECT DISTINCT t."project_id", t."assigned_to", NULL::INTEGER, CURRENT_TIMESTAMP
FROM "tasks" t
JOIN "projects" p ON p."id" = t."project_id"
JOIN "users" u ON u."id" = t."assigned_to" AND u."active" = true
LEFT JOIN "customers" c ON c."id" = p."customer_id"
WHERE t."assigned_to" IS NOT NULL
  AND t."assigned_to" <> p."tam_id"
  AND t."assigned_to" IS DISTINCT FROM p."sa_id"
  AND t."assigned_to" IS DISTINCT FROM c."tam_id"
ON CONFLICT DO NOTHING;
```
(column `tasks.assigned_to` verified `schema.prisma:336`; `projects.customer_id` :215 and `customers` :269 verified.) Recommend (b) only after the user sees a count query (`SELECT count(*) …` same WHERE) on prod data — it silently widens access. Default recommendation: **(a)**, plus a one-off report of orphan assignments.

## 5. Guest-link infrastructure — hunk-by-hunk vs INTERNAL

| File | CUST change (eadc065) | INTERNAL state | Port action |
|---|---|---|---|
| `backend/src/http/rateLimit.ts` (new, 120) | fixed-window in-memory limiter, per-IP key (IPv4 as-is, v4-mapped v6 collapsed, other v6 → /56), `maxKeys` 10k with sweep + oldest eviction, `Retry-After`, throws `HttpError(429,"rate_limited")` | absent | copy verbatim |
| `backend/src/http/trustProxy.ts` (new, 38) | `parseTrustProxy`: hop count 0-10 or list of loopback/linklocal/uniquelocal/IPv4/IPv6/CIDR; rejects `true`; validates via `express().set` | absent | copy verbatim |
| `backend/src/http/requestLogger.ts` (new, 44) | `pinoHttp` with `serializers.req = redactSerializedRequest` (redacts `/share/<token>` in url + referer/referrer, masks `authorization`), `customProps.clientIp = req.ip` | `app.ts:44` uses bare `pinoHttp({ logger })` — **today INTERNAL logs the Authorization header?** pino's std req serializer includes headers → bearer JWTs are in INTERNAL request logs today (unverified at runtime; pino-http default serializer does include `headers`). Port fixes this independent of guest links. | copy verbatim |
| `backend/src/env.ts` | `+TRUST_PROXY` zod string default "1" transformed by `parseTrustProxy` (fail-fast at boot) | 21 lines, no SECRETS_KEY/ITOP lines (CUST context differs) | insert block after `LOG_LEVEL` (manual merge, 1 hunk) |
| `backend/src/app.ts` | `app.set("trust proxy", env.TRUST_PROXY)` after `disable("x-powered-by")`; `createRequestLogger(opts.logger ?? defaultLogger)` replaces `pinoHttp`; `createApp(opts:{logger?})` (for requestLogger tests); `app.use("/public/share", publicShareRouter)` **before** `express.json` and before every authed router; `app.use("/projects", projectMembersRouter)` + `shareLinksRouter` after `projectsRouter` | `app.ts:30-75`; no `/webhook` mount (CUST mounts public share right after it) | manual merge, 4 hunks; mount order: helmet → cors → requestLogger → `/public/share` → `express.json` → `/health`… → `/projects` ×3 (projects, members, shareLinks; + activity if ported) |
| `frontend/nginx.conf` | `location ^~ /api/public/share/ { access_log off; proxy_pass http://backend:3000/public/share/; same proxy headers }` and `location ^~ /share/ { access_log off; add_header Cache-Control no-store; Referrer-Policy no-referrer; X-Robots-Tag noindex; rewrite ^ /index.html break; }` inserted before `location /` | **identical** to CUST's parent (diff empty) | apply hunk verbatim (spine: nginx.conf) |
| `frontend/vite.config.ts` | `navigateFallbackDenylist: [/^\/api\//, /^\/share\//]` | INTERNAL `:50` = `[/^\/api\//]`; only other diff = CUST's `allowedHosts` block (INTERNAL uses untracked `vite.config.local.ts`) | 1-line edit |
| `setup.sh` | header doc for `TRUST_PROXY`; `is_trust_proxy()` validator; compose env `TRUST_PROXY: "${TRUST_PROXY:-1}"`; read `TRUST_PROXY` from env; validate if set; write quoted to `.env` | differs from CUST parent only by SECRETS_KEY lines and image names (diff verified) | 6 hunks, context fix at the compose env block (INTERNAL has no `SECRETS_KEY:` line above `CORS_ORIGIN`; insert after `LOG_LEVEL: info`, INTERNAL `setup.sh:146`) and near `chmod 600 "$ENV_FILE"` (:302) |
| `frontend/src/App.tsx` | `<Route path="/share/:token" element={<PublicShare/>}/>` outside AuthGuard/Shell | INT 99 lines | 2-line edit |
| `frontend/src/lib/api.ts` | (no change in eadc065) `apiRequest(path,{auth:false})` | INTERNAL already supports `auth?: boolean` (`api.ts:28-41`) — verified | none |
| docs | CONFIGURATION.md TRUST_PROXY row + nginx §2.6 + logging §2.10 + setup §2.13; backend/CLAUDE.md public-surface + request-logging rules; ISSUES.md 5 deferred findings | — | docs-keeper trigger (env/nginx/setup.sh/vite.config touched) |

**TRUST_PROXY for this VM**: the dev VM is reached through a tunnel (memory: solvro-internal.bapi.my.id → Vite dev server). Vite's `/api` proxy (`vite.config.ts:85-93`) does not set `xfwd`, so in dev `req.ip` = the Vite container and every guest shares one bucket; a client-supplied `X-Forwarded-For` is passed through by http-proxy and, with `TRUST_PROXY=1`, would be believed (dev-only spoof, low). For a prod deploy behind cloudflared, use `TRUST_PROXY="loopback, uniquelocal"` (CUST CONFIGURATION.md guidance).

### 5.1 Security review inputs
- **Entropy**: 32 bytes CSPRNG (`crypto.randomBytes`) → 256 bits, base64url 43 chars. Brute force infeasible.
- **Hashing**: unsalted SHA-256 hex, unique index. Adequate for 256-bit random tokens (no dictionary; salt/HMAC unnecessary). A DB dump does not yield usable links.
- **Timing-safe compare**: none, and none needed — lookup is `findUnique({ tokenHash })`; the secret is never compared in JS, and index timing on a preimage-resistant hash leaks nothing exploitable.
- **Enumeration**: uniform 404 body/code/headers for unknown/expired/revoked/malformed/bad-escape; format regex rejects non-43-char tokens before DB; 60 req/min/IP (unknown tokens count). Owner routes: 404 before 403 before body validation (hidden project ≠ 400). Revoke of another project's linkId → 404.
- **Payload exposure** (decision D5): project name, **customer name**, project status, **section names** (as phase names), **milestone titles** (incl. subtask milestones — unverified intent), derived dates/status, `generatedAt`. No people/notes/comments/risks/iTop/activity. INTERNAL-notes guardrail not engaged (no notes selected) — the allow-list `select` in `lib/shareLinks.ts:88-107` is the enforcement point; keep the "nothing leaks" test. Risk: internal wording in section/milestone names; customer name reveals the client relationship to anyone holding the link.
- **Caching**: API `Cache-Control: no-store` on every response incl. 404/429; nginx `/share/` document `no-store`; SW navigate-fallback denylist so a precached shell never serves `/share/` without headers; `usePublicShare` staleTime 60s, no retry, no refetchOnWindowFocus (in-memory only).
- **Robots / referrer**: `X-Robots-Tag: noindex` on API + document; `Referrer-Policy: no-referrer` on the `/share/` document (helmet already sends `no-referrer` on API responses); no robots.txt change. Google Fonts still loaded from the share page (deferred finding).
- **Logs**: pino url/referer redaction + Authorization mask; nginx `access_log off` on both paths; **nginx `error_log` can still contain the token** (deferred, documented).
- **Rate limit caveats**: in-process only (single backend instance assumed); IPv6 /56 bucketing; `BACKEND_PORT` is published directly by setup.sh (bound to `BIND_ADDR`, default 127.0.0.1) — if exposed (`0.0.0.0`) with a hop-count TRUST_PROXY, XFF spoofing bypasses the limit.
- **Link building**: copied URL = `window.location.origin + "/share/<token>"`; an owner on a tunnel/localhost origin gets an unusable link (deferred; `PUBLIC_BASE_URL` idea). Relevant on this VM (tunnel hostname is fine if guests can reach it).
- **Authorization**: create/revoke = `project:write` + owner; list = `project:read` + owner. SA never owner → cannot publish a project externally (user decision honoured).
- **Pre-existing, surfaced by this work**: `errorHandler` ignores `err.status` → malformed JSON bodies 500 app-wide (CUST ISSUES); INTERNAL `errors.ts:23-` has the same shape (verified structure, not runtime).

## 6. File lists (line counts: CUST file size; INT = current INTERNAL size)

### 6.1 Backend — new files (copy from CUST, adapt where noted)
| File | Lines | Phase | Adaptation |
|---|---|---|---|
| `backend/src/routes/projectMembers.ts` | 203 | members | `is_tam` check; optional SA exclusion (D1); drop `recordActivity` calls if activity not ported first |
| `backend/src/lib/projectMembers.ts` | 47 | members | skip `assigneeId === project.saId` (D1) → select `saId` too |
| `backend/src/routes/shareLinks.ts` | 153 | share | none (uses `ensureProjectOwnerAccess`) |
| `backend/src/routes/publicShare.ts` | 65 | share | none |
| `backend/src/lib/shareLinks.ts` | 157 | share | imports `dayString` from `lib/activity.ts` — if activity is not yet ported, inline `dayString` = `d === null ? null : utcMidnightOf(d).toISOString().slice(0,10)` (CUST `lib/activity.ts:75-77`; `utcMidnightOf` exists in INTERNAL `lib/dateBoundary.ts:45`) |
| `backend/src/http/rateLimit.ts` | 120 | infra | none |
| `backend/src/http/trustProxy.ts` | 38 | infra | none |
| `backend/src/http/requestLogger.ts` | 44 | infra | none |
| migrations ×2 | 22 + 27 | members / share | generated fresh |

### 6.2 Backend — edits to shared files
| File (INT lines) | Hunks | Notes |
|---|---|---|
| `lib/visibility.ts` (115 → ~215) | rewrite per §2.2 | SPINE |
| `prisma/schema.prisma` | +2 models, +3 User fields, +2 Project fields | SPINE |
| `routes/projects.ts` (892) | import; `projectDetailInclude` +`customer.tamId`, +`tam.avatarUrl` (+`sa.avatarUrl` optional) (:76-86); PATCH owner check (:302) incl. saId per D2; DELETE → owner (:336); POST /:id/tasks `ensureAssigneeIsMember` (+activity) (:388-401); fix stale comment `:170-175` (mentions `{tamId},{saId},{customer:{tamId}}`) | SPINE (notes+baseline file) |
| `routes/tasks.ts` (378) | import; `current` select +`assignedToId` (:154-164); `ensureAssigneeIsMember` on change in tx (:194-) | SPINE (task ordering file) |
| `routes/customers.ts` (704) | import; PATCH owner check on tamId change (:339-347); DELETE → `ensureCustomerOwnerAccess` (:390) | |
| `routes/dailyReview.ts` (516) | `mine` OR (tamId | member) in project arms (:197-208); comments :141-150, :226-236 | |
| `routes/users.ts` (35) | `active`, `avatarUrl` in select + DTO | |
| `routes/overview.ts` (71) | none (badges only if nav-badge spec ports `/overview/badges` + `lib/dailyReviewScope.ts`) | |
| `lib/duplicate.ts` (189) | comment: duplication never adds members | |
| `app.ts` (75) | trust proxy, requestLogger, `/public/share` before json, members + shareLinks routers | |
| `env.ts` (21) | `TRUST_PROXY` | env → docs-keeper |
| `lib/activity.ts` (from activity spec) | `ActivityEntityType` += `"member"`, `"share_link"` | depends on activity port |
| `backend/CLAUDE.md` | visibility convention (four arms, SA = see-not-own), public-surface rule, request-logging rule | convention change (allowed) |

### 6.3 Frontend — new files (CUST sizes)
`components/ProjectMembers.tsx` 307 (incl. c6f39b2 avatar spacing) · `components/AssigneeMembershipNotice.tsx` 28 · `components/ProjectShare.tsx` 411 · `pages/PublicShare.tsx` 295 · `lib/projectMembers.ts` 63 (+ SA exclusion: `assigneeAddsMember(..., saId)`, `memberCandidates(users, tamId, members, saId)`) · `lib/shareLinks.ts` 135 · `lib/ownerAccess.ts` 62 (`canOwnProject` stays view-all | TAM | customer owner — **no SA arm**, matching backend) · `lib/useAssigneeMembership.ts` 20 (pass `project.sa?.id`) · tests `lib/ownerAccess.test.ts` 74, `lib/projectMembers.test.ts` 84, `lib/shareLinks.test.ts` 143.

### 6.4 Frontend — edits (CUST hunk size members / share)
| File (INT lines) | CUST delta | Notes |
|---|---|---|
| `lib/queries.ts` (3053) | +93/-2 / +111/-1 | `ProjectMember` type, `useProjectMembers`, `useAddProjectMember`, `useRemoveProjectMember`, members invalidation after task saves with `assignedToId`; `ProjectDetail.customer.tamId`, `tam.avatarUrl`; `UserSummary.active/avatarUrl`; `ShareLink`, `useShareLinks`, `useCreateShareLink`, `useRevokeShareLink`, `usePublicShare`, `PublicShare` type; query keys. SPINE. |
| `pages/ProjectDetail.tsx` (258) | +22/-6 / +4 | `ProjectMembersButton project canManage={canEdit}`, `{canEdit && isOwner && <ProjectShareButton/>}`, `canOwnProject`, `canChangeOwnership={isOwner}`, Delete only for owners, blocked-link text. INTERNAL header still shows "SA x → TAM y" (`:143-145`) — keep SA display. fe-pages.md recommends rebuilding the header from CUST rather than hunk-applying (TAKE-CUST+2). |
| `components/TaskPanel.tsx` (914) | +14/-1 | assignee options "(not on project)" + notice |
| `components/TaskFormModal.tsx` (547) | +10/-1 | `AssigneeMembershipNotice` under picker |
| `pages/views/ProjectList.tsx` (1173) | +59/-28 | `projectId` into inline picker, `AssigneeOptions` with notice |
| `components/ProjectFormModal.tsx` (343) | +33/-7 | `canChangeOwnership` prop; disable customer (and TAM) selects; omit `tamId/customerId` when false; **INTERNAL: also gate the SA select (`:71,85,127,139,228`) if D2 = owner-only, else keep it editable**; `saveErrorMessage` |
| `components/CustomerFormModal.tsx` (295) | +18/-5 | `canChangeOwner` |
| `pages/Customers.tsx` (250) | +39/-14 | `canOwnCustomer` via `projectTamIdsByCustomer` (useProjects) — INTERNAL list is still cards (sibling report covers the table rewrite) |
| `pages/CustomerDetail.tsx` (970) | +15/-2 | `canOwnCustomer`, blocked-link text (INTERNAL page is pre-rewrite — see fe-pages.md) |
| `components/customer/AccountHeader.tsx` | +5 | only if the customer-account rewrite is ported |
| `components/AssigneeAvatar.tsx` (42) | +24/-1 | `avatarUrl` img with initials fallback |
| `App.tsx` (99) | +3 | `/share/:token` outside AuthGuard |
| `vite.config.ts` (97) | 1 line | denylist |
| `nginx.conf` (46) | +27 | SPINE |

### 6.5 SA-related INTERNAL code to preserve
`backend/src/lib/visibility.ts:26` SA arm (moves into "see" level) · `routes/projects.ts:48,60,157,308-310` saId create/patch · `routes/opportunities.ts:1143` handoff saId · `routes/dailyReview.ts:226-236` SA prune comment/logic · `frontend/src/components/ProjectFormModal.tsx:71,85,127,139,228` SA select · `pages/ProjectDetail.tsx:143-145` SA in header · `components/layout/RightSidebar.tsx:136-139` SA in project context panel · `pages/Projects.tsx:157-192` SA avatar on project cards · `pages/Admin.tsx:456` built-in role list incl. SA, `:1599-1606` SA column in the reassign/projects grid · `pages/CustomerDetail.tsx:422-426` SA column · `lib/auth.tsx:16` `BUILTIN_ROLES` · `lib/handoffDefaults.ts:57-61` SA prefill · `components/DealCard.tsx:207-371` handoff SA select · `lib/queries.ts:110,120,127,699,744,2025-2030` SA types. None conflict with members/share; the CUST versions of ProjectDetail/Customers/CustomerDetail drop SA display — re-add when taking CUST files (fe-pages.md §ProjectDetail).

**Frontend prerequisites from other specs (verified missing in INTERNAL)**: `@/lib/formatDate` (`fmtAgo`, `fmtDateTime`, `fmtDay`, `fmtDayFull`, `fmtRange`) and `@/lib/labels` (`SHARE_LINK_STATUS_LABEL`, `PHASE_STATUS_LABEL`, `MILESTONE_UPCOMING_LABEL`, `TASK_STATUS_LABEL`) — both from CUST's UI pass (UIPASS). `ProjectShare.tsx`/`PublicShare.tsx` import them. Either land the UIPASS libs first, or port only the needed exports (the share label additions came in eadc065: `labels.ts` +19, `labels.test.ts` +16; `activityText.ts` +8 belongs with the activity spec). Present in INTERNAL already: `AssigneeAvatar`, `BrandMark`, `Modal`, `reui/alert`, `StatusChip` (`Chip`, `ProjectStatusChip`), `lib/api` (`auth:false`), `lib/clipboard`, `lib/dateField` (`dateToDay`).

## 7. Tests

### 7.1 CUST tests to port
| File | Lines | Cases | Fixtures / notes |
|---|---|---|---|
| `backend/test/projectMembers.test.ts` | 410 | 25 | `createUserWithRole("TAM"/"STAKEHOLDER"/"ADMIN")`, `seedRoles` (INTERNAL `test/testAuth.ts` has the same API — verified), `prisma.projectMember.create` |
| `backend/test/projectOwnership.test.ts` | 197 | 12 | fixture owner/member/outsider (:22-35) |
| `backend/test/taskAssigneeMembers.test.ts` | 229 | 12 | assignment auto-add, re-save does not re-add, duplicate does not add, inactive no-op |
| `backend/test/dailyReview.test.ts` (+52 in af9a362) | — | +member cases | INTERNAL's own `test/dailyReview.test.ts` exists — add the member cases there (CUST's file tests `dailyReviewScope`; adapt) |
| `backend/test/navBadges.test.ts` (+13) | — | — | only if badges ported |
| `backend/test/shareLinks.test.ts` | 622 | 23 | owner/member/outsider/STAKEHOLDER; rate-limit reset via `publicShareRateLimiter.reset()`; "nothing leaks" builds notes/comments/risks/people |
| `backend/test/rateLimit.test.ts` | 92 | 7 | pure |
| `backend/test/requestLogger.test.ts` | 92 | 4 | uses `createApp({ logger })` |
| `backend/test/trustProxy.test.ts` | 44 | 4 | pure |
| `frontend/src/lib/ownerAccess.test.ts` | 74 | 13 | pure vitest |
| `frontend/src/lib/projectMembers.test.ts` | 84 | 11 | pure |
| `frontend/src/lib/shareLinks.test.ts` | 143 | 17 | pure |
| `e2e/tests/project-members.spec.ts` | 312 | 5 tests (`:99,155,196,215,264`) | `fixtures/test` (`apiBase`, `loginViaUi`) + `fixtures/seed` (`login`) — INTERNAL fixtures export the same names (verified) |
| `e2e/tests/guest-links.spec.ts` | 355 | 3 tests (`:184,322,348`) | `createSection`, `createTask`, `isoDateOffset`, `login` — present in INTERNAL `e2e/fixtures/seed.ts` (verified) |
| `e2e/tests/customer-visibility.spec.ts` | 156 | 1 | **not changed** by members/share commits (only a comment differs from INTERNAL, from the UI pass); no port needed. |
Totals: backend ≈ 1,780 lines / 87 cases (+ dailyReview additions); frontend unit 301 lines / 41 cases; e2e 667 lines / 8 tests.

### 7.2 New INTERNAL tests (SA arm)
Add `backend/test/projectOwnershipSa.test.ts` (or extend `projectOwnership.test.ts`), with a test-only role `SA_WRITE` = SA perms + `project:write`, `task:write` (create via `prisma.role.upsert` in `beforeAll`; `createUserWithRole` takes any role name):
1. SA (stock) attached via `saId` → `GET /projects`, `/projects/:id`, `/projects/:id/tasks`, `/projects/:id/members` = 200; customer behind it visible (`GET /customers/:id` 200).
2. SA (stock) → `GET /projects/:id/share-links` = **403 `owner_only`** (has project:read); `POST` = 403 `forbidden` (no project:write).
3. SA_WRITE via saId → `PATCH /projects/:id {tamId: other}` / `{customerId: other}` = 403 `owner_only` and row unchanged; `PATCH {name}` = 200; re-sending current tamId/customerId = 200.
4. SA_WRITE → `DELETE /projects/:id` = 403 `owner_only`; `POST/DELETE share-links` = 403 `owner_only`.
5. SA_WRITE → `PATCH /customers/:id {tamId: self}` on a customer owned by another TAM reached only via the SA project = 403 `owner_only`; `DELETE /customers/:id` = 403 `owner_only`; `PATCH {name}` = 200.
6. SA_WRITE → `PATCH {saId: other}` = per D2 (200 or 403 `owner_only`).
7. SA_WRITE → `POST /projects/:id/members` = per D3 (201 under CUST rule).
8. Assigning the project's SA a task does not create a member row (D1), and the API/notice treat SA like TAM.
9. Customer owner (not TAM) and view-all still pass all owner gates; SA who is ALSO the customer owner passes.
10. Unit: `projectVisibilityFilter(user,"own")` has no `saId`/`members` arm; `"see"` has all four; (when notifications land) `canUserSeeProject` agrees with the filter for the saId arm (extend CUST `notifications.test.ts` parity test).
11. Daily Review: member project appears in "mine"; an SA-only project still does not (existing INTERNAL dailyReview SA test stays green).
12. Handoff (`opportunityHandoff.test.ts`): ADMIN hands off with `saId = SA user` → SA sees project, SA_WRITE-equivalent gets `owner_only` on delete.
E2E (optional, 1 test in `project-members.spec.ts`): SA user (via API-created SA role user) opens the project — sees members avatars, no Share, no Delete, Members dialog read-only (no project:write).
Existing INTERNAL tests to re-check: `projectDelete.test.ts` (who deletes — must be owner), `customerVisibility.test.ts:216` "PATCH and DELETE", `:287` "reassigning tamId … 200" (actor must be owner — verify fixture), `projectVisibility.test.ts`, `projectSaOptional.test.ts`, `projectCustomerLink.test.ts` (customer change by a non-owner?), `opportunityHandoff.test.ts`.

## 8. Spine hits, task breakdown, estimates

**Spine hits** (instant opus review each): `lib/visibility.ts`; `schema.prisma` + 2 migrations; `routes/projects.ts`; `routes/tasks.ts` (task-ordering file); `lib/queries.ts`; `frontend/nginx.conf`; `setup.sh`; docker/env (`env.ts` TRUST_PROXY). Not spine but security-sensitive: `routes/publicShare.ts`, `lib/shareLinks.ts`, `http/requestLogger.ts`. `routes/admin.ts`/`http/auth.ts` untouched.

**Ordering principle**: activity log (other spec) **before** members and share links so `recordActivity` calls land in final form (CUST order was members → activity → share; activity commit 476288e back-patched members/tasks). If activity slips, port members from `af9a362` (no activity calls) and let the activity task add them. Rate-limit/logging infra is independent and can go in wave 1.

Phase A — Project members (branch/PR 1):
| # | Task | Depends | Size | CUST source | Acceptance |
|---|---|---|---|---|---|
| A1 | Visibility core: `ProjectAccess "see"/"own"`, four "see" arms, `ensureProjectOwnerAccess`, `ensureCustomerOwnerAccess`, (`canUserSeeProject` with saId if notifications ported); `ProjectMember` model + migration; backend/CLAUDE.md visibility line | — (activity spec merged, ideally) | M | af9a362 `visibility.ts`, schema, migration | tsc green; unit tests for both levels; all existing visibility tests green |
| A2 | Owner gates: projects PATCH (tamId/customerId[/saId per D2] diff) + DELETE; customers PATCH tamId diff + DELETE; `owner_only` shape | A1 | S | af9a362 projects.ts/customers.ts hunks | `projectOwnership.test.ts` (12) + SA cases §7.2 1-6, 9 pass; INTERNAL projectDelete/customerVisibility tests adjusted only where actor was non-owner |
| A3 | Members API + `ensureAssigneeIsMember` in POST /projects/:id/tasks and PATCH /tasks/:id (+activity), duplicate comment, `GET /users` active/avatarUrl, detail include `customer.tamId`/`tam.avatarUrl` | A1 | M | af9a362 + 476288e hunks | `projectMembers.test.ts` (25), `taskAssigneeMembers.test.ts` (12), SA cases 7-8 |
| A4 | Daily Review "mine" = TAM or member | A1 | S | af9a362 dailyReviewScope hunk | new member cases; SA prune unchanged |
| A5 | Frontend members: `lib/ownerAccess`, `lib/projectMembers` (+SA exclusion), `useAssigneeMembership`, `AssigneeMembershipNotice`, `ProjectMembers` (+c6f39b2), `AssigneeAvatar`, queries hooks + invalidation; edits ProjectDetail, TaskPanel, TaskFormModal, ProjectList, ProjectFormModal (+SA select per D2), CustomerFormModal, Customers, CustomerDetail; blocked-link copy | A2, A3 (+ UIPASS libs if taking CUST files whole) | L | af9a362, c6f39b2 | vitest 24 cases; e2e `project-members.spec.ts` 5 tests (+1 SA); typecheck; DESIGN.md review |
Waves: [A1] → [A2 ‖ A4] then A3 (A2 and A3 both edit `routes/projects.ts` → serialize or worktree) → [A5]. ~3 waves.

Phase B — Guest links (branch/PR 2):
| # | Task | Depends | Size | CUST source | Acceptance |
|---|---|---|---|---|---|
| B1 | Infra: `http/rateLimit.ts`, `http/trustProxy.ts`, `http/requestLogger.ts`, `env.ts` TRUST_PROXY, `app.ts` trust proxy + `createApp({logger})` + request logger, `setup.sh` TRUST_PROXY (validate + persist + compose env), CONFIGURATION.md | — (can run in Phase A wave 1) | M | eadc065 | `rateLimit`(7)/`requestLogger`(4)/`trustProxy`(4) tests; Authorization header no longer logged; `bash -n setup.sh` |
| B2 | `ShareLink` model + migration; `lib/shareLinks.ts` (+local `dayString` if needed), `routes/shareLinks.ts`, `routes/publicShare.ts`; mounts (`/public/share` before json; shareLinks on /projects); activity types `share_link`; nginx `^~` blocks; vite denylist | A1 (owner gate), B1 | M | eadc065 | `shareLinks.test.ts` (23) + SA cases 2,4; curl 404 parity unknown/expired/revoked; headers present on 404/429 |
| B3 | Frontend share: `lib/shareLinks.ts`, labels additions, `ProjectShare.tsx` (owners only: `canEdit && canOwnProject`), `PublicShare.tsx`, `/share/:token` route, queries hooks | B2, A5 (header slot), UIPASS `formatDate`/`labels` | M-L | eadc065 | `shareLinks.test.ts` FE (17); e2e `guest-links.spec.ts` (3) incl. member-without-ownership sees no Share; light/dark + 390px check |
| B4 | Docs: CHANGELOG entries (orchestrator), backend/CLAUDE.md public-surface + logging rules, CONFIGURATION.md (TRUST_PROXY, nginx, logging, setup), ISSUES.md (5 deferred + seed-resets-role-perms finding), plan archived | B1-B3 | S | 2ecb148 | docs-keeper triggers: env, nginx.conf, setup.sh, vite.config.ts |

**Estimate**: backend src ≈ 1,000 new + ~250 edited lines; backend tests ≈ 1,800 (+~250 SA); frontend ≈ 1,320 new + ~450 edited; e2e ≈ 670. Roughly Phase A = L (3 waves, ~2-3 implementor-days), Phase B = M-L (2 waves, ~2 implementor-days). Both PRs touch spine heavily → expect 4-6 instant reviews.

## 9. Open questions for the user
- **D1** Treat the project SA like the TAM for members: skip auto-add when the SA is assigned, hide SA from the "add member" candidates and from the "adds them to the project" notice? (recommend yes)
- **D2** Is changing a project's **SA** owner-only (like TAM/customer)? Today any project writer who sees the project can. (recommend owner-only — it re-parents access)
- **D3** Who manages members: CUST = anyone who can see the project with `project:write` (TAM, customer owner, members, view-all — and in INTERNAL an SA whose role has write). Keep, or restrict to owners? (recommend keep CUST rule; stock SAs lack write anyway)
- **D4** Backfill existing task assignees who cannot see their project as members (SQL in §4.4)? (recommend no; report the count first)
- **D5** Guest payload: OK to expose the **customer name**, **section names** and **milestone titles** (incl. subtask milestones) to anyone with the link?
- **D6** Daily Review: members' projects join "mine" (CUST). Should SA projects also appear for SAs? (today they are deliberately pruned; recommend unchanged)
- **D7** `TRUST_PROXY` for the current deployment (tunnel in front?) — `1` vs `"loopback, uniquelocal"`.
- **D8** Ordering: port the activity log first so members/share land with `recordActivity`, or port members first (CUST order) and let the activity task back-patch?
- **Side finding (file in ISSUES.md)**: `prisma/seed.ts` upsert resets built-in role permissions (incl. SA/TAM edits made in Admin > Roles) on every container start (`seed.ts:33-37` + `setup.sh:150`).
- **Side finding**: INTERNAL request logs currently include request headers via default pino-http serialization, i.e. bearer JWTs (unverified at runtime) — fixed by B1's requestLogger.
