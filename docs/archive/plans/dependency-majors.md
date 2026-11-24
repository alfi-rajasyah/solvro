# Dependency majors: Vite 6 and React Router 7

Status: shipped 2026-11-24, branch `chore/vite6-react-router7`. Archive path: `docs/archive/plans/dependency-majors.md`.

Lane P. User decision 2026-11-24: fix ISS-201 and ISS-206 with the major upgrades. One PR into `develop`; each task is one commit. The two tasks both write `frontend/package-lock.json` in the one frontend container, so they run in sequence, not in a wave. The orchestrator is the writer.

## Scope

| Task | Issues | Files |
|---|---|---|
| A. Vite 5 to 6.4.6, vitest 4.1.10 to 4.1.12 | ISS-201 | `frontend/package.json`, `frontend/package-lock.json`, `vite.config.ts` only if a Vite 6 change needs it |
| B. React Router 6 to 7 | ISS-206 | `frontend/package.json`, `frontend/package-lock.json`, `react-router-dom` imports and router setup in `frontend/src` only where v7 needs a change, tests that assert on router behaviour |

`exceljs` (the `uuid` advisory in ISS-206) stays open: npm offers only a downgrade to 3.4.0. `vite-plugin-pwa`'s `glob`/`minimatch`/`workbox-build` advisories (moderate, build-time only) have no forward fix.

## Lock-file notes

npm 10.9's resolver crashes (`edgesOut` in `#loadPeerSet`) on `npm install vitest@4.1.12`, because it walks Vite 8's optional peers (`@vitejs/devtools*` to `vitest@*`). Task A removes vitest, installs Vite 6, then adds vitest with `--legacy-peer-deps` for that one install; Vite and jsdom already satisfy its peers at the root. `npm ci --dry-run` without the flag accepts the result, so CI is unaffected.

## Acceptance

- A: `npm audit` in `frontend/` shows no high advisory; the dev server, `npm run build` (with `sw.js` and the manifest), `check:bundle-size`, typecheck and frontend vitest pass.
- B: `react-router-dom` (or `react-router`) at 7.18+; `npm audit --omit=dev` shows no React Router advisory; every route, redirect, `?task=` link and the login `from` redirect behave as before; typecheck, vitest and the touched e2e specs pass.
- Phase: `gates.sh` green, one phase review, Delivery Gate (smoke click-through of the main routes in both themes).

## Outcome

- A: Vite 6.4.6 and vitest 4.1.12; no high advisory left. Entry chunk 984.16 kB.
- B: `react-router-dom` 7.18.6; no React Router advisory left. The entry chunk went to 1001.03 kB, over budget, so Projects became a lazy page (ISS-175's fix direction): 963.11 kB.
- Left open as watches: ISS-201 (4 moderate under `vite-plugin-pwa`, no forward fix), ISS-206 (`exceljs`/`uuid`, no forward fix).
- Checks: typecheck, lint, frontend vitest 1256/1256, build with `sw.js` and manifest, `gates.sh` all green, no spine files. Desktop e2e: deep-link, not-found, sidebar, projects-list, guest-links, search, project-header pass. `auth.spec.ts` fails locally only because the dev database has Google sign-in enabled; the spec assumes the seeded CI stack without it.
- Phase review: no blockers, no should-fix; 2 docs nits (CHANGELOG vitest peer wording, ISS-175 Verified stamp), both fixed.
- docs-keeper: no trigger fired (no `vite.config.ts`, `index.css` or env change; this plan is archived in the same PR).

## Delivery Gate

PASS, 2026-11-24. Playwright click-through in light and dark at 1440px (desktop) and 390px (the suite's iPhone 13 project): Overview, Projects, `/projects/:id` (redirects to its Overview tab and keeps `?task=`), Kanban with `?task=` (opens the task panel), Tasks, Pipeline, an unknown path (NotFound). No page errors on desktop. Client-side navigation into the now-lazy Projects page shows the route fallback while the chunk loads, then the page with the sidebar highlight on Projects, the same as the other lazy pages. Mobile client-side navigation was not scripted (the sidebar link sits behind the menu); mobile direct loads of every route rendered.
