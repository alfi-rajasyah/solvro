#!/usr/bin/env bash
# Solvro one-shot deploy script.
#
# First run on a fresh server:
#   - Prompts for an admin email + password
#   - Prompts for the host ports (website / API / optional Postgres), each
#     with a default you can accept by pressing Enter
#   - Generates random POSTGRES_PASSWORD, JWT_SECRET and SECRETS_KEY
#   - Writes ~/solvro/{docker-compose.yml,.env}
#   - Wipes any prior solvro_pgdata volume (clears stale postgres state)
#   - Brings the stack up and creates the admin user
#
# Re-runs on a server that already has ~/solvro/.env:
#   - Detects existing install, skips prompts
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
#   TRUST_PROXY     which proxies the API trusts for the client IP. Default
#                   "loopback, uniquelocal": the bundled nginx (Docker network)
#                   and a tunnel connector on this host or a private network,
#                   never a public address — so a client on the public internet
#                   cannot spoof its IP, whether or not a tunnel sits in front
#                   (a client on a private network still can; that only moves
#                   its rate-limit bucket). Use a hop count ("1", "2") or a
#                   comma list of loopback/linklocal/uniquelocal/IPs/CIDRs
#                   when a CDN with public addresses fronts nginx. Validated
#                   and saved to .env when set — on install and on update.
# To change BIND_ADDR / frontend / backend later, edit ~/solvro/.env and
# `docker compose up -d`. Changing whether/where Postgres is published
# requires re-running this script.
#
# Requirements: Docker Engine + Docker Compose plugin already installed.

set -euo pipefail

DEPLOY_DIR="$HOME/solvro"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.yml"
ENV_FILE="$DEPLOY_DIR/.env"
VOLUME_NAME="solvro_pgdata"

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

# True only when /dev/tty can actually be opened. `-r /dev/tty` is not enough:
# the node exists and is world-readable even with no controlling terminal
# (cron, CI, `ssh host 'bash setup.sh'`), but opening it fails with ENXIO and
# `set -e` would abort the run (`true`, not `:` — a failed redirect on a POSIX
# special builtin exits a shell in POSIX mode) (docs/archive/plans/application-review-2026-10-22.md, N-03).
have_tty() {
  { true </dev/tty; } 2>/dev/null
}

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

# Light check of TRUST_PROXY: a hop count 0-10, or a comma list of
# loopback / linklocal / uniquelocal / IPv4 / IPv6 addresses or CIDRs. The
# backend (src/http/trustProxy.ts) validates it fully; this only fails early.
is_trust_proxy() {
  local value="$1" entry
  if [[ "$value" =~ ^[0-9]+$ ]]; then
    (( 10#$value <= 10 ))
    return
  fi
  # read -ra, not an unquoted word split: no pathname expansion on `*` / `?`.
  local -a entries
  IFS=, read -ra entries <<< "$value"
  for entry in "${entries[@]}"; do
    entry="${entry//[[:space:]]/}"
    [[ "$entry" =~ ^(loopback|linklocal|uniquelocal)$ \
      || "$entry" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}(/[0-9]{1,2})?$ \
      || "$entry" =~ ^[0-9a-fA-F:.]*:[0-9a-fA-F:.]*(/[0-9]{1,3})?$ ]] || return 1
  done
  return 0
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
      SECRETS_KEY: ${SECRETS_KEY}
      ITOP_SYNC_DISABLED: "${ITOP_SYNC_DISABLED:-false}"
      CORS_ORIGIN: "*"
      LOG_LEVEL: info
      TRUST_PROXY: "${TRUST_PROXY:-loopback, uniquelocal}"
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

volumes:
  solvro_pgdata:
    name: solvro_pgdata
COMPOSE_REST
  } > "$COMPOSE_FILE"
}

# ------------------------------------------------------------------ branch: update vs fresh install
if [[ -f "$ENV_FILE" ]]; then
  echo "Existing install detected (~/solvro/.env present). Pulling new images and restarting..."
  # A TRUST_PROXY passed to this run wins over the saved one; capture it
  # before sourcing .env (which would otherwise silently override it).
  TRUST_PROXY_ARG="${TRUST_PROXY:-}"
  # Reuse the ports persisted at first install. Older installs predate the
  # port vars — the compose ${VAR:-default} fallbacks keep them on 80/3000
  # and Postgres unpublished, exactly as before (now bound to 127.0.0.1).
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  # Older installs predate SECRETS_KEY (secrets-at-rest for integration
  # tokens) — generate it once and append, never overwriting an existing value.
  # Test the FILE, not the shell variable: an exported SECRETS_KEY that is
  # missing from .env would otherwise be lost on the next run, and a new key
  # makes every stored token unreadable.
  if ! grep -q '^SECRETS_KEY=.' "$ENV_FILE"; then
    SECRETS_KEY=$(openssl rand -base64 32)
    echo "SECRETS_KEY=$SECRETS_KEY" >> "$ENV_FILE"
  fi
  if [[ -n "$TRUST_PROXY_ARG" ]]; then
    is_trust_proxy "$TRUST_PROXY_ARG" || {
      echo "ERROR: TRUST_PROXY must be a hop count 0-10 or a comma list of loopback, linklocal, uniquelocal, IP addresses or CIDRs (got '$TRUST_PROXY_ARG')."
      exit 1
    }
    TRUST_PROXY="$TRUST_PROXY_ARG"
    # Persist: replace the saved line or append one (quoted — the value may hold spaces).
    if grep -q '^TRUST_PROXY=' "$ENV_FILE"; then
      sed -i "s|^TRUST_PROXY=.*|TRUST_PROXY=\"$TRUST_PROXY\"|" "$ENV_FILE"
    else
      echo "TRUST_PROXY=\"$TRUST_PROXY\"" >> "$ENV_FILE"
    fi
  fi
  write_compose_file
  docker compose pull
  docker compose up -d
  echo
  echo "Solvro updated. Open $(app_url)"
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
  if ! have_tty; then
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
TRUST_PROXY="${TRUST_PROXY:-}"

