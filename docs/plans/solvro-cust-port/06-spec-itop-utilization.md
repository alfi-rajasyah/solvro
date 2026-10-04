# iTop + Utilization port spec (CUST -> INTERNAL)

Research date 2026-10-02. Read-only. CUST = /home/solvro-internal/solvro-cust (HEAD 127f316), INTERNAL = /home/solvro-internal/solvro (develop 154b42f).
Legend: [V] verified in code; [U] unverified / inferred.

## 0. Sources read
- CUST docs/archive/plans/itop-integration-spec.md (743 lines, the proposal), docs/archive/plans/itop-integration.md (200 lines, the shipped plan + decisions), docs/reference/itop-integration-guide.md (414 lines).
- CUST backend/src/{app.ts,index.ts,env.ts,lib/secretBox.ts,http/*,routes/webhook.ts,...}
- Key fact [V]: CUST *removed* the Pipeline module before iTop P1 ("code starts after PR feat/remove-pipeline-module merges", plan header). So no CUST iTop code ever had to reason about SA/SALES roles, opportunities, Project.saId. INTERNAL must add that reasoning (see §7).

## Early findings (written first so they survive interruption)
- [V] CUST app.ts mounts `/webhook` BEFORE `express.json()` and before `/public/share`; webhook ignores its body.
- [V] secretBox.ts (61 lines): AES-256-GCM, 12-byte random IV, format `v1:<iv b64>:<tag b64>:<ct b64>`; key = base64 SECRETS_KEY that must decode to exactly 32 bytes (env.ts regex `^[A-Za-z0-9+/]{43}=$`). No AAD, no key id, no rotation support (single key; only `v1` prefix is a hook for future versions). Auth-tag length not checked (Node accepts truncated GCM tags 4..16 bytes unless `authTagLength` is passed) — low severity (needs DB write access).
- [V] SECURITY FINDING: CUST http/requestLogger.ts redacts only `authorization` and `/share/<token>` paths/referers. The webhook secret travels in header `X-Solvro-Webhook-Secret`, and pino's std req serializer logs all headers => the webhook secret is written to the request log on every iTop call. Fix when porting: add `x-solvro-webhook-secret` to the redaction in redactSerializedRequest.
- [V] Webhook rate limit is two GLOBAL (not per-IP) in-memory sliding windows in routes/webhook.ts: 60 calls/min total (checked before DB read+decrypt), 6 accepted/min. It does NOT use http/rateLimit.ts. Consequence: an unauthenticated flood of 60/min starves legit iTop nudges (degrades to the 5-min schedule only; no data impact). Accept or key the 60/min window per IP via rateLimit.ts.
- [V] Webhook compare: `crypto.timingSafeEqual` after an explicit length check (length leak only). 404 when no secret configured or stored secret undecryptable; 401 on mismatch; 202 on accept and `requestSync({full:false})`.
- [V] SECURITY FINDING (medium): CUST routes/itopAdmin.ts:416-440 `POST /admin/itop/test` takes an optional `baseUrl` and optional `appToken`; when only `baseUrl` is sent it falls back to the STORED app token (`body.appToken ?? open(config.appTokenEnc)`). An admin session (or a stolen 8h admin JWT) can point the probe at any https host it controls and receive the iTop application token in the `Auth-Token` header => token exfiltration. Port fix: when `body.baseUrl` differs from the stored baseUrl, require `body.appToken` (never send the stored token to a new host).
- [V] SSRF surface: baseUrl must match `/^https:\/\/\S+$/i` (itopAdmin.ts:186, schema :192-202 and :405-412). Admin-only. No host allow/deny list, no private-IP block; Node global `fetch` follows redirects by default (client.ts:159-167 passes no `redirect` option) so an https URL can 30x to http://internal. Response bodies are not echoed (non-JSON -> "parse" error; HTTP errors -> "iTop responded with HTTP <n>"); probe results echo iTop `message` strings to the admin only. Risk accepted as admin-trust in CUST; recommend `redirect: "error"` (or "manual") in client.ts when porting — cheap.
- [V] OQL injection: all string interpolations go through `escapeOqlString` (lib/itop/sync.ts:191); numeric interpolations (callerId, personId, itopOrgId, user ids) are zod-int or DB ints. OK.
- [V] `ITOP_SYNC_DISABLED` only stops the periodic timer (scheduler.ts startItopScheduler). `requestSync()` (Refresh, webhook, admin Sync now) still runs a sync, by design ("Safe to call even when the scheduler itself hasn't been started").
- [V] `POST /itop/refresh` is open to EVERY authed user (no permission), triggers a FULL pull, with a single process-wide 10 s cooldown (itop.ts:363-410). In INTERNAL that includes STAKEHOLDER/SALES/SA. Low risk (bounded) but consider gating to non-STAKEHOLDER.
- [V] `GET /itop/status` deliberately withholds lastSyncError (itop.ts:184-198); admin GET /admin/itop/settings exposes it. Tokens never serialized: settings returns `appTokenSet`/`webhookSecretSet` booleans only (itopAdmin.ts:158-176); webhook secret plaintext returned ONCE by `POST /admin/itop/webhook-secret` (:373-385).
- [V] `getItopAppClient()` (lib/itop/config.ts) calls `open()` without catching SecretBoxError -> after a SECRETS_KEY change every read route needing the app client 500s until the admin re-pastes the token (scheduler logs a warn per tick). Write paths map it to 403 `itop_token_unreadable`.
- [V] SECURITY FINDING (medium): personal-token ownership is best-effort, weaker than plan decision 11 ("accepted only when it resolves to the iTop person with the same email"). CUST routes/itopUser.ts:117-235: step 1 `SELECT Person WHERE email = '<my email>'` with the pasted token only proves the token can READ that Person (any broad-read token passes). Step 2 (User by contactid) and step 3 (`SELECT PersonalToken WHERE user_id = …`, zero rows => reject `itop_token_not_yours`) are the real ownership proof, but BOTH are wrapped so that any read failure (no rights on User/PersonalToken class) is "inconclusive -> accept" (:177-221). So the iTop *application token* or another person's token with no rights on PersonalToken is accepted as "mine", and all later writes run under that identity. Port fix: treat an unreadable PersonalToken/User as rejection (fail closed), or at least require resolvedItopUserId !== null.
- [V] Per-user PUT /itop/me/token rate limit: 10 per 10 min in-process (itopUser.ts:94-115). Token min length 16.
- [V] SECURITY FINDING (high for INTERNAL, n/a in CUST): every iTop READ route is `requireAuth` + customer visibility only — no `requirePermission`. CUST had only ADMIN/TAM/STAKEHOLDER/PENDING roles. INTERNAL's `customerVisibilityFilter` (backend/src/lib/visibility.ts) includes the arm `{ tamId: null }` (unowned customers visible to everyone), so in INTERNAL a **PENDING** user (permissions `[]`) and a **SALES** user (`["pipeline:view"]`) would read ticket lists, the Daily strip and full ticket detail INCLUDING `privateLog` for every unowned mapped customer; STAKEHOLDER (`project:view-all`) reads every customer's tickets and private logs. (Same latent issue exists in CUST for PENDING.) INTERNAL's own customer-note reads require `project:read` (routes/customers.ts:402,545) — the iTop routes must at minimum match that: add `requirePermission("project:read")` to itopRouter read routes. Decide separately whether `privateLog` needs more than project:read (e.g. hide it from STAKEHOLDER / non-`task:write`).
- [V] Confirmation that the webhook-header leak violates CUST's own rule: CUST backend/CLAUDE.md:15 "new secret-bearing paths must be added to its [requestLogger] redaction". INTERNAL has no requestLogger.ts at all (app.ts uses bare `pinoHttp({ logger })`, logs Authorization headers today) — port CUST http/requestLogger.ts (guest-links spec brings it) and extend it with `x-solvro-webhook-secret`.

---

## 1. Behaviour spec per sub-feature (as shipped in CUST HEAD; [INT] = INTERNAL delta)

Global contract (plan §1/§2, all [V] in code): iTop owns tickets and hours; Solvro keeps a snapshot (`itop_tickets`, `itop_time_entries`) and never stores a status iTop has not confirmed. Pages read only the snapshot; only admin probes, the "New ticket" picklists and writes call iTop live. App token = reads only; every write = acting user's personal token.

### 1.1 Admin connection + mapping (routes/itopAdmin.ts, 637 lines; mount `/admin/itop`, `requireAuth, requireAdmin` router-level :37)
- `GET /admin/itop/settings` -> `{baseUrl, appTokenSet, webhookSecretSet, timezone, refreshMinutes, readClasses, capacityHoursPerWeek, actionsEnabled, lastSyncAt, lastSyncOk, lastSyncError, lastFullSyncAt, updatedAt, updatedBy}` (:158-181). Tokens never returned.
- `PATCH /admin/itop/settings` (:300-370): baseUrl https-only (trailing slashes stripped, null clears), appToken >= 8 chars (sealed; null clears), timezone (IANA, `invalid_timezone` 400), refreshMinutes 1..60, readClasses subset of [UserRequest, Incident], capacityHoursPerWeek 1..80, actionsEnabled. Timezone change runs `backfillTimezoneConversion` in a 60 s transaction and clears lastFullSyncAt so the next tick is full. Busts config + services caches.
- `POST /admin/itop/webhook-secret` -> generates 32 random bytes base64url, seals, returns `{secret, path:"/api/webhook/itop", header:"X-Solvro-Webhook-Secret"}` once; `DELETE /admin/itop/webhook-secret` -> 204.
- `POST /admin/itop/test` (:416-440) probes `list_operations` + `core/get limit 1` on Organization, UserRequest, Incident, Person, TimeSpent; returns `{ok, probes:[{name,ok,message}]}`. (See security finding: stored-token fallback.)
- `POST /admin/itop/sync` `{full?}` fire-and-forget (202 `{started}`), single in-flight guard (:445-505).
- `GET /admin/itop/organizations` live from iTop `{id,name,mappedCustomerId}`; `GET /admin/itop/customers` (customers + mapping); `PATCH /admin/itop/customers/:id` `{itopOrgId|null}` (P2002 unique -> conflict); `POST /admin/itop/customers/automatch` = exact, case-insensitive name match, unmapped customers only (:582-628).
- `GET /admin/itop/persons` (users with/without itopPersonId); `POST /admin/itop/persons/match` runs `syncUsers()` (email equality Person.email = User.email; then `SELECT User WHERE contactid IN (…)` for itopUserId) (:630-637, lib/itop/sync.ts:220-303). No manual user mapping by design.
- [INT] Admin page must keep INTERNAL's Pipeline (import-history) tab AND add iTop (fe-pages.md §2.17 already says six tabs).

### 1.2 Scheduled sync (lib/itop/scheduler.ts 96 lines, lib/itop/sync.ts 931 lines)
- Started from index.ts after `listen` (`startItopScheduler()`), stopped on SIGTERM/SIGINT. No-op when `NODE_ENV=test` or `ITOP_SYNC_DISABLED` truthy. First tick after 15 s, then every `ItopConfig.refreshMinutes` (re-read each tick, min 1, default 5). Unconfigured (no baseUrl or no app token) => tick skips silently.
- `syncTickets({full})` runs inside one Prisma transaction (timeout 10 min) holding `pg_try_advisory_xact_lock(hashtext('itop_sync'))` (sync.ts:751-790); a concurrent run returns skipped. Scope = customers with itopOrgId; classes = readClasses; chunks of 50 org ids; incremental by `last_update > lastSyncAt − 60 s`; FULL when forced (Refresh/admin), when lastFullSyncAt null, or > 24 h old — full drops snapshot rows iTop no longer returns. Users re-matched at most hourly (USER_SYNC_MIN_INTERVAL_MS) or on full. Time entries (TimeSpent for matched itopUserIds, last 8 weeks, `TIME_ENTRY_WINDOW_MS`) synced after tickets in the same locked run, with a 14 h grace window on deletion. Case logs normalised to last 50 entries, HTML -> plain text (sync.ts:305-395). Writes lastSyncAt/Ok/Error, lastFullSyncAt.
- `requestSync({full})` 10 s trailing debounce, used by Refresh, admin sync, webhook — runs even if the scheduler is disabled.

### 1.3 Customer Tickets tab (routes/itop.ts GET `/itop/customers/:id/tickets`; frontend components/itop/TicketsTab.tsx 198, TicketsTable.tsx 205, TicketFilters.tsx 97, SyncedAgo.tsx 56, board/*)
- Query `scope=ongoing|resolved_week|mine` (default ongoing), `class=UserRequest|Incident`. 404 `customer_not_found` if not visible. Unmapped => `{mapped:false, tickets:[], counts:0…, syncedAt:null}`. Mapped => up to 500 rows ordered `slaTtrPassed desc, lastUpdate desc`, counts `{ongoing, resolvedWeek, mine, incidents, requests}`, `orgName`, `syncedAt`. "Resolved" = status in [resolved, closed]; resolved_week = resolutionDate >= Monday 00:00 UTC of current ISO week; mine = agentPersonId = caller's itopPersonId. Rows never include logs.
- Frontend: tab shown only when `/itop/status.configured` AND customer mapped (`useItopCustomerMapped`, CustomerDetail.tsx:43-62); `?tab=tickets`, `?view=board`, `?ticket=<id>` deep links; Table on desktop, card list under md; "Open in iTop" = `${baseUrl}/pages/UI.php?operation=details&class=<class>&id=<id>`; polling `refetchInterval 60 s` only while visible (queries.ts:3178-3188).
- Board (P6): `TicketBoard.tsx` (356) on vendored `@/components/reui/kanban` (imports Kanban, KanbanBoard, KanbanColumn, KanbanColumnContent, KanbanItem, KanbanOverlay — TicketBoard.tsx:25-33). Columns new/assigned/pending/resolved/closed (boardAdapter.ts 106; escalated & approval states fold into Assigned). dropMapper.ts (71): new->assigned ev_assign, pending->assigned ev_assign, assigned->pending ev_pending (sheet: pending_reason), assigned|pending->resolved ev_resolve (sheet), resolved->closed ev_close, resolved->assigned ev_reopen; forbidden drops dimmed + inline message client-side. No optimistic move. [V] `git log -- frontend/src/components/reui` in CUST shows only the initial import 10c0b16 => reui/ NOT modified by iTop.
- Board requires actionsEnabled + own token for drops (read-only otherwise) [U: exact UI copy].

### 1.4 Ticket panel / log (TicketPanel.tsx 324, TicketLog.tsx 171, ActionSheet.tsx 202, ticketActions.ts 89, ticketPresentation.ts 149)
- `GET /itop/tickets/:id?utcOffsetMinutes=` -> row + `publicLog`, `privateLog` + `myMinutesThisWeek` (viewer-local ISO week). 404 if ticket unknown, unmapped (customerId null) or customer hidden.
- Buttons Pending / Resolve / Assign to me / Close / Reopen (as the lifecycle allows), log composer Public|Private, Timer, "Open in iTop", footer "writes as <email>"; read-only banner without token or when actionsEnabled false.

### 1.5 Daily Review iTop strip (GET `/itop/daily?date=YYYY-MM-DD&utcOffsetMinutes=`; DailyItopStrip.tsx 233, dailyStripPresentation.ts 30; edits OperationsCard/WeekNotesEditor/CustomerGroup/DailyReview.tsx)
- Unconfigured => `{configured:false, customers:[]}`. Else per visible AND mapped customer: `newToday` (startDate in viewer-local day), `resolvedToday`, `slaBreached`, `ongoing`, `recent` (3 by lastUpdate), `syncedAt`. "Add to note" inserts `"<ref> <title>"` into the operations note draft (WeekNotesEditor `pendingInsert`); writes nothing to iTop. P6 adds "Assign to me"/"Resolve" quick actions (same mutations/sheet). Polling 60 s only when configured (queries.ts:3659).

### 1.6 Task <-> ticket ref (Task.itopTicketRef; TaskTicketField.tsx 240)
- `PATCH /tasks/:id` accepts `itopTicketRef` matching `^[A-Z]{1,3}-\d{4,8}$` or null (CUST routes/tasks.ts:82-92, :464). Not an FK; never validated against the snapshot; never copied by duplicate (lib/duplicate.ts comment); not settable on create. Activity log diff includes it (CUST lib/activity.ts:91,115).
- `GET /itop/tickets/by-ref/:ref` resolves to snapshot row (with logs) behind the ticket's customer visibility; unknown => 404 => chip "not in snapshot".
- TaskPanel "iTop ticket" row only when `/itop/status.configured`; P7 "Create iTop ticket" from task (needs task's project customer mapped) -> NewTicketSheet prefilled -> on success PATCH task ref.
- [INT] routes/tasks.ts is a spine file -> instant review.

### 1.7 Personal tokens in Settings (routes/itopUser.ts 269; Settings.tsx `ItopTokenSection`, CUST Settings.tsx:166-299)
- Mount `/itop/me` BEFORE `/itop` (app.ts order matters). `GET /itop/me/token` -> `{set, unreadable, personName, checkedAt, expiresAt, actionsEnabled, configured}` [V itopUser.ts:57-87; `unreadable` = sealed token no longer decryptable after a SECRETS_KEY change]; `PUT /itop/me/token {token>=16}` validates (Person by email, list_operations info-only, User by contactid, PersonalToken ownership best-effort, expiry) then seals; sets itopPersonId/itopUserId if empty; P2002 -> 409 `itop_person_already_linked`; 10 PUTs / 10 min / user. `DELETE` clears token columns (keeps person/user mapping).
- Section hidden entirely when iTop not configured (Settings.tsx:184).

### 1.8 Write actions (routes/itop.ts :575-935, :1005-1170)
- Preconditions in order (`loadWritableTicket`): actionsEnabled else 404; ticket exists+mapped else 404; customer visible else 404; caller has token else 403 `itop_token_missing`; decryptable else 403 `itop_token_unreadable`; baseUrl else 409.
- `POST /itop/tickets/:id/actions` discriminated: `assign_to_me {team_id?}` (team from `lnkPersonToTeam`; >1 team => 409 with team options, client re-asks), `pending {pending_reason}`, `resolve {resolution_code, solution}` [real iTop 3.2.2 needs only solution — plan §2 #11], `close`, `reopen`. Every stimulus/update sends a `comment` naming the Solvro user's email (real install requires it). Error map: transport -> 502 `itop_unreachable`, iTop code 1 -> 403 `itop_token_invalid`, else 409 `itop_refused` with iTop's message verbatim. After success: re-read with APP client, upsert, respond; re-read failure -> pre-write row + `staleAfterWrite:true` (never 5xx => no double-fire).
- `POST /itop/tickets/:id/log {visibility: public|private, text}` -> core/update of public_log/private_log.
- `POST /itop/tickets` `{customerId, class, title<=255, description<=4000, callerId, serviceId?}`: actionsEnabled 404; customer visible else 400 `customer_not_found`; mapped; caller must be Person in the customer's org (app-token check); create under own token; re-read.
- `GET /itop/services` (5-min process cache; app token) and `GET /itop/customers/:id/contacts` (live Persons of org; app token) feed NewTicketSheet.tsx (249).

### 1.9 Time tracking / timer (POST `/itop/tickets/:id/time`; useTicketTimer.ts 381, TicketTimer.tsx 221, TopBar pill)
- Body `{startedAt, endedAt, title?}`; requires write preconditions + `itopUserId` (403 `itop_user_unmatched`); 1 min <= duration <= 24 h; end not > now+5 min; dates formatted in ItopConfig.timezone; core/create TimeSpent `{user_id, org_id, start_date, end_date, ticket_ref, title}`; re-read + upsert (202 `staleAfterWrite` on failure). `ticket_ref` field correctness on a real install flagged UNCONFIRMED in code (itop.ts:1185-1192).
- Frontend: one running timer per user in localStorage `solvro.itopTimer.<…>` (cleared on logout, lib/auth.tsx:195-197), TopBar running-timer pill (`useRunningItopTimer`).

### 1.10 Webhook nudge (routes/webhook.ts 139) — see Early findings for mechanics. Body ignored; 202 + `requestSync({full:false})`. Admin UI webhook card in ItopTab shows URL `https://<host>/api/webhook/itop` + header name; secret shown once. Public path goes through INTERNAL's existing nginx `/api/` proxy [V INTERNAL frontend/nginx.conf:7 `location /api/` proxies everything under /api/].

### 1.11 Timezone handling (lib/itop/timezone.ts 194; commit 933d3d0)
- iTop REST speaks wall-clock "YYYY-MM-DD HH:MM:SS" in the iTop SERVER's zone. `ItopConfig.timezone` (IANA, default "UTC") drives `parseItopDate`/`formatItopDate` (sync.ts:94-160) via Intl, DST-correct. Changing it re-converts stored time entries/token expiries in place and forces a full re-sync. Invalid stored zone -> fallback UTC + warn (config.ts `resolveConfiguredTimezone`).
- Viewer-local windows ("today" on the strip, "this week" on Utilization and the panel) via `utcOffsetMinutes` query param (-840..840) from the browser; Solvro-picked `date`/`week` strings stay on the UTC-midnight date contract (lib/dateBoundary.ts).

### 1.12 Utilization page (routes/utilization.ts 270; pages/Utilization.tsx 227; components/utilization/UtilizationTable.tsx 159, UtilizationTiles.tsx 73, utilizationPresentation.ts 67)
- `GET /utilization?week=YYYY-Www&scope=me|tam|customer&utcOffsetMinutes=`; `tam`/`customer` need `report:executive` (403 otherwise); `me` filters `userId = caller`.
- Unconfigured => `configured:false` zero payload. Else tiles `{hoursLogged, capacityHours (capacity × active mapped users for tam/customer; capacity for me), customersTouched, customersAssigned, unassignedHours}`, rows (customer or TAM × Mon..Sun hours + total + top-6 ticket refs; "No customer" row last), totals, `truncated` (cap 10 000 entries ordered by startDate).
- No editable cells. Route `/utilization`; `/work-logs` -> `<Navigate to="/utilization" replace />` (CUST App.tsx:72-73); nav entry `{ to: "/utilization", label: "Utilization", icon: "schedule", group: "Insights" }` (CUST navCommands.ts:29-30), no `requires`; routeMeta maps both segments to "Utilization" (CUST lib/routeMeta.ts:34-43 — INTERNAL has no routeMeta.ts yet; comes with the UI-pass port).
- [INT] decide nav gating: Utilization `me` is harmless but meaningless for SALES/PENDING (no iTop user) — recommend `requires: "project:read"` or leave ungated (CUST). By-TAM capacity counts every active mapped user incl. SA/SALES if their email exists in iTop [V by code, utilization.ts:226-233].

### 1.13 States when iTop is not configured
- `/itop/status.configured=false` => no Tickets tab, no TaskTicketField, no Settings section, no Daily strip; Utilization shows a "not connected" state (Utilization.tsx:196-215). `/itop/refresh` 409 `itop_not_configured`; `/services`, `/customers/:id/contacts` 409 via getItopAppClient; write routes 404 when actionsEnabled false. Scheduler skips. Webhook 404 when no secret.

---

## 2. Schema

### 2.1 CUST models (verbatim from CUST backend/prisma/schema.prisma HEAD, comments trimmed)
```prisma
model ItopConfig {                       // schema.prisma:154-180
  id                   String    @id @default("default")
  baseUrl              String?   @map("base_url")
  appTokenEnc          String?   @map("app_token_enc")
  webhookSecretEnc     String?   @map("webhook_secret_enc")
  timezone             String    @default("UTC") @map("timezone")
  refreshMinutes       Int       @default(5) @map("refresh_minutes")
  readClasses          String[]  @default(["UserRequest", "Incident"]) @map("read_classes")
  capacityHoursPerWeek Int       @default(40) @map("capacity_hours_per_week")
  actionsEnabled       Boolean   @default(false) @map("actions_enabled")
  lastSyncAt           DateTime? @map("last_sync_at")
  lastSyncOk           Boolean?  @map("last_sync_ok")
  lastSyncError        String?   @map("last_sync_error")
  lastFullSyncAt       DateTime? @map("last_full_sync_at")
  updatedAt            DateTime  @updatedAt @map("updated_at")
  updatedById          Int?      @map("updated_by_id")
  updatedBy            User?     @relation("ItopConfigUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
  @@map("itop_config")
}

model ItopTicket {                       // schema.prisma:681-726
  id                Int       @id               // iTop object key, never generated
  class             String
  ref               String    @unique
  title             String
  status            String
  operationalStatus String?   @map("operational_status")
  priority          String?
  agentPersonId     Int?      @map("agent_person_id")
  agentName         String?   @map("agent_name")
  teamName          String?   @map("team_name")
  serviceName       String?   @map("service_name")
  callerName        String?   @map("caller_name")
  orgId             Int       @map("org_id")
  customerId        Int?      @map("customer_id")
  customer          Customer? @relation(fields: [customerId], references: [id], onDelete: SetNull)
  startDate         DateTime? @map("start_date")
  lastUpdate        DateTime  @map("last_update")
  tto               DateTime?                   // escalation DEADLINE, from tto_escalation_deadline
  ttr               DateTime?                   // escalation DEADLINE, from ttr_escalation_deadline
  slaTtoPassed      Boolean   @default(false) @map("sla_tto_passed")
  slaTtrPassed      Boolean   @default(false) @map("sla_ttr_passed")
  resolutionDate    DateTime? @map("resolution_date")
  publicLog         Json?     @map("public_log")   // [{date,author,message}] last 50
  privateLog        Json?     @map("private_log")
  syncedAt          DateTime  @map("synced_at")
  itopTimeEntries   ItopTimeEntry[]
  @@index([customerId, status])
  @@index([lastUpdate])
  @@index([agentPersonId])
  @@index([orgId])
  @@map("itop_tickets")
}

model ItopTimeEntry {                    // schema.prisma:734-757
  id              Int         @id
  itopUserId      Int         @map("itop_user_id")
  userId          Int?        @map("user_id")
  user            User?       @relation(fields: [userId], references: [id], onDelete: SetNull)
  orgId           Int?        @map("org_id")
  customerId      Int?        @map("customer_id")
  customer        Customer?   @relation(fields: [customerId], references: [id], onDelete: SetNull)
  ticketId        Int?        @map("ticket_id")
  ticket          ItopTicket? @relation(fields: [ticketId], references: [id], onDelete: SetNull)
  ticketRef       String?     @map("ticket_ref")
  startDate       DateTime    @map("start_date")
  endDate         DateTime?   @map("end_date")
  durationMinutes Int         @map("duration_minutes")
  title           String?
  syncedAt        DateTime    @map("synced_at")
  @@index([userId, startDate])
  @@index([customerId, startDate])
  @@index([itopUserId])
  @@index([ticketId])
  @@index([startDate])
  @@map("itop_time_entries")
}
```
Fields on existing models:
- `User` (schema.prisma:110-122): `itopConfigUpdates ItopConfig[] @relation("ItopConfigUpdatedBy")`, `itopPersonId Int? @unique @map("itop_person_id")`, `itopUserId Int? @unique @map("itop_user_id")`, `itopTimeEntries ItopTimeEntry[]`, `itopTokenEnc String? @map("itop_token_enc")`, `itopTokenCheckedAt DateTime? @map("itop_token_checked_at")`, `itopTokenPersonName String? @map("itop_token_person_name")`, `itopTokenExpiresAt DateTime? @map("itop_token_expires_at")`.
- `Customer` (:303-308): `itopOrgId Int? @unique @map("itop_org_id")`, `itopOrgName String? @map("itop_org_name")`, `itopTickets ItopTicket[]`, `itopTimeEntries ItopTimeEntry[]`.
- `Task` (:396-426): `itopTicketRef String? @map("itop_ticket_ref")` + `@@index([itopTicketRef])`.

### 2.2 The 6 CUST migrations, in order (SQL summarised, [V])
1. `20260922075353_itop_snapshot` (commit 03ea2e4): customers + `itop_org_id INT`, `itop_org_name TEXT`; users + `itop_person_id INT`, `itop_user_id INT`; CREATE `itop_config` (no timezone yet); CREATE `itop_tickets` (no log columns); unique `itop_tickets_ref_key`; indexes customer_id, status, last_update, agent_person_id, org_id; unique `customers_itop_org_id_key`, `users_itop_person_id_key`, `users_itop_user_id_key`; FKs itop_config.updated_by_id -> users SET NULL, itop_tickets.customer_id -> customers SET NULL.
2. `20260922182346_itop_time_entries` (5b3d0a5): DROP INDEX itop_tickets_status_idx; CREATE `itop_time_entries`; indexes (user_id,start_date), (customer_id,start_date), itop_user_id; CREATE INDEX itop_tickets (customer_id,status); FKs user/customer/ticket SET NULL.
3. `20260922185807_itop_time_entry_indexes` (5b3d0a5): DROP INDEX itop_tickets_customer_id_idx; CREATE INDEX itop_time_entries ticket_id, start_date.
4. `20260923024304_task_itop_ticket_ref` (418d88b): tasks + `itop_ticket_ref TEXT`; INDEX tasks_itop_ticket_ref_idx.
5. `20260923035039_itop_write_path` (8ce20af): itop_tickets + `private_log JSONB`, `public_log JSONB`; users + `itop_token_checked_at TIMESTAMP(3)`, `itop_token_enc TEXT`, `itop_token_expires_at TIMESTAMP(3)`, `itop_token_person_name TEXT`.
6. `20260924063858_itop_timezone` (933d3d0): itop_config + `timezone TEXT NOT NULL DEFAULT 'UTC'`.
All six are pure additive DDL; no data backfill; no enum changes.

### 2.3 INTERNAL fresh migration(s)
INTERNAL's last migration is `20260925140000_opportunity_flow_redesign`; INTERNAL has none of the CUST epics/members/activity/notifications/share-link migrations yet (those come from sibling specs). Do NOT copy CUST migration folders by name/timestamp (they'd sort before 20260925 and `migrate deploy` would apply them out of order on a fresh DB but they were never in INTERNAL's history — technically OK since additive, but backend/CLAUDE.md:14 says generate with `prisma migrate dev`). Recommended: edit schema.prisma to the CUST end-state for iTop and generate fresh migrations per port phase:
- Phase A (P1 port): `itop_snapshot` = migration 1 + `timezone` column folded in + final index set (customer_id,status / last_update / agent_person_id / org_id; no standalone status or customer_id index).
- Phase C (P3 port): `itop_time_entries` = migrations 2+3 final state.
- Phase D (P4 port): `task_itop_ticket_ref` = migration 4.
- Phase E (P5 port): `itop_write_path` = migration 5.
Alternatively ONE migration `itop_integration` with the whole end-state if the port is a single PR (simpler; all additive, nullable or defaulted => safe on the existing prod DB with no backfill). Order relative to members/activity migrations does not matter (no cross-references), except `Task.itopTicketRef` must exist before the activity-log port's `lib/activity.ts` lists it (or the activity port omits it and the iTop port adds it).
Spine: schema.prisma + migrations => instant opus review per CLAUDE.md.

---

## 3. Security review inputs

### 3.1 secretBox.ts (CUST backend/src/lib/secretBox.ts, 61 lines, commit 6ff1d3a)
- API: `seal(plain): string`, `open(sealed): string`, `SecretBoxError`. AES-256-GCM, 12-byte `crypto.randomBytes` IV per seal, 16-byte tag, format `v1:<iv b64>:<tag b64>:<ct b64>`. Any failure -> one generic SecretBoxError (no oracle, no plaintext in messages).
- Key: `env.SECRETS_KEY`, validated at boot (env.ts): regex `^[A-Za-z0-9+/]{43}=$` and decodes to exactly 32 bytes; generate with `openssl rand -base64 32`. Missing/invalid => process exits (no silent fallback).
- Gaps (port-time hardening, all low): no AAD (a sealed value could be swapped between columns/users by someone with DB write — e.g. copy another user's itop_token_enc into yours; mitigated only by DB access); no `authTagLength: 16` on `createDecipheriv` (truncated-tag acceptance); no key id / multi-key rotation — rotation = change key, every sealed value becomes unreadable (`unreadable:true` in token status; webhook 404; app-token reads 500 until re-pasted). Recommend for INTERNAL: pass `{ authTagLength: 16 }` and check tag length 16; optionally AAD = `"<table>.<column>:<rowId>"` (changes seal/open signatures — only if cheap).
- Tests: backend/test/secretBox.test.ts (94 lines, 12 tests: roundtrip, tamper, wrong key, format).

### 3.2 Secret storage & non-disclosure
- Stored sealed: `itop_config.app_token_enc`, `itop_config.webhook_secret_enc`, `users.itop_token_enc`. Never returned by any API (settings -> `appTokenSet`/`webhookSecretSet`; token status -> `set`). Webhook secret plaintext returned once at generation.
- Leaks found: (a) webhook secret header logged by request logger (fix: redact `x-solvro-webhook-secret`); (b) `POST /admin/itop/test` sends stored app token to an admin-supplied host; (c) INTERNAL's current logger logs `Authorization` bearer JWTs (pre-existing; fixed by porting requestLogger.ts with guest links).
- Client never logs the token (client.ts header comment); `Auth-Token` header only on outbound fetch.
- Prisma `User` rows: check every INTERNAL route that returns a full user object (`findMany` without `select`) — adding `itopTokenEnc` to User means any `include: { tam: true }`-style unselected relation would ship the sealed token to the browser. Spot-checked [V]: INTERNAL routes/users.ts:10-18, admin.ts:48-60, auth.ts:273-290 and opportunities.ts:1013 all `select`/hand-serialise user fields; no `tam: true`-style bare user includes found by grep. Keep it that way (reviewer checklist item); sealed, not plaintext, but must not leave the server.

### 3.3 Unauthenticated `POST /webhook/itop`
- Mount: `app.use("/webhook", webhookRouter)` BEFORE `express.json()` and before every authed router (CUST app.ts:62); INTERNAL app.ts must add the same line before line `app.use(express.json(...))`. No `requireAuth`.
- Shared secret header `X-Solvro-Webhook-Secret`; constant-time `crypto.timingSafeEqual` after length check; 404 if unset/undecryptable; 401 mismatch (coalesced warn log, 1/min); 202 accepted.
- Rate limit: two GLOBAL in-memory sliding windows (60 calls/min any, 6 accepted/min), process-local; does NOT use http/rateLimit.ts and does not depend on TRUST_PROXY. Body never parsed/trusted; only effect is a debounced incremental sync.
- Residual: unauthenticated flooder can consume the 60/min global budget => legit nudges 429 => staleness up to refreshMinutes. Acceptable; optional per-IP limiter via rateLimit.ts (arrives with guest links) keyed on `req.ip` (needs TRUST_PROXY right).

### 3.4 SSRF surface of the admin-supplied iTop URL
- Only admins (`*`) set/probe baseUrl; https-only regex; no IP/host restrictions; redirects followed (Node fetch default); 15 s timeout covering body; response bodies not reflected except iTop `message` strings in probes/errors (admin) and 409 `itop_refused` / 502 messages to end users (iTop text). `lastSyncError` admin-only.
- Personal-token PUT uses the stored baseUrl with the user's pasted token (user cannot choose the host). OK.
- Recommendations: `redirect: "error"` in client.ts; fix the /test stored-token fallback; optionally block private/loopback resolution in production (decide — on-prem iTop is often on a private IP, so probably NOT; document instead).

### 3.5 Gating of EVERY iTop route (there are no `requirePermission` calls in any iTop router — gating is router-level `requireAuth`/`requireAdmin` + in-handler visibility/config/token checks)
| Method | Path (as mounted) | Router middleware | In-handler checks | Who can reach in INTERNAL with CUST code |
|---|---|---|---|---|
| POST | /webhook/itop | none (before json parser) | global rate windows; secret configured (404); timingSafeEqual (401); accepted window (429) | anyone on the internet |
| GET | /admin/itop/settings | requireAuth, requireAdmin (`*`) | — | ADMIN only |
| PATCH | /admin/itop/settings | same | zod; IANA tz | ADMIN |
| POST/DELETE | /admin/itop/webhook-secret | same | — | ADMIN |
| POST | /admin/itop/test | same | https regex; stored-token fallback (finding) | ADMIN |
| POST | /admin/itop/sync | same | single in-flight | ADMIN |
| GET | /admin/itop/organizations, /customers, /persons | same | — | ADMIN |
| PATCH | /admin/itop/customers/:id | same | customer exists 404; unique org | ADMIN |
| POST | /admin/itop/customers/automatch, /persons/match | same | — | ADMIN |
| GET | /itop/me/token | requireAuth | own row only | every authed user incl. PENDING |
| PUT | /itop/me/token | requireAuth | per-user 10/10 min; baseUrl configured 409; ownership checks (best-effort) | every authed user incl. PENDING, SALES, STAKEHOLDER |
| DELETE | /itop/me/token | requireAuth | own row | every authed user |
| GET | /itop/status | requireAuth | none (no lastSyncError) | everyone authed |
| GET | /itop/customers/:id/tickets | requireAuth | ensureCustomerVisible (404) | visibility: view-all (ADMIN, STAKEHOLDER), customer TAM, project TAM/SA(INT)/member(after members port), AND everyone for unowned customers (`tamId:null` arm) — incl. PENDING/SALES |
| GET | /itop/tickets/:id (with public+private log) | requireAuth | ticket mapped; ensureCustomerVisible | same as above |
| GET | /itop/tickets/by-ref/:ref (with logs) | requireAuth | same | same |
| POST | /itop/refresh | requireAuth | optional customerId visibility; configured 409; 10 s process cooldown; FULL sync | every authed user |
| GET | /itop/daily | requireAuth | customerVisibilityFilter ∧ mapped | same visibility set |
| POST | /itop/tickets/:id/actions | requireAuth | actionsEnabled 404 → ticket/visibility 404 → own token 403 → decrypt 403 → baseUrl 409; iTop's own rights | any visible-customer user with their own valid iTop token (STAKEHOLDER/SA/SALES too) |
| POST | /itop/tickets/:id/log | requireAuth | same | same |
| GET | /itop/services | requireAuth | configured (409) | every authed user (whole iTop service catalogue + provider org names) |
| GET | /itop/customers/:id/contacts | requireAuth | ensureCustomerVisible; mapped | visibility set (returns iTop Person names+emails of the org) |
| POST | /itop/tickets | requireAuth | actionsEnabled 404; isCustomerVisible 400; mapped; own token; caller∈org (app token) | same as actions |
| POST | /itop/tickets/:id/time | requireAuth | write preconditions + itopUserId 403; duration bounds | same |
| GET | /utilization | requireAuth | scope tam/customer needs `report:executive` (403) | `me`: everyone; others: ADMIN (+ any role granted report:executive) |
| PATCH | /tasks/:id (itopTicketRef) | existing tasks router (`task:write` + ensureTaskVisible) [V CUST tasks.ts] | regex | TAM/ADMIN (+ members) |

Recommended INTERNAL gating (decision needed, see §7/§10):
- `itopRouter` read routes (`/status` excepted): `requirePermission("project:read")` — matches customer notes; removes PENDING and SALES. 
- Write routes (`/actions`, `/log`, `/tickets`, `/time`): additionally `requirePermission("task:write")` (TAM/ADMIN) so STAKEHOLDER/SA cannot write even with a token — or accept CUST's "iTop's own rights apply" stance.
- `POST /itop/refresh`: `project:read`.
- `/itop/services`: `project:read`.
- `privateLog`: decide whether STAKEHOLDER (read-only, view-all) should see iTop private logs; CUST shows them to any viewer.
- `/itop/me/token`: leave requireAuth, or `task:write` if writes are gated that way (no point storing a token you can't use).

### 3.6 What restricted roles reach (INTERNAL roles from backend/prisma/seed.ts:13-29)
- PENDING `[]`: with CUST code — status, own token CRUD, tickets/daily/contacts/logs of UNOWNED mapped customers, refresh, services, utilization `me`. With recommended gating — status + token only (or nothing).
- SALES `["pipeline:view"]`: same as PENDING today (no project:read). Recommended: nothing iTop.
- SA `["project:read", pipeline:*]`: tickets of customers where SA is on a project (saId arm) + customer TAM arm n/a + unowned customers; writes if they paste a token. Recommended: reads yes (pre-sales context) — decision; writes no (no task:write).
- STAKEHOLDER `["project:read","project:view-all"]`: every customer's tickets incl. private logs; writes with own token. Recommended: reads yes, writes no; private log decision.
- TAM: as CUST.

### 3.7 privateLog exposure
- Stored for every synced ticket (sync reads `private_log` with the app token). Returned only by single-ticket routes (`/tickets/:id`, `/tickets/by-ref/:ref`) and write-route responses (`withLogs:true`); never by list/daily (TICKET_ROW_SELECT). Rendered in TicketLog.tsx under a Private tab.
- `/itop/tickets/by-ref/:ref` is called from TaskPanel for any task with a ref => anyone who can see the task's project AND the ticket's customer gets the private log.

### 3.8 iTop data reaching exports / customer-facing output
- [V] No iTop field in CUST frontend lib/export (INTERNAL has no lib/export dir; Gantt Excel export in lib/gantt — CUST only adds `itopTicketRef: null` to a test fixture), not in search, not in notifications, not in the guest-link payload (lib/shareLinks.ts:90-104 selects explicit task columns: title,status,startDate,dueDate).
- Indirect path: Daily strip "Add to note" copies `"<ref> <title>"` into the operations CustomerNote text, which flows into Weekly Sync drafts like any note text. That is user-initiated text; the INTERNAL-notes guardrail concerns ProjectNote.visibility and is unaffected. Ticket titles are customer-originated in iTop anyway. Mention in review checklist only.
- `Task.itopTicketRef` appears in the activity log diff (CUST lib/activity.ts:91,115) => visible to project viewers; harmless.

---

## 4. Config / ops

### 4.1 Env vars (backend/src/env.ts)
| Var | Required | Default | Notes |
|---|---|---|---|
| SECRETS_KEY | yes (boot fails without) | none | base64 of 32 bytes; `openssl rand -base64 32` |
| ITOP_SYNC_DISABLED | no | false | true/false/1/0/yes/no (case-insensitive) => boolean; only stops the periodic timer |
| TRUST_PROXY | no | "1" | hop count 0..10 or Express trust list; parsed by http/trustProxy.ts (38 lines) — comes with guest links; not needed by iTop itself |
INTERNAL env.ts (24 lines today) gains the three blocks verbatim from CUST env.ts:12-21 and :26-55 (TRUST_PROXY needs `parseTrustProxy` import -> guest-links port; if iTop lands first, add only SECRETS_KEY + ITOP_SYNC_DISABLED).

### 4.2 setup.sh (INTERNAL tracked) — iTop-relevant hunks only (from `diff INTERNAL CUST setup.sh`)
- Compose backend env: `SECRETS_KEY: ${SECRETS_KEY}` (CUST setup.sh:168) [+ `TRUST_PROXY: "${TRUST_PROXY:-1}"` :171 with guest links].
- Update path (CUST :204-209): after sourcing `~/solvro/.env`, if SECRETS_KEY empty, generate `openssl rand -base64 32` and APPEND to .env, never overwrite.
- Fresh install (CUST :331-337): generate SECRETS_KEY and write `SECRETS_KEY=$SECRETS_KEY` into .env.
- ITOP_SYNC_DISABLED is NOT passed through by CUST's generated compose — an operator cannot set it on a setup.sh install without editing the compose file. Port as-is or add `ITOP_SYNC_DISABLED: "${ITOP_SYNC_DISABLED:-false}"` (recommend adding; small).
- Ignore CUST's `solvro-cust-*` image renames. setup.sh is a spine file (docker/env/setup.sh) => instant review.

### 4.3 CI (.github/workflows/ci.yml, ci/docker-compose.ci.yml, ci/.env.ci.example)
- ci.yml ~:127: rename step "Generate ephemeral JWT secret" -> "Generate ephemeral secrets" and also echo `SECRETS_KEY=$(openssl rand -base64 32)` into $GITHUB_ENV; ~:187 (second job's env file block) add the same line (CUST ci.yml:127-133, :192).
- ci/docker-compose.ci.yml backend env: `SECRETS_KEY: ${SECRETS_KEY:?SECRETS_KEY is required}`; header comment updated.
- ci/.env.ci.example: CUST adds `SECRETS_KEY=`; [V] INTERNAL `ci/` holds only docker-compose.ci.yml, so skip (or create it only if wanted).
- backend/test/env.ts: `process.env.SECRETS_KEY ??= "c29sdnJvLXRlc3Qtc2VjcmV0cy1rZXktMzItYnl0ZXM="` (fixed test key, CUST :18-19). gates.sh runs backend vitest in the container: the container needs SECRETS_KEY in its env (dev compose) or the test env.ts default covers it [V test/env.ts sets it when unset].

### 4.4 Dev stack (INTERNAL docker-compose.yml is local-only/untracked) — the user must add by hand
In `services.backend.environment` (INTERNAL docker-compose.yml:79-86):
```yaml
      SECRETS_KEY: <any base64 of 32 bytes, e.g. output of `openssl rand -base64 32`; dev-only>
      ITOP_SYNC_DISABLED: "false"   # optional; "true" to silence the scheduler
      TRUST_PROXY: "1"              # optional (guest links)
```
Without SECRETS_KEY the backend exits at boot after the port. Then `docker compose up -d backend` (env change needs recreate, not restart). Optional local fake iTop: `docker compose exec backend npx tsx test/itop/run-fake-itop.ts` (port 8484, FAKE_ITOP_PORT) — but admin PATCH requires https, so point ItopConfig.base_url at it via SQL/Prisma Studio (as the backend tests do) [V tests write config directly, tickets.test.ts:116]. Note memory: tunnel dev uses vite.config.local.ts; no iTop impact.
Also `backend/.env.example` (tracked in INTERNAL) gains `SECRETS_KEY=` (CUST :7).

### 4.5 docs/CONFIGURATION.md updates (docs-keeper-owned; trigger fires on env/setup.sh)
Port CUST sections: env table rows SECRETS_KEY / ITOP_SYNC_DISABLED (/ TRUST_PROXY), required-var list (CUST :51), secrets discipline bullets (:61, :64), setup.sh auto-generation note (:283), CI note (:313), new section "2.16 iTop integration" (:319-335: connection needs, sync interval, Time Tracking, network (outbound HTTPS only; inbound only for the optional webhook), secrets, webhook URL/header, actions + per-TAM token needs, token ownership rule, lifecycle defaults, storage, new ticket, time logging), box diagram line (:344). Also CUST OPERATIONS.md:32,50 (INTERNAL has no OPERATIONS.md — fold into CONFIGURATION.md). README.md:266 "Work Logs … placeholder" -> Utilization; docs/ISSUES.md:220 Work Logs line -> remove/replace.

### 4.6 Upgrade path for the existing INTERNAL prod deployment
1. Pull the release; re-run `setup.sh` (update branch) => it appends a generated SECRETS_KEY to `~/solvro/.env` if absent, rewrites compose with `SECRETS_KEY: ${SECRETS_KEY}`, `docker compose pull && up -d`. If someone deploys new images WITHOUT re-running setup.sh, the backend crash-loops on the missing var — release notes must say "re-run setup.sh".
2. Migrations are additive (nullable/defaulted) — `prisma migrate deploy` at container start applies them; no data backfill. ItopConfig row is created lazily on first read.
3. Back up `~/solvro/.env` together with the DB: losing SECRETS_KEY = re-entering the app token, webhook secret and every personal token (data in snapshot tables is unaffected).
4. Post-deploy: Admin > iTop: URL, app token, timezone (iTop server's), Test, Automatch + manual org mapping, Match users, optional webhook secret (+ iTop-side trigger), optional "Actions from Solvro".
5. If the existing logs predate request-log redaction, rotate JWT_SECRET (CUST CONFIGURATION.md:60) — applies once requestLogger lands.

---

## 5. Backend file-by-file (CUST HEAD line counts; all NEW in INTERNAL unless marked EDIT)

| File | Lines | Introduced / last touched (CUST) | Notes for INTERNAL |
|---|---|---|---|
| src/lib/secretBox.ts | 61 | 6ff1d3a | copy; optional authTagLength hardening |
| src/env.ts (EDIT) | +22 SECRETS_KEY, +13 ITOP_SYNC_DISABLED (+16 TRUST_PROXY w/ guest links) | 6ff1d3a, c4d95c8 | INTERNAL env.ts is 24 lines |
| src/lib/itop/types.ts | 187 | 9a54c29 … b7757a7 | field unions, output_fields, case-log types |
| src/lib/itop/client.ts | 365 | 9a54c29, b7757a7 | add `redirect: "error"` |
| src/lib/itop/config.ts | 98 | c4d95c8, 933d3d0 | 30 s cache; getItopAppClient (catch SecretBoxError -> 409?) |
| src/lib/itop/timezone.ts | 194 | 933d3d0 | Intl-based, no deps |
| src/lib/itop/sync.ts | 931 | c4d95c8, 5b3d0a5, d4a5f07, b7757a7, 933d3d0 | syncUsers/syncTickets/syncTimeEntries, advisory lock |
| src/lib/itop/scheduler.ts | 96 | c4d95c8 | |
| src/index.ts (EDIT) | +3 | c4d95c8 | start/stop scheduler; CUST also starts activityCleanup (activity port) |
| src/routes/itopAdmin.ts | 637 | 4fea8c3, 9a677ad, 8ce20af, 933d3d0 | fix /test token fallback |
| src/routes/itop.ts | 1325 | 842a3d9, 242f5e9, 418d88b, d4a5f07, 694c505, e4a64a6, b7757a7, b59a7b2, 933d3d0 | add requirePermission gating (§3.5) |
| src/routes/itopUser.ts | 269 | 8ce20af, b7757a7 | fail-closed ownership (§3) |
| src/routes/webhook.ts | 139 | 9a677ad | |
| src/routes/utilization.ts | 270 | 43b00d6, 933d3d0 | |
| src/app.ts (EDIT) | +7 imports/mounts | 4fea8c3, 842a3d9, 9a677ad, 8ce20af, 43b00d6 | `/webhook` before express.json; `/admin/itop` after `/admin`; `/itop/me` BEFORE `/itop`; `/utilization`. Keep INTERNAL's `/opportunities` mounts. |
| src/http/requestLogger.ts | 44 | (guest links eadc065) | needed to redact webhook secret; add header |
| src/routes/tasks.ts (EDIT, spine) | +12 | 418d88b | `itopTicketRef` in PATCH schema + data build |
| src/lib/duplicate.ts (EDIT) | +2 comment | 418d88b | ref never copied |
| src/lib/activity.ts (EDIT, if activity ported) | +2 | 476288e | include itopTicketRef in task diff |
| prisma/schema.prisma (EDIT, spine) | ~+120 | see §2 | |
| prisma/seed.ts | 0 | — | no change; ItopConfig upserted lazily |
| test/env.ts (EDIT) | +4 | 6ff1d3a | fixed SECRETS_KEY |
| backend/.env.example (EDIT) | +3 | 6ff1d3a | |

Dependencies on other ports:
- MEMBERS: none in code — iTop uses `ensureCustomerVisible`/`customerVisibilityFilter`/`isCustomerVisible`, which INTERNAL already has (visibility.ts). After the members port, ticket visibility automatically widens to members via the project arm.
- ACTIVITY: only `lib/activity.ts` listing `itopTicketRef` (CUST :91,115) — whichever lands second adds it.
- RATE-LIMIT / TRUST_PROXY: none (webhook has its own windows). requestLogger.ts (from guest links) is wanted for the secret-redaction fix — if iTop lands first, port requestLogger.ts with it (it's standalone: pino-http + stdSerializers).
- UI-pass (489b0a4): backend none.

Tests (vitest; CUST counts: lines / `it|test(` blocks):
| File | Lines | Tests |
|---|---|---|
| test/secretBox.test.ts | 94 | 12 |
| test/itopAdmin.test.ts | 689 | 31 |
| test/itop/fakeItop.ts (Express fake rest.php: core/get|create|update|apply_stimulus|list_operations, in-memory state, token→person scoping, tz) | 1014 | — |
| test/itop/run-fake-itop.ts (dev runner, FAKE_ITOP_PORT 8484) | 27 | — |
| test/itop/client.test.ts | 351 | 14 |
| test/itop/sync.test.ts | 1052 | 36 |
| test/itop/tickets.test.ts | 481 | 20 |
| test/itop/daily.test.ts | 557 | 23 |
| test/itop/utilization.test.ts | 530 | 15 |
| test/itop/webhook.test.ts | 187 | 11 |
| test/itop/taskTicketRef.test.ts | 191 | 10 |
| test/itop/itopToken.test.ts | 288 | 14 |
| test/itop/ticketActions.test.ts | 437 | 16 |
| test/itop/ticketCreate.test.ts | 386 | 13 |
| test/itop/ticketTime.test.ts | 636 | 16 |
| test/itop/caseLog.test.ts | 89 | 6 |
| test/itop/timezone.test.ts | 102 | 12 |
Total ≈ 249 tests, ~7.1k lines. Mechanism: tests write ItopConfig directly via Prisma (http baseUrl of a fake listening on an ephemeral port, sealed app token — e.g. tickets.test.ts:116), bypassing the https-only PATCH validator. Uses INTERNAL's existing isolated `_test` DB flow (backend/CLAUDE.md:19-20). [INT] new tests needed: role-gating (PENDING/SALES 403, STAKEHOLDER read-only), SA visibility arm on tickets, webhook header redaction, /test token fallback refusal, ownership fail-closed. testAuth helper: INTERNAL already has backend/test/testAuth.ts and test/env.ts [V]; the SA arm already has projectSaOptional/projectVisibility tests to mirror.

---

## 6. Frontend file-by-file (CUST HEAD). Page-level hunks are already itemised in sibling reports fe-pages.md (§DailyReview, §Settings, §CustomerDetail 3.x, §Admin 2.17, §3.3 Utilization) and fe-components.md (TaskPanel L15/42-43/90-100/770-785, TopBar, OperationsCard, WeekNotesEditor, CustomerGroup) — not repeated.

NEW files:
| File | Lines | Phase |
|---|---|---|
| components/ui/switch.tsx | 35 | P1 (first consumer ItopTab) |
| components/admin/ItopTab.tsx | 967 | P1, P4 (webhook card), P5 (actions switch), tz |
| components/admin/itopSettingsDiff.ts (+test) | 149 | P1/tz |
| components/admin/itopTimezones.ts (+test) | 90 | tz (933d3d0) |
| components/itop/TicketsTab.tsx | 198 | P1, P6 |
| components/itop/TicketsTable.tsx | 205 | P1 |
| components/itop/TicketFilters.tsx | 97 | P1, P6 |
| components/itop/SyncedAgo.tsx | 56 | P1 |
| components/itop/ticketPresentation.ts (+test 199) | 149 | P1+ |
| components/itop/DailyItopStrip.tsx | 233 | P2, P6 |
| components/itop/dailyStripPresentation.ts (+test 16) | 30 | P2 |
| components/utilization/UtilizationTable.tsx | 159 | P3 |
| components/utilization/UtilizationTiles.tsx | 73 | P3 |
| components/utilization/utilizationPresentation.ts (+test 71) | 67 | P3 |
| pages/Utilization.tsx | 227 | P3 |
| components/itop/TaskTicketField.tsx | 240 | P4, P7 |
| components/itop/TicketPanel.tsx | 324 | P5 |
| components/itop/TicketLog.tsx | 171 | P5 |
| components/itop/ActionSheet.tsx | 202 | P5, b59a7b2 |
| components/itop/ticketActions.ts (+test 95) | 89 | P5, P6 |
| components/itop/board/TicketBoard.tsx | 356 | P6 |
| components/itop/board/TicketCard.tsx | 103 | P6 |
| components/itop/board/boardAdapter.ts (+test 138) | 106 | P6 |
| components/itop/board/dropMapper.ts (+test 64) | 71 | P6, b59a7b2 |
| components/itop/NewTicketSheet.tsx | 249 | P6, P7 |
| components/itop/TicketTimer.tsx | 221 | P7 |
| components/itop/useTicketTimer.ts (+test 104) | 381 | P7 |
Total ≈ 5.7k lines incl. unit tests.

EDITS:
- lib/queries.ts (spine): Task type `itopTicketRef` (CUST :317-327); queryKeys block (:772-821); iTop hook block (:3025-~3775: useItopStatus, useMyItopToken/Save/Remove, useCustomerTickets [refetchInterval 60 s when `poll`, not in background], useItopCustomerMapped, useRequestItopRefresh, useItopTicketByRef, useItopTicket, useLogTicketTimeFor/useLogTicketTime, useTicketActionFor/useTicketAction [no onMutate — server answer only], useItopServices, useItopContacts, useCreateTicket, useItopDaily [refetchInterval 60 s only when configured], useUtilization); adminQueryKeys `itop*` (:3778-3781) + admin hooks (:4085-~4283: useItopSettings/Update, webhook secret gen/delete, test, useItopSyncNow, organizations, customers, map, automatch, persons, match). ≈ +950 lines into INTERNAL's 3053-line file — keep contiguous. Note CUST queries.ts comment (:3178) "the first refetchInterval in the app" — INTERNAL frontend/CLAUDE.md has no polling rule [V grep], so no convention conflict, but if the 30 s project refresh (25dbeec) is ported too, both coexist.
- App.tsx: replace `import { WorkLogs }` (INTERNAL :21) and `<Route path="work-logs" element={<WorkLogs/>}>` (:60) with `Utilization` route + `work-logs` Navigate redirect; keep PipelineGuard/Pipeline/OpportunityDetail routes.
- lib/navCommands.ts: INTERNAL :20-23 comment says Work Logs is an unbuilt placeholder with no nav entry => add `{ to: "/utilization", label: "Utilization", icon: "schedule" }` after Weekly Sync (INTERNAL has no `group` field — CUST's "Insights" group comes with the UI pass) [V INTERNAL navCommands.ts:15-27]; update navCommands.test.ts.
- lib/routeMeta.ts (+test): absent in INTERNAL; if/when ported, map `utilization` and `work-logs` -> "Utilization".
- pages/WorkLogs.tsx (20 lines): DELETE (CUST 065f078 deleted it, -20). Not protected by a guardrail (only Tasks.tsx is); but the standing decision text must be replaced in the same PR (user-owned, §8).
- pages/CustomerDetail.tsx: Tickets tab gated by status.configured ∧ mapped; TicketPanel via `?ticket=`; AccountHeader `itopOrgName` (components/customer/AccountHeader.tsx:73-122 — comes with the CUSTOMERS account-page port; otherwise show org name in the existing header).
- pages/DailyReview.tsx + daily-review/CustomerGroup.tsx (+5), OperationsCard.tsx (+45), WeekNotesEditor.tsx (+43 `pendingInsert`): strip + Add to note.
- pages/Settings.tsx (+154): `ItopTokenSection`.
- pages/Admin.tsx (+4/-1 in CUST, but INTERNAL must ADD a tab, not replace Pipeline): six tabs.
- components/TaskPanel.tsx (+21..31): "iTop ticket" row with TaskTicketField; `useItopStatus`, `useProject` for customer.
- components/layout/TopBar.tsx (+18): running-timer pill.
- lib/auth.tsx (+4): clear `solvro.itopTimer.*` localStorage keys on logout.
- lib/helpContent.ts: iTop topic (only if the Help page port lands; spec-help.md).
- components/kanban-v2/adapter.test.ts, commitMapper.test.ts: fixture gains `itopTicketRef: null` (type growth).
- lib/gantt/exportExcel.test.ts fixture `itopTicketRef: null` [V CUST :65; INTERNAL has the same file]. The Excel/PDF Gantt exports do not emit the ref [V: no itop in CUST lib/gantt/*.ts outside tests].
- Imports needed that INTERNAL lacks [V by path check]: `@/components/ui/switch` (new in P1), `@/lib/formatDate` (UI-pass port 489b0a4) — either port formatDate.ts first or swap to INTERNAL's existing date helpers. All other `@/…` imports of the iTop/utilization files exist in INTERNAL (`Chip` from StatusChip exists in INTERNAL [V]; dailyReviewStats, clipboard, dateField, isoWeek named exports [U — tsc will tell]).
- TicketBoard uses vendored `@/components/reui/kanban` only; CUST never modified reui/ (only commit touching it is the initial import 10c0b16) [V]. INTERNAL guardrail lists sanctioned Solvro drag layers as `gantt-v2/`, `kanban-v2/` only — CUST added `itop/board/` to that guardrail (e47d68a). INTERNAL's guardrail is user-owned => propose the same amendment (§8).

---

## 7. Pipeline / SA interplay

Facts [V]:
- CUST built iTop AFTER removing the Pipeline module (PR #1 30106e8, migration 20260922034304_remove_pipeline_module); CUST roles = ADMIN/TAM/STAKEHOLDER/PENDING only; CUST visibility has no `saId` arm. So no CUST behaviour exists for SA/SALES.
- CUST ticket visibility = customer visibility, period: `ensureCustomerVisible` on id routes, `customerVisibilityFilter ∧ itopOrgId != null` on /daily, ticket's customer for single-ticket routes. Arms (CUST): view-all | customer.tamId = me | customer.tamId null | any visible project (project.tamId | customer.tamId | member).
- INTERNAL visibility today (lib/visibility.ts): project arms `tamId | saId | customer.tamId`; customer arms `tamId | tamId null | some visible project`. After the members port: `tamId | saId | customer.tamId | members`.
- INTERNAL `Opportunity` links a customer only by `customerName` string (schema.prisma ~:588) — no FK — so the Pipeline gives no visibility path to a Customer; an SA sees a customer only through a project where they are `saId` (or unowned customers / view-all).
- INTERNAL SA role has `project:read` but no `project:write`/`task:write`; SALES has only `pipeline:view`.

What porting CUST code verbatim would mean in INTERNAL:
- SA: sees tickets (incl. private logs) of customers where they are SA on any project + all unowned mapped customers; can write to iTop if they paste a token and actionsEnabled (Solvro adds no role check).
- SALES / PENDING: see tickets of all UNOWNED mapped customers (the `tamId:null` arm) — almost certainly unintended.
- Utilization: SA/SALES whose email exists in iTop get matched by `syncUsers` (all active users are candidates) and appear in "By TAM" rows and in the capacity multiplier (capacity × active mapped users).

Decisions needed (recommendations in brackets):
- D1. Gate iTop reads by `project:read` [yes] — drops SALES and PENDING.
- D2. Should SA see customer tickets (read)? [yes — pre-sales/hand-off context; it's what customer visibility already grants them for notes].
- D3. Who may write to iTop from Solvro? [require `task:write` in addition to own token => TAM/ADMIN only; STAKEHOLDER/SA read-only]. Alternative: CUST stance "iTop's own rights decide".
- D4. privateLog visibility [show to `task:write` holders only, or to all readers as CUST]. 
- D5. Utilization "By TAM": include only users whose role has `task:write` (TAMs) in rows/capacity, or everyone matched [recommend restrict capacity multiplier to TAM-capable users; else an SA matched in iTop inflates capacity]. Also: should `syncUsers` skip SALES/PENDING users? [optional].
- D6. Utilization nav entry `requires` [`project:read`].
- D7. Any Pipeline linkage (ticket on opportunity, iTop org on Opportunity)? CUST spec "Not in either option": "Pipeline or opportunity links" [no].
- D8. Should SALES/SA be allowed a personal token at all (Settings section)? [hide section unless `task:write` if D3 adopted].

## 8. Proposed replacement wording for INTERNAL CLAUDE.md (user-owned — propose only)

Replace, in **Standing decisions**, the sentence:
> `WorkLogs.tsx`: placeholder for a future iTop API integration; don't wire it up until that spec exists.

with:
> Work Logs became **Utilization** (user decision 2026-10-02, ported from the customer distribution): `/utilization` reads hours from the iTop Time Tracking snapshot; `/work-logs` stays only as a redirect to it. Hours and tickets are owned by iTop — Solvro keeps a read snapshot and never stores a ticket status or time entry iTop has not confirmed; no cell on Utilization is editable. Spec: `docs/archive/plans/itop-integration.md` (+ the INTERNAL port plan's archive path).

Add to **Guardrails** (mirrors CUST e47d68a, adapted):
> - **iTop writes never use the application token** (user decision 2026-09-24, adopted 2026-10-02). Every iTop create, update, or stimulus from Solvro runs under the acting user's own personal token (`User.itopTokenEnc`), accepted only when it resolves to the iTop Person with that user's Solvro email. The application token (`ItopConfig.appTokenEnc`) only reads — no fallback to it for a write, ever.
> - **Integration secrets are sealed with `SECRETS_KEY`** (`backend/src/lib/secretBox.ts`) and never serialised to any client; secret-bearing headers (Authorization, `X-Solvro-Webhook-Secret`) and guest-link tokens are redacted from request logs.

Amend the drag-library guardrail's sanctioned layers: "`gantt-v2/`, `kanban-v2/`, and the iTop ticket board `itop/board/`".
Spine list: add `lib/secretBox.ts`, `routes/webhook.ts`, `routes/itopUser.ts` (token ownership), `lib/itop/client.ts` (outbound/SSRF) — proposal.
If D1/D3 adopted, a one-line rule in backend/CLAUDE.md: "iTop routes gate with `project:read` (reads) / `task:write` (writes) on top of customer visibility; never re-derive visibility."

## 9. e2e (itop-*.spec.ts + utilization.spec.ts)
| Spec | Lines | Tests | Notes |
|---|---|---|---|
| e2e/tests/itop-tickets.spec.ts | 227 | 2 | P1; added `serviceWorkers: "block"` in 2cf68b5 |
| e2e/tests/itop-daily-review.spec.ts | 227 | 1 | P2 |
| e2e/tests/utilization.spec.ts | 203 | 3 | P3; incl. /work-logs redirect |
| e2e/tests/itop-task-ref.spec.ts | 328 | 4 | P4/P7; uses `createTask` fixture |
| e2e/tests/itop-ticket-panel.spec.ts | 374 | 4 | P5 |
| e2e/tests/itop-board.spec.ts | 612 | 7 | P6; drag smoke |
| e2e/tests/itop-timer.spec.ts | 410 | 4 | P7 |
How they run without iTop [V]: every spec intercepts the backend API with `page.route("**/api/itop/…")` / `("**/api/utilization*")` and scripted JSON shaped like routes/itop.ts; `test.use({ serviceWorkers: "block" })` so the PWA service worker doesn't bypass the mocks; login via `loginViaUi`; real backend only for login and the `seededProject` fixture (customerId, projectId, token) and `createTask`. No fake iTop, no seed changes, no CI env beyond SECRETS_KEY.
INTERNAL fixtures [V]: e2e/fixtures/test.ts exposes `seededProject`; seed.ts has `seedFixture`, `createTask`, `login` — compatible. INTERNAL's `seedFixture` sets `saId: userId` on the project (seed.ts ~:89); harmless for mocked specs. Add a role-gating e2e only if D1/D3 change visible UI (e.g. no Tickets tab for SALES) — optional, backend tests cover it. Desktop + mobile projects both run these (Tickets table collapses to cards under md).

## 10. Phase breakdown (mirrors CUST phases; port the CUST HEAD state of each file, not the commit-by-commit history, because P8/P9 fixes (b7757a7, b59a7b2, 933d3d0) and the UI pass (489b0a4) rewrote earlier-phase code)

Estimate basis: CUST diff sizes — P0 206+, P1 7 679+, P2 1 322+, P3 2 320+, P4 1 431+, P5 3 391+, P6 2 940+, P7 2 783+, real-install fix 898+/147−, tz fix 1 389+/120− (≈24k lines incl. tests/docs). Porting is mostly copy + adapt, so effort is review/gating/test-adaptation dominated.

| # | Phase (CUST source) | CUST commits | INTERNAL files | Acceptance | Size | Depends on |
|---|---|---|---|---|---|---|
| 0 | Secrets at rest + log redaction | 6ff1d3a (+ requestLogger from eadc065) | lib/secretBox.ts, env.ts, test/env.ts, secretBox.test.ts, .env.example, setup.sh, ci.yml, ci compose, http/requestLogger.ts (+`x-solvro-webhook-secret`), app.ts logger swap, CONFIGURATION.md | boot fails w/o valid key; roundtrip/tamper tests; setup.sh update path appends key once; CI green with ephemeral key; Authorization+webhook header redacted in logs | S-M | — (coordinate with guest-links port, which also brings requestLogger/TRUST_PROXY) |
| 1 | Connection, snapshot, Tickets tab | 03ea2e4, 9a54c29, c4d95c8, 4fea8c3, 842a3d9, 9467f9b, cbaf7ee, 742eef1, 2cf68b5 + fixes b7757a7, 933d3d0 (sync/client/tz parts) | migration itop_snapshot (+timezone), lib/itop/{types,client,config,timezone,sync,scheduler}.ts, index.ts, routes/itopAdmin.ts, routes/itop.ts (read routes), app.ts mounts, test/itop/{fakeItop,run-fake-itop,client,sync,tickets,timezone,caseLog}.test, itopAdmin.test; FE ui/switch, admin/ItopTab(+diff,timezones), Admin.tsx (6th tab), itop/{TicketsTab,TicketsTable,TicketFilters,SyncedAgo,ticketPresentation}, CustomerDetail.tsx, queries.ts; e2e itop-tickets | admin connects, tests, maps orgs, matches users; scheduler syncs; Tickets tab only for mapped customers; PENDING/SALES 403 (D1); /test refuses stored token to a new host; client `redirect:"error"` | L (split BE/FE waves) | 0 |
| 2 | Daily Review strip | 242f5e9, 33aa5ca, f0678ea | routes/itop.ts /daily, daily.test; DailyItopStrip, dailyStripPresentation, OperationsCard, WeekNotesEditor, CustomerGroup, DailyReview.tsx, queries.ts; e2e itop-daily-review | strip only for visible mapped customers; Add to note inserts ref | S-M | 1 (+ INTERNAL daily-review v2 parity: verify OperationsCard/WeekNotesEditor shapes match — fe-components.md) |
| 3 | Utilization (Work Logs -> Utilization) | 5b3d0a5, 43b00d6, 065f078, 1ee63b6, b4e666d | migration itop_time_entries, sync.ts time entries, routes/utilization.ts, utilization.test; pages/Utilization.tsx, components/utilization/*, App.tsx, navCommands(+test), delete pages/WorkLogs.tsx, README.md:266, ISSUES.md:220, CLAUDE.md standing decision (user); e2e utilization | /work-logs redirects; TAM sees Me only; executive sees 3 scopes; capacity per D5 | M | 1; user approval of §8 wording |
| 4 | Webhook + task ticket ref | 9a677ad, 418d88b, ebe58e2, bf8dbca | routes/webhook.ts (+mount before json), itopAdmin webhook-secret, migration task_itop_ticket_ref, routes/tasks.ts (spine), duplicate.ts comment, /tickets/by-ref; ItopTab webhook card, TaskTicketField, TaskPanel.tsx, queries.ts; tests webhook, taskTicketRef; e2e itop-task-ref (first 3 tests) | 401/404/429/202 behaviour; header redacted; ref regex; chip states | M | 1 (0 for redaction) |
| 5 | Personal tokens + write path | 8ce20af, d4a5f07, ed35482, efe4388 + b7757a7, b59a7b2 | migration itop_write_path, routes/itopUser.ts (fail-closed), itop.ts actions/log, ticketActions/itopToken tests; Settings ItopTokenSection, TicketPanel, TicketLog, ActionSheet, ticketActions.ts, ItopTab actions switch; e2e itop-ticket-panel | writes only under own token; refusal passthrough 409; no optimistic UI; D3 gate enforced | L | 1 |
| 6 | Board + new ticket | 694c505, 0f16e79, 9d64304 (+ b59a7b2 dropMapper) | itop.ts services/contacts/POST tickets, ticketCreate.test; board/* (vendored reui/kanban only), NewTicketSheet, DailyItopStrip quick actions; e2e itop-board | forbidden drops refused client-side; created ticket appears with iTop ref; reui/ untouched | M-L | 5 |
| 7 | Timer + create-from-task | e4a64a6, 4657f14, c6fe4c6, c4e3bf0 | itop.ts /time, ticketTime.test; TicketTimer, useTicketTimer(+test), TopBar pill, auth.tsx logout cleanup, TaskTicketField create flow; e2e itop-timer, itop-task-ref last test | Stop creates one TimeSpent; Utilization shows it; timer cleared on logout | M | 5, 6 (NewTicketSheet), 3 |
| 8 | Docs close-out | 742eef1, bf8dbca, efe4388, 9d64304, c6fe4c6, c839f69, e47d68a | CHANGELOG entries, CONFIGURATION.md §iTop, docs/archive/plans/itop-integration*.md + itop-integration-guide.md (reference), ISSUES.md deferred findings, CLAUDE.md proposals | docs-keeper triggers: env/setup.sh/CONFIGURATION | S | all |

Parallelism: Phase 0 alone first. Inside P1: W1 = migration ∥ client+fake ∥ secretBox-dependent config; W2 = sync+scheduler ∥ admin API; W3 = tickets API ∥ ItopTab; W4 = Tickets tab + e2e. After P1: P2, P3, P4, P5 are mutually independent at the backend (different routes; schema migrations separate) — P2 ∥ P3 ∥ P4 ∥ P5-backend can run as parallel tasks if worktrees isolate routes/itop.ts edits (P2, P4, P5 all append to routes/itop.ts and queries.ts — serialize those files or give one implementor itop.ts). P6 after P5; P7 after P5+P6+P3.
Overall estimate: XL as one programme (≈ 8 PR-sized phases); with CUST code as source, roughly 2–3 phases' worth of "L" effort each for P1 and P5, others M/S. Recommend 4 INTERNAL PRs: (A) P0+P1, (B) P2+P3+P4, (C) P5+P6, (D) P7+docs — each with a phase review; spine instant reviews on schema, tasks.ts, queries.ts, setup.sh, env.

Ordering with sibling ports: UI-pass `lib/formatDate` must precede FE of P1 (or adapt imports); members/activity/guest-links independent (activity adds `itopTicketRef` to its diff list if iTop P4 landed first); CUSTOMERS account-page port provides AccountHeader `itopOrgName` slot (else small local header tweak).

### Open questions for the user
1. D1–D8 in §7 (role gating of reads/writes, SA visibility, private log, Utilization capacity/nav).
2. Approve the CLAUDE.md wording in §8 (standing decision + 2 guardrails + drag-layer amendment + spine additions).
3. Is the INTERNAL deployment talking to the SAME iTop as CUST (3.2.2, Europe/Paris server tz, Time Tracking installed)? Plan decisions 2–11 assumed one install; re-confirm for INTERNAL's iTop (or none yet => ship with "not configured" states).
4. Accept CUST's security behaviour or apply the port-time fixes: webhook header redaction (recommend yes), /test stored-token fallback (yes), personal-token ownership fail-closed (yes), `redirect:"error"` (yes), GCM authTagLength (yes, trivial), per-IP webhook limiter (optional).
5. Add `ITOP_SYNC_DISABLED` passthrough to setup.sh's compose? (recommend yes)
6. One migration or one per phase? (recommend per PR group)
7. PR grouping (4 PRs as above vs 8 phases).
8. Keep CUST copy "Pipeline or opportunity links: not in either option" as INTERNAL scope (D7)?

### Blockers
- User-owned CLAUDE.md standing decision forbids wiring WorkLogs until "that spec exists" — needs the user's explicit wording change (§8) before Phase 3 merges.
- Dev stack: user must add SECRETS_KEY to the untracked docker-compose.yml before any backend boots post-Phase 0.
- Prod: existing install must re-run setup.sh (key generation) before/with the first image carrying Phase 0.
- `lib/formatDate` (UI-pass) dependency for the frontend files.
