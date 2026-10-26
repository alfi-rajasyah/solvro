#!/usr/bin/env bash
# Solvro database backup: a consistent pg_dump of the running stack, with
# retention (docs/archive/plans/application-review-2026-10-22.md, N-02).
#
#   bash backup.sh               dump now, then prune old dumps
#   bash backup.sh --print-cron  print a suggested crontab line (installs nothing)
#
# Reads the deploy directory the way setup.sh does (~/solvro, docker-compose.yml
# and .env inside it). Settings, all optional:
#   DEPLOY_DIR      where setup.sh installed the stack   (default ~/solvro)
#   BACKUP_DIR      where dumps go                       (default $DEPLOY_DIR/backups)
#   RETENTION_DAYS  delete our dumps older than this     (default 14)
# The database role and name are fixed at solvro/solvro, as in the compose
# file setup.sh writes; .env is not read.
#
# Dumps are custom-format (-Fc) files named solvro-YYYY-MM-DDTHHMMSS.dump,
# mode 600 in a mode 700 directory. A dump is written under a temporary name
# and renamed only when pg_dump succeeded, so a failed run leaves no truncated
# file. Retention only touches files matching that exact name pattern.
# The database password is never read or printed: pg_dump runs inside the
# postgres container over its local socket.
#
# Restore: see the "Restore drill" paragraph in docs/CONFIGURATION.md section 2.13.

set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-$HOME/solvro}"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.yml"
BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

if [[ "${1:-}" == "--print-cron" ]]; then
  # A crontab entry must point at a real file: under `bash <(curl ...)` the
  # script is a pipe (/dev/fd/N) that is gone when the job fires.
  script="${BASH_SOURCE[0]}"
  if [[ ! -f "$script" ]]; then
    echo "ERROR: --print-cron needs backup.sh saved as a file (this run reads '$script')." >&2
    echo "       Save it first: curl -sSL <raw url of backup.sh> -o \"$DEPLOY_DIR/backup.sh\"" >&2
    exit 1
  fi
  script="$(cd "$(dirname "$script")" && pwd)/$(basename "$script")"
  line="$(printf '17 2 * * * DEPLOY_DIR=%q BACKUP_DIR=%q RETENTION_DAYS=%q bash %q >> %q 2>&1' \
    "$DEPLOY_DIR" "$BACKUP_DIR" "$RETENTION_DAYS" "$script" "$DEPLOY_DIR/backup.log")"
  echo "# Solvro database backup, daily at 02:17 (add with: crontab -e)"
  # `%` starts stdin data in a crontab and must be escaped.
  echo "${line//%/\\%}"
  exit 0
fi
if [[ $# -gt 0 ]]; then
  echo "Usage: bash backup.sh [--print-cron]" >&2
  exit 2
fi

[[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || {
  echo "ERROR: RETENTION_DAYS must be a non-negative integer (got '$RETENTION_DAYS')." >&2
  exit 1
}
command -v docker >/dev/null 2>&1 || {
  echo "ERROR: Docker is not installed." >&2
  exit 1
}
[[ -f "$COMPOSE_FILE" ]] || {
  echo "ERROR: $COMPOSE_FILE not found. Run setup.sh first, or set DEPLOY_DIR." >&2
  exit 1
}

PG_USER=solvro
PG_DB=solvro

umask 077
if [[ -d "$BACKUP_DIR" ]]; then
  # Never re-mode a directory the operator chose; just say so when it is open.
  if [[ -n "$(find "$BACKUP_DIR" -maxdepth 0 -perm /077)" ]]; then
    echo "WARNING: $BACKUP_DIR is accessible to group/others; dumps hold all data (files are 600). Consider chmod 700." >&2
  fi
else
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
fi

stamp="$(date +%Y-%m-%dT%H%M%S)"
final="$BACKUP_DIR/solvro-$stamp.dump"
partial="$BACKUP_DIR/.solvro-$stamp.dump.partial"
trap 'rm -f "$partial"' EXIT

if ! docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$PG_USER" -Fc "$PG_DB" > "$partial"; then
  echo "ERROR: pg_dump failed; no backup was written." >&2
  exit 1
fi
if [[ ! -s "$partial" ]]; then
  echo "ERROR: pg_dump produced an empty file; no backup was written." >&2
  exit 1
fi
chmod 600 "$partial"
mv "$partial" "$final"
echo "Backup written: $final ($(wc -c < "$final") bytes)"

# Leftovers of a run that was killed mid-dump (the EXIT trap could not fire).
find "$BACKUP_DIR" -maxdepth 1 -type f -name '.solvro-*.dump.partial' -mmin +60 -delete

# Retention: only our own dump names, only older than RETENTION_DAYS.
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'solvro-????-??-??T??????.dump' \
  -mtime "+$RETENTION_DAYS" -print -delete | sed 's/^/Pruned: /'
