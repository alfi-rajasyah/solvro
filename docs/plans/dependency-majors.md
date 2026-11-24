# Dependency majors: Vite 6 and React Router 7

Status: in progress, branch `chore/vite6-react-router7`. Archive path: `docs/archive/plans/dependency-majors.md`.

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

## Delivery Gate

Pending.
