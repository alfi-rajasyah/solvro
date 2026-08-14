#!/usr/bin/env bash
# Solvro one-shot deploy script.
#
# First run on a fresh server:
#   - Prompts for an admin email + password
#   - Prompts for the host ports (website / API / optional Postgres), each
#     with a default you can accept by pressing Enter
#   - Generates random POSTGRES_PASSWORD, JWT_SECRET, CRON_SECRET and
#     VELORA_DB_PASSWORD
#   - Writes ~/solvro/{docker-compose.yml,.env}
#   - Wipes any prior solvro_pgdata AND velora_uploads volumes (clears
#     stale postgres + Velora state — a fresh install destroys the
#     `velora` database and any uploaded Velora files too, not just
#     Solvro's own data)
#   - Brings the stack up (incl. Velora) and creates the admin user
#
# Re-runs on a server that already has ~/solvro/.env:
#   - Detects existing install, skips prompts
#   - Backfills CRON_SECRET / VELORA_DB_PASSWORD / SECURE_COOKIE /
#     VELORA_PORT / VELORA_IMAGE if they predate the Velora integration
#   - Reuses the ports from ~/solvro/.env, pulls new images, restarts
#
# Host binding + ports (set as env vars or answer the prompts):
#   BIND_ADDR       interface   (default 127.0.0.1 = local-only: reach it
#                                from the server or an SSH tunnel only.
#                                0.0.0.0 = all interfaces / on the network;
#                                or a specific LAN IP. Applies to website +
#                                API; Postgres always stays on 127.0.0.1.)
#   FRONTEND_PORT   website     (default 80)
#   BACKEND_PORT    API         (default 3000)
#   POSTGRES_PORT   database    (default: NOT published — stays private)
# To change BIND_ADDR / frontend / backend later, edit ~/solvro/.env and
# `docker compose up -d`. Changing whether/where Postgres is published
# requires re-running this script.
#
# Velora (Pipeline) integration:
#   - Adds `velora-app` (SA opportunity tracker, reachable at
#     127.0.0.1:${VELORA_PORT:-3001} — nginx proxies it publicly at
#     /pipeline-api) and `velora-cron` (auto-hold job only) to the stack,
#     backed by a second logical database (`velora`, owned by its own
#     `velora` Postgres role) on the SAME Postgres server/volume as
#     Solvro — there is no separate Velora db container.
#   - VELORA_IMAGE  image override, default the GitLab registry image
#                   below (persisted into ~/solvro/.env so the default
#                   lives in one place). Pulling the default requires
#                   this host to be logged in:
#                   `docker login registry.gitlab.com`.
#   - VELORA_PORT   host port for velora-app, always loopback-bound
#                   regardless of BIND_ADDR (default 3001).
#   - CRON_SECRET, VELORA_DB_PASSWORD  generated alongside
#                   POSTGRES_PASSWORD/JWT_SECRET on fresh installs;
#                   backfilled into ~/solvro/.env on re-run if an older
#                   install predates them.
#   - SECURE_COOKIE default `false` (this stack is plain HTTP behind
#                   nginx) — set `SECURE_COOKIE=true` once TLS terminates
#                   in front of Velora's cookie, or SAs get silently
#                   logged out on every request.
#   - JWT_SECRET is shared as-is into Velora's env (same value, one
#     signer for both apps).
#   - SKIP_VELORA=1 skips the Velora image pull/pull-check and omits
#                   velora-app/velora-cron/velora_uploads from the
#                   generated compose entirely — for hosts without
#                   GitLab registry access. Persisted into ~/solvro/.env
#                   once set, so later plain re-runs keep skipping it;
#                   edit ~/solvro/.env by hand to re-enable.
#
# One-off data move from a standalone Velora install (old `/opt/velora`
# stack, Postgres 16, db `optracker`) into this shared server (Postgres
# 15) — a MAJOR VERSION difference, so it must be a plain-format SQL dump,
# never a custom-format dump. Run once, manually, after this script has
# created the `velora` database (the final success message points back
# here). Before cutover, also inventory `/opt/velora/.env.local` and
# carry over any non-notification-related vars it sets beyond what this
# script already generates (JWT_SECRET/CRON_SECRET/SECURE_COOKIE/
# DATABASE_URL) — Telegram/Google Chat notification vars stay OFF, per
# the v1 decision to ship without external notifications.
#   docker compose -f /opt/velora/docker-compose.prod.yml exec -T db \
#     pg_dump -U optracker --no-owner --no-privileges optracker \
#     | docker compose exec -T postgres psql -U solvro -d velora
#
# Requirements: Docker Engine + Docker Compose plugin already installed.

