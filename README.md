# Solvro — Solution-to-Project Lifecycle Engine

Solvro is a project management platform for **Technical Account Managers (TAMs)** and **Solution Architects (SAs)**. It covers the full solution-to-project lifecycle in one high-density workspace — replacing a task tracker, a notes doc, and a standalone opportunity tracker.

## Overview

The lifecycle Solvro is built around:

1. An SA tracks an **opportunity** through the sales pipeline — nine stages from Assessment to Won (or Drop/Hold) on a drag-and-drop board.
2. A **won deal hands off** in one step: Solvro creates the delivery project from the deal, pre-filled and linked both ways.
3. A TAM runs the delivery — Kanban, Gantt, risks, **daily review notes** per project (internal or customer-facing) — with portfolio and pipeline roll-ups for leadership.

## Features

- **Project dashboard** — per-project Overview, List, Kanban, Gantt, Timeline, Risks, and Services views.
- **Kanban board** — drag-and-drop task management (dnd-kit) with per-column WIP limits.
- **Gantt chart** — hand-rolled, dependency arrows (hard/soft), milestones, unlimited subtask nesting, baseline lock for planned-vs-actual deviation, and Excel/PDF export.
- **Timeline view** — phase-level linear visualization, distinct from the task-level Gantt.
- **Pipeline board** (`/pipeline`) — nine-stage opportunity Kanban with permission-gated drag, Won/Drop confirmations, per-column value sums, and a KPI bar; plus sortable List, PIC-by-stage Swimlane, and request-date Quarter views behind one switcher.
- **Opportunity detail** — stage menu, reference links, an activity timeline with notes, and edit/delete gated by ownership; a won deal offers "Create project" on the spot.
- **Excel/CSV import** — three-step dialog (template download, per-row validation preview, per-row results) with an Admin tab listing every import run.
- **Pipeline analytics** — an Overview panel plus Executive fold-ins: conversion funnel, PIC leaderboard and performance table, 12-month trend, and a workload heatmap with per-PIC drill-down.
- **Daily Review** — dated project notes with `INTERNAL` / `CUSTOMER_FACING` visibility; internal notes never leave the app.
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
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, React Router, dnd-kit, Recharts, xlsx (lazy-loaded, import dialog only) |
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
| `frontend/` | React SPA, Tailwind theme, hand-rolled Gantt, Pipeline board & analytics |
| `e2e/` | Playwright suite (auth, Kanban & Pipeline drag-and-drop, forms, import, PWA, smoke) |
| `ci/` | CI compose stack used by GitHub Actions |
| `setup.sh` | One-shot production installer / updater |
| `CHANGELOG.md` | Running record of changes |
