# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Changelog discipline (mandatory)

**Whenever you change code, configuration, schema, dependencies, or Docker/env in this repo, append an entry to [CHANGELOG.md](CHANGELOG.md) in the same turn.** This file is treated as a configuration source-of-truth — environment setup, schema decisions, dependency rationale all live there.

- Format: Keep a Changelog conventions (`Added` / `Changed` / `Fixed` / `Removed` under the `[Unreleased]` section, reverse-chronological).
- Each entry should record **what changed**, **the file path(s)**, and **the why** when it isn't obvious from the diff (especially for env vars, Docker volumes, schema constraints).
- Never silently amend or rewrite existing entries — append. If a fix invalidates an earlier note, add a new `Changed` or `Fixed` entry referencing it.
- Do not skip this step for "small" changes. The user will rely on this file when reproducing the environment.

## Repository status

The full source of truth for product/design intent is three artifacts:

- [PRD.md](PRD.md) — product requirements, user stories, functional + non-functional requirements, target architecture, conceptual DB schema.
- [DESIGN.md](DESIGN.md) — design system: color tokens, typography scale, spacing tokens, elevation rules, component conventions. Frontmatter at the top is the canonical token source.
- [UI Design/](UI Design/) — four self-contained HTML mockups (`code.html` + `screen.png` per folder) that show how the design system resolves into actual screens.

Implementation lives under [backend/](backend/) (Express + Prisma + Postgres) and [frontend/](frontend/) (Vite + React + Tailwind), orchestrated by the root [docker-compose.yml](docker-compose.yml) for dev. Both apps are scaffolded and substantially built — see [CHANGELOG.md](CHANGELOG.md) for the running record of what exists and the configuration decisions behind it.

**Production deployment** is a separate path: [docker-compose.prod.yml](docker-compose.prod.yml) pulls prebuilt images from GHCR (`ghcr.io/${IMAGE_OWNER}/solvro-{backend,frontend}:${IMAGE_TAG}`) published by [.github/workflows/docker-publish.yml](.github/workflows/docker-publish.yml). The prod backend runs `prisma migrate deploy` on startup; the prod frontend is served by **nginx** (see [frontend/Dockerfile](frontend/Dockerfile) + [frontend/nginx.conf](frontend/nginx.conf)) on port 80, **not** Vite. Env vars for prod (`IMAGE_OWNER`, `IMAGE_TAG`, `POSTGRES_PASSWORD`, `JWT_SECRET`, `CORS_ORIGIN`) come from the host shell or a `.env` next to the compose file. When changing env contracts, update both compose files.

When the user asks for changes that touch visuals, tokens, or layout, reconcile against **DESIGN.md first, then the mockups** — the mockups occasionally drift from the spec (see "Known design drift" below).

## Common commands

Local Postgres + backend + frontend, all together:

```bash
cp .env.example .env   # first run only; generate JWT_SECRET as the comment instructs
docker compose up      # postgres :5432, backend :3000, frontend :5173
```

Host-side dev (recommended when iterating on a single tier — Postgres still runs in Docker):

```bash
docker compose up -d postgres

# backend (cwd: backend/)
npm install
npm run prisma:generate            # regenerate Prisma client (run after schema.prisma edits)
npm run prisma:migrate             # create + apply a new dev migration
npm run db:seed                    # idempotent — see prisma/seed.ts for default users
npm run dev                        # tsx watch on src/index.ts → http://localhost:3000
npm run dev:admin                  # one-off: provision a temp admin (scripts/create-temp-admin.ts)
npm run build && npm start         # production build (tsc → dist/, then node)
npm run prisma:studio              # GUI browser for the dev DB
npm run db:reset                   # DROP + recreate + reseed — destructive

# frontend (cwd: frontend/)
npm install
npm run dev                        # vite → http://localhost:5173
npm run typecheck                  # tsc --noEmit, no emit
npm run build                      # tsc -b && vite build
npm run preview                    # serve the built bundle
```

There is **no test runner, linter, or formatter wired in** for either app. If a change really needs verification, prefer `npm run typecheck` (frontend) or `npm run build` (backend = `tsc`) and exercise routes via curl. Don't fabricate a `npm test` command — say so explicitly when the user asks for tests.

Default seeded credentials (dev only — see [backend/prisma/seed.ts](backend/prisma/seed.ts)): password `password123` for `admin@solvro.local`, `sa.alice@solvro.local`, `tam.charlie@solvro.local`, `stakeholder.evan@solvro.local`, etc.

