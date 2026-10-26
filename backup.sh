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
#   POSTGRES_USER / POSTGRES_DB   default "solvro" / "solvro", matching the
#                   compose file setup.sh writes; read from .env when set there.
#
# Dumps are custom-format (-Fc) files named solvro-YYYY-MM-DDTHHMMSS.dump,
# mode 600 in a mode 700 directory. A dump is written under a temporary name
# and renamed only when pg_dump succeeded, so a failed run leaves no truncated
# file. Retention only touches files matching that exact name pattern.
# The database password is never read or printed: pg_dump runs inside the
# postgres container over its local socket.
#
# Restore: see "Restore drill" in docs/CONFIGURATION.md.

set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-$HOME/solvro}"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.yml"
ENV_FILE="$DEPLOY_DIR/.env"
BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

if [[ "${1:-}" == "--print-cron" ]]; then
  script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
  echo "# Solvro database backup, daily at 02:17 (add with: crontab -e)"
  echo "17 2 * * * DEPLOY_DIR=$DEPLOY_DIR bash $script >> $BACKUP_DIR/backup.log 2>&1"
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

# Read one KEY from .env without sourcing the file (it holds secrets and is
# only trusted to be KEY=value lines). Prints nothing when absent.
env_value() {
  local line
  line="$(grep -m1 "^$1=" "$ENV_FILE" 2>/dev/null || true)"
  line="${line#*=}"
  line="${line%\"}"
  printf '%s' "${line#\"}"
}

PG_USER="${POSTGRES_USER:-$(env_value POSTGRES_USER)}"
PG_DB="${POSTGRES_DB:-$(env_value POSTGRES_DB)}"
PG_USER="${PG_USER:-solvro}"
PG_DB="${PG_DB:-solvro}"

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

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

# Retention: only our own dump names, only older than RETENTION_DAYS.
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'solvro-????-??-??T??????.dump' \
  -mtime "+$RETENTION_DAYS" -print -delete | sed 's/^/Pruned: /'
