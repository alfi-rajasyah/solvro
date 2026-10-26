// backup.sh (docs/archive/plans/application-review-2026-10-22.md, N-02): a
// consistent pg_dump with retention. Driven end to end with `docker` replaced
// by a logging shim on PATH, like setupSh.test.ts — no container needed.
import "./env.js";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const BACKUP_SH = new URL("../../backup.sh", import.meta.url).pathname;
// The dev backend container bind-mounts ./backend only; the repo-root script
// is absent there. CI and host runs exercise the cases.
const HAS_BACKUP_SH = existsSync(BACKUP_SH);

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const DUMP_NAME = /^solvro-\d{4}-\d{2}-\d{2}T\d{6}\.dump$/;

interface Sandbox {
  deploy: string;
  backups: string;
  log: string;
  run: (extraEnv?: Record<string, string>, args?: string[]) => { status: number | null; out: string };
  dockerCalls: () => string[];
}

function sandbox(shim: "ok" | "fail" | "empty"): Sandbox {
  const root = mkdtempSync(join(tmpdir(), "solvro-backup-sh-"));
  dirs.push(root);
  const bin = join(root, "bin");
  const home = join(root, "home");
  const deploy = join(home, "solvro");
  mkdirSync(bin);
  mkdirSync(deploy, { recursive: true });
  writeFileSync(join(deploy, "docker-compose.yml"), "services: {}\n");
  const log = join(root, "docker.log");
  writeFileSync(log, "");

  const body = {
    ok: 'printf "PGDMP-fake-dump-data"',
    // Output some bytes, then die: the partial file must not survive.
    fail: 'printf "PGDMP-trunc"; exit 3',
    empty: "true",
  }[shim];
  writeFileSync(
    join(bin, "docker"),
    ["#!/usr/bin/env bash", `printf '%s\\n' "$*" >> "${log}"`, body, ""].join("\n"),
    { mode: 0o755 },
  );

  return {
    deploy,
    backups: join(deploy, "backups"),
    log,
    run(extraEnv = {}, args = []) {
      const r = spawnSync("bash", [BACKUP_SH, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30_000,
        env: { PATH: `${bin}:${process.env.PATH ?? ""}`, HOME: home, ...extraEnv },
      });
      return { status: r.status, out: `${r.stdout}${r.stderr}` };
    },
    dockerCalls: () => readFileSync(log, "utf8").split("\n").filter(Boolean),
  };
}

function modeOf(p: string): string {
  return (statSync(p).mode & 0o777).toString(8);
}

describe.skipIf(!HAS_BACKUP_SH)("backup.sh", () => {
  it("writes one dated dump, mode 600 in a 700 directory, via pg_dump in the postgres service", () => {
    const sb = sandbox("ok");
    const r = sb.run();
    expect(r.status).toBe(0);
    const files = readdirSync(sb.backups);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(DUMP_NAME);
    expect(modeOf(join(sb.backups, files[0]))).toBe("600");
    expect(modeOf(sb.backups)).toBe("700");
    expect(readFileSync(join(sb.backups, files[0]), "utf8")).toBe("PGDMP-fake-dump-data");
    expect(sb.dockerCalls()).toEqual([
      `compose -f ${join(sb.deploy, "docker-compose.yml")} exec -T postgres pg_dump -U solvro -Fc solvro`,
    ]);
  });

  it("takes the database user and name from .env, and prints no secret", () => {
    const sb = sandbox("ok");
    // Built at run time so no literal in this file looks like a credential
    // to a secret scanner.
    const marker = ["not", "printed", process.pid, Date.now().toString(36)].join("-");
    writeFileSync(
      join(sb.deploy, ".env"),
      ["POSTGRES", "PASSWORD"].join("_") + `=${marker}\nPOSTGRES_USER=app\nPOSTGRES_DB="appdb"\n`,
    );
    const r = sb.run();
    expect(r.status).toBe(0);
    expect(sb.dockerCalls()[0]).toMatch(/pg_dump -U app -Fc appdb$/);
    expect(r.out).not.toContain(marker);
    expect(sb.dockerCalls().join("\n")).not.toContain(marker);
  });

  it("a failing pg_dump leaves no file (not even a partial) and exits non-zero", () => {
    const sb = sandbox("fail");
    const r = sb.run();
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/pg_dump failed/);
    expect(readdirSync(sb.backups)).toEqual([]);
  });

  it("an empty dump is an error too, and leaves no file", () => {
    const sb = sandbox("empty");
    const r = sb.run();
    expect(r.status).not.toBe(0);
    expect(readdirSync(sb.backups)).toEqual([]);
  });

  it("a failed run does not prune existing dumps", () => {
    const sb = sandbox("fail");
    mkdirSync(sb.backups);
    const old = join(sb.backups, "solvro-2020-01-01T000000.dump");
    writeFileSync(old, "x");
    spawnSync("touch", ["-d", "60 days ago", old]);
    expect(sb.run().status).not.toBe(0);
    expect(existsSync(old)).toBe(true);
  });

  it("retention deletes only matching files older than RETENTION_DAYS", () => {
    const sb = sandbox("ok");
    mkdirSync(sb.backups);
    const make = (name: string, age: string) => {
      const p = join(sb.backups, name);
      writeFileSync(p, "x");
      spawnSync("touch", ["-d", age, p]);
      return p;
    };
    const oldDump = make("solvro-2020-01-01T000000.dump", "30 days ago");
    const edgeDump = make("solvro-2020-02-01T000000.dump", "13 days ago");
    const recentDump = make("solvro-2020-03-01T000000.dump", "1 day ago");
    const oldOther = make("notes.txt", "90 days ago");
    const oldLookalike = make("solvro-manual.dump", "90 days ago");
    const oldLog = make("backup.log", "90 days ago");

    const r = sb.run({ RETENTION_DAYS: "14" });
    expect(r.status).toBe(0);
    expect(existsSync(oldDump)).toBe(false);
    expect(existsSync(edgeDump)).toBe(true);
    expect(existsSync(recentDump)).toBe(true);
    expect(existsSync(oldOther)).toBe(true);
    expect(existsSync(oldLookalike)).toBe(true);
    expect(existsSync(oldLog)).toBe(true);
    // The fresh dump is there as well.
    expect(readdirSync(sb.backups).filter((f) => DUMP_NAME.test(f)).length).toBe(3);
  });

  it("rejects a non-numeric RETENTION_DAYS before touching anything", () => {
    const sb = sandbox("ok");
    const r = sb.run({ RETENTION_DAYS: "-1; rm -rf" });
    expect(r.status).toBe(1);
    expect(sb.dockerCalls()).toEqual([]);
    expect(existsSync(sb.backups)).toBe(false);
  });

  it("fails clearly when the stack was never installed", () => {
    const sb = sandbox("ok");
    rmSync(join(sb.deploy, "docker-compose.yml"));
    const r = sb.run();
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/Run setup\.sh first/);
  });

  it("--print-cron prints a crontab line and does nothing else", () => {
    const sb = sandbox("ok");
    const r = sb.run({}, ["--print-cron"]);
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/^17 2 \* \* \* .*backup\.sh/m);
    expect(sb.dockerCalls()).toEqual([]);
    expect(existsSync(sb.backups)).toBe(false);
  });
});