## Product domain (one-paragraph orientation)

Solvro bridges Solution Architects (SAs) and Technical Account Managers (TAMs). SAs design solution blueprints in an external tool; those blueprints are POSTed via webhook into Solvro's **Secure Ingestion Port**, which validates, sanitizes, and translates the payload into projects + tasks. TAMs then operate on those projects through a high-density dashboard with **Kanban**, **Gantt**, and **Timeline** views. Tasks generated from an SA blueprint are visually distinguished as **AI Breakdown** cards (amber glow) — this is a first-class UX concept, not decoration.

## Target architecture (per PRD §6)

Three-tier:

1. **Frontend** — React SPA, TailwindCSS, `gantt-task-react` for the Gantt view, `@dnd-kit/core` for Kanban, `recharts` for reports. (PRD mentions HTMX as optional; the actual implementation is pure React + TanStack Query.)
2. **Backend** — Node/Express + Prisma. Houses auth (JWT), RBAC, business logic, reporting, and an **isolated webhook endpoint** for SA blueprint ingestion (separate auth path: API key / OAuth2 — not yet implemented). Optional WS/SSE for push notifications.
3. **Data** — PostgreSQL 15+. Relational tables for `Users`, `Roles`, `Projects`, `Tasks`, plus app-domain models added during build (`Customer`, `Section`, `Label`, `Comment`); `Blueprints` stored as **JSONB** (versioned via `(projectId, version)` unique key) — the schema deliberately keeps blueprint payload flexible while project/task rows are normalized.

Deployment target is Docker / Docker Compose, stateless backend for horizontal scaling. Backend is held to **sub-200ms** API response as a non-functional requirement; design queries and indexes accordingly.

The ingestion-port → project/task translation is the single most load-bearing piece of business logic in the system: a blueprint JSON blob fans out into many task rows, and the AI Breakdown UI in the frontend depends on those tasks being tagged with their blueprint origin. Don't lose that linkage when implementing.

## Backend conventions

- **Entrypoint**: [backend/src/index.ts](backend/src/index.ts) boots the server; the Express app is constructed in [backend/src/app.ts](backend/src/app.ts) (separate file so the app is testable without binding a port). Routers are mounted **without an `/api/` prefix** — paths are `/auth`, `/projects`, `/tasks`, etc. Match this convention when adding new routes.
- **Env**: [backend/src/env.ts](backend/src/env.ts) parses `process.env` through Zod and exits the process on failure. Anywhere you need an env var, import from `./env.js` — do not read `process.env` directly.
- **Prisma client**: a single shared instance lives at [backend/src/prisma.ts](backend/src/prisma.ts). Always import that — don't `new PrismaClient()` per route or you'll exhaust the pool.
- **Auth & RBAC**: [backend/src/http/auth.ts](backend/src/http/auth.ts) exports `requireAuth` (JWT bearer) and `requireRole(...RoleName[])`. Every authed router calls `router.use(requireAuth)` once at the top; per-route role gates are layered with `requireRole("TAM", "ADMIN")`. The decoded user is on `req.user` (typed via a module declaration). Roles are `SA | TAM | ADMIN | STAKEHOLDER`.
- **Visibility filter**: a TAM can only see projects they own; an SA only projects they authored; ADMIN/STAKEHOLDER see everything. The canonical helper is `projectVisibilityFilter(req.user!)` in [backend/src/routes/projects.ts](backend/src/routes/projects.ts) — reuse it (or reach for the same pattern) whenever you query projects or anything joined to a project. Don't re-derive role-scoping ad hoc.
- **Validation**: [backend/src/http/validate.ts](backend/src/http/validate.ts) exports a `validate("body" | "params" | "query", schema)` middleware. Define Zod schemas at the top of the route file and apply them as middleware in the route chain — this is the only sanctioned input-validation pattern. Coerce numbers/dates with `z.coerce.*` for query/params.
- **Errors**: throw `new HttpError(status, code, message)` from [backend/src/http/errors.ts](backend/src/http/errors.ts). The global `errorHandler` (last middleware in `app.ts`) renders them as JSON `{ error, code }` and unwraps Zod failures. `express-async-errors` is imported at the top of `app.ts` so async throws propagate.
- **Logging**: `pino` + `pino-http` (request log middleware). Import the shared logger from [backend/src/logger.ts](backend/src/logger.ts); honor `LOG_LEVEL` from env.
- **Migrations**: in [backend/prisma/migrations/](backend/prisma/migrations/). Always use `prisma migrate dev` (named) — never edit committed migration SQL. `prisma migrate dev` will **prompt interactively** for a migration name if `--name` is omitted, so it will hang in non-interactive contexts; pass `--name <slug>` explicitly. The schema also keeps `@map("snake_case")` table/column names while the TS surface is camelCase; preserve that convention.
- **Routes inventory**: [backend/src/routes/](backend/src/routes/) contains `auth`, `admin`, `users`, `customers`, `projects`, `tasks`, `sections`, `labels`, `services`, `holidays`, `overview`, `health`. `services.ts` is the admin-managed catalogue of offered services (ADMIN-only writes, all-authed reads — used as a project taxonomy). The Secure Ingestion Port webhook is **not yet** in this list (see "Working on this repo" below).