if have_tty; then
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
if [[ -n "$TRUST_PROXY" ]]; then
  is_trust_proxy "$TRUST_PROXY" || {
    echo "ERROR: TRUST_PROXY must be a hop count 0-10 or a comma list of loopback, linklocal, uniquelocal, IP addresses or CIDRs (got '$TRUST_PROXY')."
    exit 1
  }
fi

# Data-loss guard. "Fresh install" is inferred from a missing ~/solvro/.env,
# but the database volume is global to the Docker host: a run as a different
# user, after a home-directory move, or after .env was lost would otherwise
# reach the wipe below and delete a live database with no question asked.
# Refuse while the volume exists unless the operator opts in explicitly.
# Checked BEFORE .env is written: aborting after it would make the next run
# take the update branch with a new POSTGRES_PASSWORD that no longer matches
# the existing volume.
if docker volume inspect "$VOLUME_NAME" >/dev/null 2>&1; then
  if [[ "${FORCE_WIPE:-}" != "1" ]]; then
    echo "ERROR: the Docker volume '$VOLUME_NAME' already exists but $ENV_FILE was not found."
    echo "       This looks like an existing Solvro install (different user, moved home directory,"
    echo "       or a lost .env). A fresh install would DELETE that database."
    echo
    echo "  To keep it:    restore ~/solvro/.env (POSTGRES_PASSWORD, JWT_SECRET, SECRETS_KEY) and re-run."
    echo "  Back it up (database container running — consistent dump, needs no other file):"
    echo "                 docker exec solvro-postgres pg_dump -U solvro -Fc solvro > solvro-\$(date +%F).dump"
    echo "  Back it up (database container stopped — the volume is then consistent):"
    echo "                 docker run --rm -v $VOLUME_NAME:/data -v \$PWD:/backup alpine \\"
    echo "                   tar czf /backup/pg-\$(date +%F).tgz -C / data"
    echo "  Start over:    FORCE_WIPE=1 bash setup.sh   (deletes the volume and all data)"
    exit 1
  fi
  echo "FORCE_WIPE=1 set: the existing volume '$VOLUME_NAME' will be deleted."
fi

# hex (not base64): base64's `/` `+` `=` are unsafe in the DATABASE_URL
# userinfo and truncate it (P1013 "invalid port number"). 24 bytes = 192 bits.
POSTGRES_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 48)
# Base64 (not hex): SECRETS_KEY must decode to exactly 32 bytes for AES-256-GCM (backend/src/env.ts).
SECRETS_KEY=$(openssl rand -base64 32)

cat > "$ENV_FILE" <<EOF
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
JWT_SECRET=$JWT_SECRET
SECRETS_KEY=$SECRETS_KEY
BIND_ADDR=$BIND_ADDR
FRONTEND_PORT=$FRONTEND_PORT
BACKEND_PORT=$BACKEND_PORT
EOF
[[ -n "$POSTGRES_PORT" ]] && echo "POSTGRES_PORT=$POSTGRES_PORT" >> "$ENV_FILE"
# Quoted: the value may hold spaces ("loopback, uniquelocal") and .env is sourced by bash on update.
[[ -n "$TRUST_PROXY" ]] && echo "TRUST_PROXY=\"$TRUST_PROXY\"" >> "$ENV_FILE"
chmod 600 "$ENV_FILE"

write_compose_file

# Wipe any prior bad postgres state so the new password takes effect
echo
echo "Clearing any prior stack and database volume..."
docker compose down 2>/dev/null || true
docker volume rm "$VOLUME_NAME" 2>/dev/null || true

echo "Pulling images..."
docker compose pull

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
echo " Back up the database: fetch backup.sh once, then run it (consistent"
echo " pg_dump into $DEPLOY_DIR/backups, 14 days kept):"
echo "   curl -sSL https://raw.githubusercontent.com/alfi-rajasyah/solvro/main/backup.sh -o $DEPLOY_DIR/backup.sh"
echo "   bash $DEPLOY_DIR/backup.sh"
echo "   bash $DEPLOY_DIR/backup.sh --print-cron   # suggested crontab line"
echo "============================================================"