set -euo pipefail

DEPLOY_DIR="$HOME/solvro"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.yml"
ENV_FILE="$DEPLOY_DIR/.env"
VOLUME_NAME="solvro_pgdata"
VELORA_UPLOADS_VOLUME="solvro_velora_uploads"
VELORA_IMAGE="${VELORA_IMAGE:-registry.gitlab.com/owiowibdw/opportunity-tracker:latest}"
SKIP_VELORA="${SKIP_VELORA:-}"

# ------------------------------------------------------------------ checks
command -v docker >/dev/null 2>&1 || {
  echo "ERROR: Docker is not installed. Install it first: https://docs.docker.com/engine/install/"
  exit 1
}
docker compose version >/dev/null 2>&1 || {
  echo "ERROR: Docker Compose plugin missing. Install docker-compose-plugin."
  exit 1
}
command -v openssl >/dev/null 2>&1 || {
  echo "ERROR: openssl is required to generate secrets."
  exit 1
}

mkdir -p "$DEPLOY_DIR"
cd "$DEPLOY_DIR"

# ------------------------------------------------------------------ helpers

# Valid TCP port: integer 1-65535. 10# forces base-10 so leading zeros
# (e.g. "08") don't get misread as octal.
is_port() {
  [[ "$1" =~ ^[0-9]+$ ]] && (( 10#$1 >= 1 && 10#$1 <= 65535 ))
}

# Valid IPv4 dotted-quad, each octet 0-255. Rejects hostnames / IPv6.
is_ipv4() {
  [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1
  local IFS=. octet
  for octet in $1; do
    (( 10#$octet >= 0 && 10#$octet <= 255 )) || return 1
  done
  return 0
}

# Appends NAME=VALUE to $ENV_FILE only if NAME isn't already defined there
# — used to backfill vars/secrets introduced after a server's first
# install, without ever touching a value the operator (or an earlier run)
# already persisted.
backfill_env() {
  local name="$1" value="$2"
  grep -q "^${name}=" "$ENV_FILE" 2>/dev/null && return 0
  echo "${name}=${value}" >> "$ENV_FILE"
}

# URL for the success/update message, from BIND_ADDR + FRONTEND_PORT.
# 127.0.0.1 -> localhost (loopback only); 0.0.0.0 -> the server's primary
# IP (reachable on the network); a specific IP -> that IP. The :port
# suffix is dropped when the website is on 80.
app_url() {
  local host
  case "${BIND_ADDR:-127.0.0.1}" in
    127.0.0.1) host="localhost" ;;
    0.0.0.0)
      host="$(hostname -I 2>/dev/null | awk '{print $1}')"
      [[ -z "$host" ]] && host="<server-ip>"
      ;;
    *) host="${BIND_ADDR}" ;;
  esac
  if [[ "${FRONTEND_PORT:-80}" == "80" ]]; then
    echo "http://${host}"
  else
    echo "http://${host}:${FRONTEND_PORT}"
  fi
}

# Writes ~/solvro/docker-compose.yml from the current BIND_ADDR /
# FRONTEND_PORT / BACKEND_PORT / POSTGRES_PORT. Bind address + frontend/
# backend ports stay as literal ${VAR:-default} so docker compose resolves
# them from ~/solvro/.env at `up` time (same mechanism as
# ${POSTGRES_PASSWORD}/${JWT_SECRET}). The postgres `ports:` block can't be
# expressed by interpolation (a key must be present or absent), so it's
# emitted here only when POSTGRES_PORT is set — and it stays bound to
# 127.0.0.1 regardless of BIND_ADDR (never expose the DB on the network
# just because the web app is exposed).
write_compose_file() {
  {
    cat <<'COMPOSE_HEAD'
services:
  postgres:
    image: postgres:15-alpine
    container_name: solvro-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: solvro
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: solvro
    volumes:
      - solvro_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U solvro -d solvro"]
      interval: 5s
      timeout: 5s
      retries: 10
COMPOSE_HEAD

    if [[ -n "${POSTGRES_PORT:-}" ]]; then
      printf '    ports:\n      - "127.0.0.1:%s:5432"\n' "$POSTGRES_PORT"
    fi

    cat <<'COMPOSE_REST'

  backend:
    image: ghcr.io/alfi-rajasyah/solvro-backend:latest
    container_name: solvro-backend
    restart: unless-stopped
    pull_policy: always
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: postgresql://solvro:${POSTGRES_PASSWORD}@postgres:5432/solvro?schema=public
      JWT_SECRET: ${JWT_SECRET}
      JWT_EXPIRES_IN: 8h
      CORS_ORIGIN: "*"
      LOG_LEVEL: info
    ports:
      - "${BIND_ADDR:-127.0.0.1}:${BACKEND_PORT:-3000}:3000"
    command: >
      sh -c "npx prisma migrate deploy && npx prisma db seed && node dist/index.js"

  frontend:
    image: ghcr.io/alfi-rajasyah/solvro-frontend:latest
    container_name: solvro-frontend
    restart: unless-stopped
    pull_policy: always
    depends_on:
      - backend
    ports:
      - "${BIND_ADDR:-127.0.0.1}:${FRONTEND_PORT:-80}:80"
COMPOSE_REST

    # velora-app / velora-cron are omitted entirely when SKIP_VELORA is
    # set (hosts without GitLab registry access) — never emitted half-
    # configured. VELORA_IMAGE has no inline :-default here: once this
    # script backfills it into ~/solvro/.env (both fresh installs and
    # re-runs), the default lives in exactly one place — the bash
    # resolution at the top of this file.
    if [[ -z "${SKIP_VELORA:-}" ]]; then
      cat <<'VELORA_COMPOSE'

  velora-app:
    image: ${VELORA_IMAGE}
    container_name: solvro-velora-app
    restart: unless-stopped
    pull_policy: always
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://velora:${VELORA_DB_PASSWORD}@postgres:5432/velora
      JWT_SECRET: ${JWT_SECRET}
      CRON_SECRET: ${CRON_SECRET}
      SECURE_COOKIE: ${SECURE_COOKIE:-false}
      NEXT_TELEMETRY_DISABLED: 1
    volumes:
      - velora_uploads:/app/uploads
    ports:
      # Loopback only — the public path is nginx's /pipeline-api, never a
      # directly published port (unlike frontend/backend, which follow
      # BIND_ADDR).
      - "127.0.0.1:${VELORA_PORT:-3001}:3000"

  velora-cron:
    image: alpine:3.19
    container_name: solvro-velora-cron
    restart: unless-stopped
    depends_on:
      - velora-app
    environment:
      CRON_SECRET: ${CRON_SECRET}
    entrypoint: /bin/sh
    command:
      - -c
      - |
        apk add --no-cache curl || exit 1
        printf '%s\n' \
          "0 23 * * * curl -s -H 'Authorization: Bearer '$$CRON_SECRET http://velora-app:3000/api/cron/auto-hold" \
          | crontab -
        crond -f -l 2
VELORA_COMPOSE
    fi

    cat <<'COMPOSE_VOLUMES'

volumes:
  solvro_pgdata:
    name: solvro_pgdata
COMPOSE_VOLUMES

    if [[ -z "${SKIP_VELORA:-}" ]]; then
      cat <<'VELORA_VOLUME'
  velora_uploads:
    name: solvro_velora_uploads
VELORA_VOLUME
    fi
  } > "$COMPOSE_FILE"
}

# Pulls the Velora image directly (outside `docker compose pull`) so an
# auth/registry failure aborts BEFORE any other mutation — compose file
# rewrite, volume wipe, or `docker compose pull` of the other images —
# ever happens. Call this FIRST in both branches, before anything else.
# No-ops when SKIP_VELORA is set.
preflight_pull_velora() {
  if [[ -n "${SKIP_VELORA:-}" ]]; then
    echo "SKIP_VELORA set — not pulling the Velora image."
    return 0
  fi
  echo "Checking Velora image access ($VELORA_IMAGE)..."
  if ! docker pull "$VELORA_IMAGE"; then
    echo
    echo "ERROR: failed to pull the Velora image ($VELORA_IMAGE)."
    echo "  This host is probably not logged in to the registry. Run:"
    echo "    docker login registry.gitlab.com"
    echo "  then re-run this script. Or point at a different image:"
    echo "    VELORA_IMAGE=<image> bash setup.sh"
    echo "  Or skip Velora entirely on this host:"
    echo "    SKIP_VELORA=1 bash setup.sh"
    exit 1
  fi
}

# Runs $2 (a `CREATE ROLE`/`CREATE DATABASE` statement) via psql if $3
# (an existence-check query returning a single row) doesn't already
# report it exists. Retries a few times and tolerates a concurrent
# "already exists" (e.g. a race with postgres finishing first-boot
# bootstrap, or a second invocation of this script).
ensure_pg_object() {
  local label="$1" create_sql="$2" check_sql="$3"
  local attempt
  for attempt in 1 2 3; do
    if docker compose exec -T postgres psql -U solvro -d solvro -tAc "$check_sql" 2>/dev/null | grep -q 1; then
      return 0
    fi
    if docker compose exec -T postgres psql -U solvro -d solvro -c "$create_sql" 2>&1 \
        | grep -qiE '^CREATE (ROLE|DATABASE)|already exists'; then
      return 0
    fi
    echo "  retrying $label ($attempt/3)..."
    sleep 2
  done
  echo "ERROR: could not ensure $label exists after 3 attempts."
  exit 1
}

# Ensures the `velora` Postgres role + logical database exist on the
# shared Postgres server. Idempotent (safe on both fresh installs and
# re-runs) and run BEFORE the full `up -d` so velora-app's migrate-on-boot
# step finds its database on first start instead of racing it. No-ops
# when SKIP_VELORA is set.
ensure_velora_db() {
  if [[ -n "${SKIP_VELORA:-}" ]]; then
    return 0
  fi

  echo "Starting postgres..."
  docker compose up -d postgres

  # Gate on BOTH the container's own healthcheck (`healthy` only after
  # several consecutive successful pg_isready runs — see the compose
  # healthcheck block) AND a real query, not just a bare pg_isready call:
  # on a brand-new volume, postgres briefly runs an internal bootstrap
  # server that can answer readiness pings before it's actually serving.
  echo -n "Waiting for postgres to be healthy"
  local healthy=0
  for _ in $(seq 1 30); do
    if [[ "$(docker inspect --format '{{.State.Health.Status}}' solvro-postgres 2>/dev/null)" == "healthy" ]] \
        && docker compose exec -T postgres psql -U solvro -d solvro -c 'SELECT 1' >/dev/null 2>&1; then
      healthy=1
      echo " ready."
      break
    fi
    echo -n "."
    sleep 2
  done

  if [[ "$healthy" -ne 1 ]]; then
    echo
    echo "ERROR: postgres did not become healthy within ~60s. Recent logs:"
    docker compose logs postgres --tail 40
    exit 1
  fi

  echo "Ensuring the velora role and database exist..."
  ensure_pg_object "velora role" \
    "CREATE ROLE velora LOGIN PASSWORD '${VELORA_DB_PASSWORD}'" \
    "SELECT 1 FROM pg_roles WHERE rolname='velora'"
  ensure_pg_object "velora database" \
    "CREATE DATABASE velora OWNER velora" \
    "SELECT 1 FROM pg_database WHERE datname='velora'"
}

# ------------------------------------------------------------------ branch: update vs fresh install
if [[ -f "$ENV_FILE" ]]; then
  echo "Existing install detected (~/solvro/.env present). Pulling new images and restarting..."
  # Reuse the ports persisted at first install. Older installs predate the
  # port vars — the compose ${VAR:-default} fallbacks keep them on 80/3000
  # and Postgres unpublished, exactly as before (now bound to 127.0.0.1).
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a

  # Preflight FIRST, before any mutation (compose rewrite, pull, or the
  # DB work below) — an aborted pull must not leave any of those partly
  # done.
  preflight_pull_velora

  # Older installs predate parts of the Velora integration — backfill any
  # missing vars/secrets so re-runs stay non-interactive. Appends only;
  # never touches a value already in ~/solvro/.env.
  if [[ -z "${CRON_SECRET:-}" ]]; then
    echo "Backfilling CRON_SECRET (older install, predates Velora)..."
    CRON_SECRET=$(openssl rand -hex 24)
    backfill_env CRON_SECRET "$CRON_SECRET"
  fi
  if [[ -z "${VELORA_DB_PASSWORD:-}" ]]; then
    echo "Backfilling VELORA_DB_PASSWORD (older install, predates Velora)..."
    VELORA_DB_PASSWORD=$(openssl rand -hex 24)
    backfill_env VELORA_DB_PASSWORD "$VELORA_DB_PASSWORD"
  fi
  SECURE_COOKIE="${SECURE_COOKIE:-false}"
  backfill_env SECURE_COOKIE "$SECURE_COOKIE"
  VELORA_PORT="${VELORA_PORT:-3001}"
  backfill_env VELORA_PORT "$VELORA_PORT"
  backfill_env VELORA_IMAGE "$VELORA_IMAGE"
  [[ -n "${SKIP_VELORA:-}" ]] && backfill_env SKIP_VELORA "$SKIP_VELORA"

  write_compose_file
  docker compose pull
  ensure_velora_db
  docker compose up -d
  echo
  echo "Solvro updated. Open $(app_url)"
  if [[ -z "${SKIP_VELORA:-}" ]]; then
    echo
    docker compose ps velora-app
  fi
  exit 0
fi

# ------------------------------------------------------------------ fresh install
echo "Fresh install. You'll be asked for the admin account and host ports."
echo

# Inputs can come from env vars (preferred for `curl | bash` and CI/automation)
# or from interactive prompts read from /dev/tty (so prompts work even when
# the script is piped from curl, where stdin is the curl pipe).
#
#   ADMIN_EMAIL=you@x.com ADMIN_PASSWORD=secret BIND_ADDR=0.0.0.0 \
#   FRONTEND_PORT=8090 BACKEND_PORT=3000 bash <(curl -sSL <url>)
# or
#   bash <(curl -sSL <url>)        # then answer prompts
# or
#   curl -sSL <url> -o setup.sh && bash setup.sh

ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"

if [[ -z "$ADMIN_EMAIL" || -z "$ADMIN_PASSWORD" ]]; then
  if [[ ! -r /dev/tty ]]; then
    echo "ERROR: no /dev/tty available and ADMIN_EMAIL/ADMIN_PASSWORD not set."
    echo "Re-run with env vars:"
    echo "  ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=secret bash <(curl -sSL <url>)"
    exit 1
  fi

  if [[ -z "$ADMIN_EMAIL" ]]; then
    read -r -p "Admin email: " ADMIN_EMAIL </dev/tty
  fi

  if [[ -z "$ADMIN_PASSWORD" ]]; then
    read -r -s -p "Admin password (min 8 chars): " ADMIN_PASSWORD </dev/tty
    echo
    read -r -s -p "Confirm password: " ADMIN_PASSWORD_CONFIRM </dev/tty
    echo
    [[ "$ADMIN_PASSWORD" == "$ADMIN_PASSWORD_CONFIRM" ]] || {
      echo "ERROR: passwords do not match."
      exit 1
    }
  fi
fi

[[ -n "$ADMIN_EMAIL" && "$ADMIN_EMAIL" == *"@"* ]] || {
  echo "ERROR: invalid email."
  exit 1
}
[[ ${#ADMIN_PASSWORD} -ge 8 ]] || {
  echo "ERROR: password must be at least 8 characters."
  exit 1
}

# Ports: env var, else interactive prompt with the default pre-filled
# (Enter accepts it). No /dev/tty → silently take the defaults so
# non-interactive automation keeps working.
FRONTEND_PORT="${FRONTEND_PORT:-}"
BACKEND_PORT="${BACKEND_PORT:-}"
POSTGRES_PORT="${POSTGRES_PORT:-}"
BIND_ADDR="${BIND_ADDR:-}"
# VELORA_PORT is env-var-only (no prompt, like VELORA_IMAGE/SKIP_VELORA)
# — always loopback-bound, so it doesn't need BIND_ADDR-style handling.
VELORA_PORT="${VELORA_PORT:-3001}"

if [[ -r /dev/tty ]]; then
  [[ -z "$FRONTEND_PORT" ]] && \
    read -r -p "Website port [80]: " FRONTEND_PORT </dev/tty
  [[ -z "$BACKEND_PORT" ]] && \
    read -r -p "API port [3000]: " BACKEND_PORT </dev/tty
  [[ -z "$POSTGRES_PORT" ]] && \
    read -r -p "Postgres host port (blank = keep private) []: " POSTGRES_PORT </dev/tty
  [[ -z "$BIND_ADDR" ]] && \
    read -r -p "Bind address [127.0.0.1] (0.0.0.0 = all interfaces): " BIND_ADDR </dev/tty
fi

FRONTEND_PORT="${FRONTEND_PORT:-80}"
BACKEND_PORT="${BACKEND_PORT:-3000}"
BIND_ADDR="${BIND_ADDR:-127.0.0.1}"
# POSTGRES_PORT intentionally left empty when not provided → DB stays private.

is_port "$FRONTEND_PORT" || {
  echo "ERROR: FRONTEND_PORT must be an integer 1-65535 (got '$FRONTEND_PORT')."
  exit 1
}
is_port "$BACKEND_PORT" || {
  echo "ERROR: BACKEND_PORT must be an integer 1-65535 (got '$BACKEND_PORT')."
  exit 1
}
if [[ "$FRONTEND_PORT" == "$BACKEND_PORT" ]]; then
  echo "ERROR: FRONTEND_PORT and BACKEND_PORT must differ (both '$FRONTEND_PORT')."
  exit 1
fi
if [[ -n "$POSTGRES_PORT" ]]; then
  is_port "$POSTGRES_PORT" || {
    echo "ERROR: POSTGRES_PORT must be an integer 1-65535 or blank (got '$POSTGRES_PORT')."
    exit 1
  }
  if [[ "$POSTGRES_PORT" == "$FRONTEND_PORT" || "$POSTGRES_PORT" == "$BACKEND_PORT" ]]; then
    echo "ERROR: POSTGRES_PORT must differ from the website/API ports."
    exit 1
  fi
fi
is_ipv4 "$BIND_ADDR" || {
  echo "ERROR: BIND_ADDR must be an IPv4 address (e.g. 127.0.0.1, 0.0.0.0, 192.168.1.10) — got '$BIND_ADDR'."
  exit 1
}
if [[ -z "${SKIP_VELORA:-}" ]]; then
  is_port "$VELORA_PORT" || {
    echo "ERROR: VELORA_PORT must be an integer 1-65535 (got '$VELORA_PORT')."
    exit 1
  }
  if [[ "$VELORA_PORT" == "$FRONTEND_PORT" || "$VELORA_PORT" == "$BACKEND_PORT" \
        || ( -n "$POSTGRES_PORT" && "$VELORA_PORT" == "$POSTGRES_PORT" ) ]]; then
    echo "ERROR: VELORA_PORT must differ from the website/API/Postgres ports."
    exit 1
  fi
fi

# Preflight FIRST, before any mutation below (secret generation is cheap
# to redo, but ~/solvro/.env, the compose file, and the pgdata volume
# wipe are not something an aborted run should leave half-done).
preflight_pull_velora

# hex (not base64): base64's `/` `+` `=` are unsafe in the DATABASE_URL
# userinfo and truncate it (P1013 "invalid port number"). 24 bytes = 192 bits.
POSTGRES_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 48)
CRON_SECRET=$(openssl rand -hex 24)
VELORA_DB_PASSWORD=$(openssl rand -hex 24)
SECURE_COOKIE=false

cat > "$ENV_FILE" <<EOF
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
JWT_SECRET=$JWT_SECRET
CRON_SECRET=$CRON_SECRET
VELORA_DB_PASSWORD=$VELORA_DB_PASSWORD
SECURE_COOKIE=$SECURE_COOKIE
VELORA_PORT=$VELORA_PORT
VELORA_IMAGE=$VELORA_IMAGE
BIND_ADDR=$BIND_ADDR
FRONTEND_PORT=$FRONTEND_PORT
BACKEND_PORT=$BACKEND_PORT
EOF
[[ -n "$POSTGRES_PORT" ]] && echo "POSTGRES_PORT=$POSTGRES_PORT" >> "$ENV_FILE"
[[ -n "${SKIP_VELORA:-}" ]] && echo "SKIP_VELORA=$SKIP_VELORA" >> "$ENV_FILE"
chmod 600 "$ENV_FILE"

write_compose_file

# Wipe any prior bad postgres state so the new password takes effect —
# this also destroys the `velora` database and any uploaded Velora files
# (one shared postgres volume, one uploads volume; see the header comment).
echo
echo "Clearing any prior stack and database/uploads volumes..."
docker compose down 2>/dev/null || true
docker volume rm "$VOLUME_NAME" 2>/dev/null || true
docker volume rm "$VELORA_UPLOADS_VOLUME" 2>/dev/null || true

echo "Pulling images..."
docker compose pull

ensure_velora_db

echo "Starting stack..."
docker compose up -d

# Probe host for the readiness check. 0.0.0.0 binds include loopback and
# 127.0.0.1 obviously does, so use 127.0.0.1 for both; a specific bind IP
# does NOT bind loopback, so hit that IP directly.
HEALTH_HOST="$BIND_ADDR"
[[ "$BIND_ADDR" == "0.0.0.0" ]] && HEALTH_HOST="127.0.0.1"

# Wait for backend to be ready (max ~120s — first boot includes migrate + seed)
echo -n "Waiting for backend to come up"
for _ in $(seq 1 60); do
  if curl -sf "http://${HEALTH_HOST}:${BACKEND_PORT}/health" >/dev/null 2>&1; then
    echo " ready."
    break
  fi
  echo -n "."
  sleep 2
done

if ! curl -sf "http://${HEALTH_HOST}:${BACKEND_PORT}/health" >/dev/null 2>&1; then
  echo
  echo "ERROR: backend did not come up within ~2 minutes. Recent logs:"
  docker compose logs backend --tail 40
  exit 1
fi

# Velora is loopback-only (127.0.0.1:$VELORA_PORT) regardless of BIND_ADDR
# — brief, advisory check only; a slow Velora boot must not fail the
# whole deploy. Skipped entirely when SKIP_VELORA is set.
if [[ -z "${SKIP_VELORA:-}" ]]; then
  echo -n "Waiting for Velora to come up"
  VELORA_READY=0
  for _ in $(seq 1 20); do
    if curl -sf "http://127.0.0.1:${VELORA_PORT}/" >/dev/null 2>&1; then
      VELORA_READY=1
      echo " ready."
      break
    fi
    echo -n "."
    sleep 2
  done
  if [[ "$VELORA_READY" -ne 1 ]]; then
    echo
    echo "WARNING: Velora did not respond within ~40s — it may still be starting."
    echo "  Check: docker compose logs velora-app --tail 40"
  fi
fi

# Create the admin user
echo "Creating admin user..."
docker compose exec -T \
  -e ADMIN_EMAIL="$ADMIN_EMAIL" \
  -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  backend npx tsx scripts/create-admin.ts

APP_URL="$(app_url)"

echo
echo "============================================================"
if [[ "$BIND_ADDR" == "127.0.0.1" ]]; then
  echo " Solvro is running (local-only — bound to 127.0.0.1)."
else
  echo " Solvro is running (bound to $BIND_ADDR — reachable on the network)."
fi
echo
echo "   URL:       $APP_URL"
echo "   Login as:  $ADMIN_EMAIL"
echo
echo "   Ports:     website $FRONTEND_PORT · API $BACKEND_PORT · Postgres ${POSTGRES_PORT:-not published}"
echo "   Bind:      $BIND_ADDR"
echo
if [[ -z "${SKIP_VELORA:-}" ]]; then
  echo "   Velora:    127.0.0.1:${VELORA_PORT} (loopback-only; nginx proxies it at /pipeline-api)"
  echo "   Migrating data from a standalone Velora install? See the runbook"
  echo "   comment near the top of this script."
else
  echo "   Velora:    skipped (SKIP_VELORA set)"
fi
echo
if [[ "$BIND_ADDR" == "127.0.0.1" ]]; then
  echo " Reachable only from this server. From your machine, tunnel:"
  echo "   ssh -L ${FRONTEND_PORT}:localhost:${FRONTEND_PORT} <user>@<server>"
  echo "   then open $APP_URL"
else
  echo " Reachable on the network at $APP_URL"
  echo " NOTE: only the in-app login protects it — keep it behind a trusted"
  echo "       network / VPN / firewall. (Postgres stays private on 127.0.0.1.)"
fi
echo
echo " Useful commands (run from $DEPLOY_DIR):"
echo "   docker compose ps              # check container status"
echo "   docker compose logs -f backend # tail backend logs"
echo "   bash setup.sh                  # re-run to update images"
echo "   # change bind address / ports later: edit ~/solvro/.env then"
echo "   docker compose up -d"
echo
echo " To enable Google sign-in:"
echo "   1. Create an OAuth 2.0 Client ID in Google Cloud Console"
echo "      (Web application, add $APP_URL as an Authorized JS origin —"
echo "      use the exact host:port you reach Solvro on)."
echo "   2. Sign in as admin → Admin → Sign-in tab → paste the Client ID,"
echo "      add at least one allowed email domain, click Save."
echo "      No restart, no rebuild needed."
echo
echo " Backup the database before destructive operations:"
echo "   docker run --rm -v $VOLUME_NAME:/data -v \$PWD:/backup alpine \\"
echo "     tar czf /backup/pg-\$(date +%F).tgz -C / data"
echo "============================================================"
