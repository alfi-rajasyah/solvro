// Regression test for the data-loss guard in setup.sh (docs/archive/plans/application-review-2026-10-22.md, F-01,
// 2026-10-22): a fresh-install run — no ~/solvro/.env — used to run
// `docker volume rm solvro_pgdata` unconditionally. With the volume global
// to the Docker host and .env per user, a run as a different user or after
// a lost .env deleted a live database with no question asked.
//
// The script is driven end to end with `docker` and `curl` replaced by
// logging shims on PATH, so no container, network or terminal is needed.
// Every prompt is answered through env vars (setup.sh skips `read` when a
// value is already set), which keeps the run non-interactive.
import "./env.js";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SETUP_SH = new URL("../../setup.sh", import.meta.url).pathname;
// The dev backend container bind-mounts ./backend only, so inside it the
// repo-root script is absent (gates.sh runs the suite there). CI and host
// runs see the whole checkout and exercise the cases.
const HAS_SETUP_SH = existsSync(SETUP_SH);

interface Run {
  status: number | null;
  stdout: string;
  dockerCalls: string[];
  envWritten: boolean;
}

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

// The admin password handed to the script never reaches a real system — the
// docker shim swallows it. It is assembled at run time, away from the
// `ADMIN_PASSWORD:` line, so secret scanning finds no password-shaped
// literal to flag.
function throwawayAdminSecret(): string {
  return ["shim", process.pid, Date.now().toString(36)].join("-");
}

function runSetup(opts: {
  volumeExists: boolean;
  extraEnv?: Record<string, string>;
  // Env vars to leave unset (the default for POSTGRES_PORT, for instance).
  omitEnv?: string[];
  // Run under setsid: a new session has no controlling terminal, so opening
  // /dev/tty fails — the situation of cron, CI and `ssh host 'bash setup.sh'`.
  noTty?: boolean;
}): Run {
  const root = mkdtempSync(join(tmpdir(), "solvro-setup-sh-"));
  dirs.push(root);
  const bin = join(root, "bin");
  const home = join(root, "home");
  mkdirSync(bin);
  mkdirSync(home);
  const log = join(root, "docker.log");
  writeFileSync(log, "");

  // `docker volume inspect <name>` is the only call whose exit code the
  // script branches on; everything else succeeds silently.
  writeFileSync(
    join(bin, "docker"),
    [
      "#!/usr/bin/env bash",
      `printf '%s\\n' "$*" >> "${log}"`,
      'if [[ "$1 $2" == "volume inspect" ]]; then',
      `  exit ${opts.volumeExists ? 0 : 1}`,
      "fi",
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  writeFileSync(
    join(bin, "curl"),
    ["#!/usr/bin/env bash", 'echo \'{"status":"ok"}\'', "exit 0", ""].join("\n"),
    { mode: 0o755 },
  );

  const env: Record<string, string> = {
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    HOME: home,
    ADMIN_EMAIL: "ops@example.com",
    ADMIN_PASSWORD: throwawayAdminSecret(),
    FRONTEND_PORT: "80",
    BACKEND_PORT: "3000",
    POSTGRES_PORT: "5432",
    BIND_ADDR: "127.0.0.1",
    ...(opts.extraEnv ?? {}),
  };
  for (const k of opts.omitEnv ?? []) delete env[k];

  const result = spawnSync(opts.noTty ? "setsid" : "bash", opts.noTty ? ["-w", "bash", SETUP_SH] : [SETUP_SH], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000,
    env,
  });

  return {
    status: result.status,
    stdout: `${result.stdout}${result.stderr}`,
    dockerCalls: readFileSync(log, "utf8").split("\n").filter(Boolean),
    envWritten: existsSync(join(home, "solvro", ".env")),
  };
}

describe.skipIf(!HAS_SETUP_SH)("setup.sh fresh-install data-loss guard (F-01)", () => {
  it("wipes the volume on a genuinely fresh host (no volume yet)", () => {
    const run = runSetup({ volumeExists: false });
    expect(run.status).toBe(0);
    expect(run.dockerCalls).toContain("volume rm solvro_pgdata");
    expect(run.envWritten).toBe(true);
  });

  it("refuses when the volume exists and .env is missing — nothing written, nothing removed", () => {
    const run = runSetup({ volumeExists: true });
    // The backup hint must work with nothing installed: no backup.sh, no compose file.
    expect(run.stdout).toContain("docker exec solvro-postgres pg_dump -U solvro -Fc solvro");
    expect(run.stdout).not.toContain("bash backup.sh");
    expect(run.status).toBe(1);
    expect(run.stdout).toMatch(/already exists/);
    expect(run.stdout).toMatch(/FORCE_WIPE=1/);
    expect(run.dockerCalls).not.toContain("volume rm solvro_pgdata");
    expect(run.dockerCalls.some((c) => c.startsWith("compose down"))).toBe(false);
    expect(run.envWritten).toBe(false);
  });

  it("wipes the existing volume only with FORCE_WIPE=1", () => {
    const run = runSetup({ volumeExists: true, extraEnv: { FORCE_WIPE: "1" } });
    expect(run.status).toBe(0);
    expect(run.dockerCalls).toContain("volume rm solvro_pgdata");
    expect(run.envWritten).toBe(true);
  });
});

// docs/archive/plans/application-review-2026-10-22.md, N-03: `[[ -r /dev/tty ]]`
// is true even with no controlling terminal, so the optional port prompts
// tried to open it and `set -e` aborted a run whose env vars covered
// everything required. POSTGRES_PORT is unset by default (database stays
// private), which is what reached the prompt.
describe.skipIf(!HAS_SETUP_SH)("setup.sh without a terminal (N-03)", () => {
  it("installs non-interactively when the required env vars are set and POSTGRES_PORT is not", () => {
    const run = runSetup({ volumeExists: false, noTty: true, omitEnv: ["POSTGRES_PORT"] });
    expect(run.stdout).not.toMatch(/Postgres host port/);
    expect(run.status).toBe(0);
    expect(run.envWritten).toBe(true);
    expect(run.dockerCalls.some((c) => c.startsWith("compose up"))).toBe(true);
  });

  it("without ADMIN_EMAIL / ADMIN_PASSWORD and no terminal, fails with the clear error", () => {
    const run = runSetup({
      volumeExists: false,
      noTty: true,
      omitEnv: ["ADMIN_EMAIL", "ADMIN_PASSWORD"],
    });
    expect(run.status).toBe(1);
    expect(run.stdout).toMatch(/no \/dev\/tty available and ADMIN_EMAIL\/ADMIN_PASSWORD not set/);
    expect(run.envWritten).toBe(false);
  });

  it("have_tty works in POSIX mode too (true, not the special builtin ':')", () => {
    const run = runSetup({
      volumeExists: false,
      noTty: true,
      omitEnv: ["POSTGRES_PORT"],
      extraEnv: { POSIXLY_CORRECT: "1" },
    });
    expect(run.status).toBe(0);
  });
});