## Frontend conventions

- **Routing** lives in [frontend/src/App.tsx](frontend/src/App.tsx). All authed routes are children of `<AuthGuard><Shell/></AuthGuard>`; `Shell` provides the tri-panel layout. The shipped pages are [Overview.tsx](frontend/src/pages/Overview.tsx), [Projects.tsx](frontend/src/pages/Projects.tsx) → [ProjectDetail.tsx](frontend/src/pages/ProjectDetail.tsx), [Customers.tsx](frontend/src/pages/Customers.tsx) → [CustomerDetail.tsx](frontend/src/pages/CustomerDetail.tsx) (Customer is a first-class entity, not just a project field), [Tasks.tsx](frontend/src/pages/Tasks.tsx), [Reports.tsx](frontend/src/pages/Reports.tsx), [Settings.tsx](frontend/src/pages/Settings.tsx), and [Admin.tsx](frontend/src/pages/Admin.tsx) (gated by [AdminGuard.tsx](frontend/src/components/AdminGuard.tsx) — distinct from the auth-only `AuthGuard`). Project pages have nested sub-routes for the four views in [frontend/src/pages/views/](frontend/src/pages/views/): `projects/:id/{list,kanban,gantt,timeline}`. Add new authed pages as siblings; new project sub-views go under `ProjectDetail`.
- **Layout**: [frontend/src/components/layout/](frontend/src/components/layout/) — `Shell` (orchestrator), `Sidebar` (collapsible left rail with `SidebarContext`), `TopBar`, `RightSidebar` (320px glassmorphic project-context panel, slide-toggleable from `ProjectDetail`). The fixed widths from DESIGN.md are encoded as Tailwind tokens `w-sidebar` (260px) and `w-context-panel` (320px) in [frontend/tailwind.config.ts](frontend/tailwind.config.ts).
- **Path alias**: `@/` resolves to `frontend/src/` (configured in both [frontend/vite.config.ts](frontend/vite.config.ts) and [frontend/tsconfig.json](frontend/tsconfig.json)). Use it — don't write deep relative imports.
- **API layer**: [frontend/src/lib/api.ts](frontend/src/lib/api.ts) exposes `apiRequest<T>(path, opts)` which auto-injects the bearer token from `localStorage["solvro.token"]`, JSON-encodes bodies, and throws `ApiError` on non-2xx. The base URL is **computed at runtime** from `window.location` (`<page-protocol>://<page-hostname>:3000`) — there is no `VITE_API_BASE_URL` env var anymore, the bundle works on any address (LAN IP, Tailscale, public DNS, localhost) without rebuilding. The backend must always be reachable on port 3000 of whatever host serves the frontend. **Never call `fetch` directly from a component or hook** — go through `apiRequest`.
- **Server state**: TanStack Query. Every entity has typed hooks in [frontend/src/lib/queries.ts](frontend/src/lib/queries.ts) (`useProjects`, `useProject`, `useTasks`, `useCreateTask`, `useHolidays`, etc.). Add new endpoints by extending this file rather than scattering `useQuery` calls — keys, mutations, and invalidations stay co-located. Mutation hooks must invalidate the relevant query keys.
- **Auth context**: [frontend/src/lib/auth.tsx](frontend/src/lib/auth.tsx) wraps the tree; `AuthGuard` redirects unauthenticated users to `/login`.
- **Tailwind theme**: [frontend/tailwind.config.ts](frontend/tailwind.config.ts) is the runtime port of DESIGN.md frontmatter (M3-style surface tokens, primary `#0058be`, the small radius scale, two font families, `data-mono` and `label-caps` text styles). When introducing new colors/sizes, **add to the theme — don't inline arbitrary hex values in components**.
- **Theme provider**: [frontend/src/lib/theme.tsx](frontend/src/lib/theme.tsx) is the runtime theming layer (light/dark mode toggle, persisted preference) paired with the Tailwind config. Read/write theme through this provider — don't poke `document.documentElement.classList` directly.
- **Custom Gantt, not `gantt-task-react`**: PRD §6 names `gantt-task-react`, but the actual implementation is hand-rolled in [frontend/src/components/gantt/](frontend/src/components/gantt/) + [frontend/src/lib/gantt/](frontend/src/lib/gantt/) (geometry + constants). No `gantt-task-react` dep — don't `npm install` it; extend the existing components instead. This is intentional drift from the PRD.

