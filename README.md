# Solvro — Solution-to-Project Lifecycle Engine

Solvro is a project management platform for **Technical Account Managers (TAMs)**. It gives TAMs a single high-density workspace to run customer projects — replacing the usual spread of a task tracker, a notes doc, and a reporting spreadsheet.

## Overview

The core loop Solvro is built around:

1. A TAM logs **daily review notes** per project (internal or customer-facing).
2. Solvro generates a **structured markdown export** per project — health, schedule variance vs. baseline, phase breakdown, task signals, open risks, and the last 14 days of customer-facing notes.
3. The TAM drops that packet into their AI tool of choice and sends the summary to the customer.

Everything else — Kanban, Gantt, risks, portfolio roll-ups — exists to feed that loop with accurate data.

## Features

- **Project dashboard** — per-project Overview, List, Kanban, Gantt, Timeline, Risks, and Services views.
- **Kanban board** — drag-and-drop task management (dnd-kit) with per-column WIP limits.
- **Gantt chart** — hand-rolled, dependency arrows (hard/soft), milestones, unlimited subtask nesting, baseline lock for planned-vs-actual deviation, and Excel/PDF export.
- **Timeline view** — phase-level linear visualization, distinct from the task-level Gantt.
- **Daily Review** — dated project notes with `INTERNAL` / `CUSTOMER_FACING` visibility; internal notes never leak into exports.
- **Reports** — one-click export packet per project (copy to clipboard or `.md` download), designed to be pasted into an external AI for customer summaries.
- **Executive dashboard** — org-wide portfolio roll-up, gated behind its own permission.
- **Risk register** — project-scoped risks with category, probability × impact scoring, and mitigation status.
- **Customers & services** — customer directory with service assignments at both the customer and project level.
- **RBAC** — permission-based access control with admin-managed custom roles; built-in ADMIN, SA, TAM, STAKEHOLDER, and PENDING roles.
- **Authentication** — email/password (JWT) plus Google sign-in with an admin-managed domain allowlist; unknown Google users are auto-provisioned into a zero-permission PENDING role until promoted.
- **PWA & mobile** — installable, responsive down to 375 px (Gantt is desktop-only with a list fallback on phones).
- **Dark-first UI** — "Technical Precision" design system: charcoal surfaces, Elitery Green accent, light mode included.

## Roadmap

- **Utilization view** — iTop (ITSM) API integration for workload reporting.

## Architecture

Three tiers, one Docker network:

```
┌──────────────────────────┐    ┌─────────────────────────┐    ┌────────────────────────┐
│ Frontend                 │    │ Backend                 │    │ Database               │
│ React SPA (Vite dev /    │───▶│ Express + Prisma (TS)   │───▶│ PostgreSQL 15          │
│ nginx in prod)           │    │ REST, JWT, Zod, pino    │    │                        │
└──────────────────────────┘    └─────────────────────────┘    └────────────────────────┘
```

The frontend never calls the backend directly — it always requests same-origin `/api/*`, which is reverse-proxied to the backend by the Vite dev server in development and by nginx in production. This keeps the compiled bundle free of runtime configuration and lets it sit behind any TLS terminator or tunnel unchanged.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, React Router, dnd-kit, Recharts |
| Backend | Node.js 20, Express, TypeScript, Prisma ORM, Zod validation, JWT + Google OAuth, pino |
| Database | PostgreSQL 15 |
| Testing | Vitest (backend), Playwright (e2e, desktop + mobile viewports) |
| CI/CD | GitHub Actions — backend suite + Playwright e2e on every PR; images published to GHCR on pushes to `main` |
| Deployment | Docker Compose, prebuilt GHCR images, one-shot `setup.sh` installer |

## Getting Started

### Production deployment

On a server with Docker Engine and the Docker Compose plugin:

```bash
bash <(curl -sSL https://raw.githubusercontent.com/alfi-rajasyah/solvro/main/setup.sh)
```

The script prompts for an admin email/password and host ports (website defaults to `80`, API to `3000`, bound to `127.0.0.1` unless you say otherwise), generates secrets, writes `~/solvro/{docker-compose.yml,.env}`, pulls the GHCR images, and starts the stack. Re-running it on an existing install pulls new images and restarts without re-prompting.

### Local development

Prerequisites: Node.js 20+, PostgreSQL 15 (a local instance or a `postgres:15-alpine` container).

```bash
# Backend
cd backend
cp .env.example .env          # set DATABASE_URL; add a 32+ char JWT_SECRET
npm install
npx prisma migrate dev        # apply migrations
npm run db:seed               # seed built-in roles (no default users)
npm run dev                   # API on http://localhost:3000

# Frontend (second terminal)
cd frontend
npm install
npm run dev                   # app on http://localhost:5173, /api proxied to :3000
```

Create the first admin (the seed creates roles only — there is no default login):

```bash
cd backend
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=change-me npm run admin:create
```

### Tests

```bash
cd backend && npm test        # Vitest
cd frontend && npm run typecheck
cd e2e && npm test            # Playwright (desktop + mobile projects)
```

## Repository Layout

| Path | Contents |
|---|---|
| `backend/` | Express API, Prisma schema & migrations, seed and admin scripts |
| `frontend/` | React SPA, Tailwind theme, hand-rolled Gantt, export layer |
| `e2e/` | Playwright suite (auth, Kanban drag-and-drop, PWA, smoke) |
| `ci/` | CI compose stack used by GitHub Actions |
| `setup.sh` | One-shot production installer / updater |
| `CHANGELOG.md` | Running record of changes |