## Design system essentials

Read [DESIGN.md](DESIGN.md) for the full spec; the non-obvious rules:

- **Tri-panel layout, fixed widths**: 260px sidebar (left, dark slate, recedes) / fluid main canvas (white, high-contrast) / 320px context panel (right, light grey + 12px backdrop blur, glassmorphic). This is rigid — don't collapse the right panel into the main canvas without a reason.
- **Tonal layering, not shadows.** Elevation is expressed via 1px outlines (`#E2E8F0`) and tone shifts. The only shadow is on the floating right panel and modals. Adding drop shadows to cards breaks the "bare-metal" aesthetic.
- **AI Breakdown styling is reserved.** The amber inner-border + glow (`#F59E0B` at ~20% opacity, see `.ai-glow` in the mockup CSS) marks **machine-generated** content only. Don't apply it to ordinary status highlights.
- **Two fonts, distinct roles.** Space Grotesk = headlines, technical labels, sidebar; Inter = body + data. A `data-mono` style (Inter w/ tabular features, 13px, tight line-height, -0.01em tracking) is used for IDs and numerics so columns align — preserve it when rendering tables.
- **Radii are intentionally small.** 0.25rem default; large radii are forbidden (the spec says so explicitly). The mockups override this via their inline Tailwind config — see drift note below.
- **Compact mode for data grids** is a real requirement: 12px font, reduced row height. Build grids with that mode in mind from day one.

### Known design drift (mockups vs. DESIGN.md)

The mockup HTMLs ship a Tailwind CDN config that **does not match** DESIGN.md frontmatter:

- **Primary color**: spec says `#0058be` (also referenced as "Solvro Blue #3B82F6" in the prose — the prose itself is internally inconsistent); mockups use Tailwind's default `blue-600`. The implemented [frontend/tailwind.config.ts](frontend/tailwind.config.ts) follows the spec (`#0058be`).
- **Border radius scale**: spec `DEFAULT: 0.25rem`; mockups override `DEFAULT: 0.125rem`, `lg: 0.25rem`, `xl: 0.5rem`, `full: 0.75rem` — i.e., the entire scale is shifted one step tighter. The implemented Tailwind config follows the spec.
- **Status chip colors** (red/amber/emerald/purple) in mockups come from default Tailwind palettes, not from the spec's tokens.

When porting to real code, **DESIGN.md frontmatter wins** unless the user explicitly says otherwise. If you're asked to "match the mockup," confirm which source they mean.

## Working on this repo

- Edits to [PRD.md](PRD.md) or [DESIGN.md](DESIGN.md) are spec changes — they will cascade into any future implementation. Flag knock-on effects (e.g., changing the radius scale invalidates the mockups' Tailwind config and [frontend/tailwind.config.ts](frontend/tailwind.config.ts)).
- The mockup `code.html` files are standalone (Tailwind CDN, Google Fonts CDN, Material Symbols CDN) — open one in a browser to preview. They are reference assets, not a build target.
- The Secure Ingestion Port (PRD §6) — webhook auth, payload validation, blueprint→tasks fanout — is **not yet implemented**. When the user asks for it, expect a new `/webhook/blueprint` route with a separate auth path (API key / OAuth2) that bypasses `requireAuth` (it must not accept user JWTs) and that creates `Blueprint` + child `Task` rows in a single transaction, preserving the projectId↔blueprint linkage so the frontend's AI Breakdown styling can attach to those tasks.
