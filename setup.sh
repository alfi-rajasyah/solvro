#!/usr/bin/env bash
# Solvro one-shot deploy script.
#
# First run on a fresh server:
#   - Prompts for an admin email + password
#   - Generates random POSTGRES_PASSWORD and JWT_SECRET
#   - Writes ~/solvro/{docker-compose.yml,.env}
#   - Wipes any prior solvro_pgdata volume (clears stale postgres state)
#   - Brings the stack up and creates the admin user
#
# Re-runs on a server that already has ~/solvro/.env:
#   - Detects existing install, skips prompts
#   - Just pulls new images and restarts (your update flow)
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

# ------------------------------------------------------------------ writes the compose file (always, so updates pick up changes)
cat > "$COMPOSE_FILE" <<'COMPOSE_EOF'
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
      - "3000:3000"
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
      - "80:80"

volumes:
  solvro_pgdata:
    name: solvro_pgdata
COMPOSE_EOF

# ------------------------------------------------------------------ branch: update vs fresh install
if [[ -f "$ENV_FILE" ]]; then
  echo "Existing install detected (~/solvro/.env present). Pulling new images and restarting..."
  docker compose pull
  docker compose up -d
  SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
  [[ -z "${SERVER_IP:-}" ]] && SERVER_IP="<server-ip>"
  echo
  echo "Solvro updated. Open http://$SERVER_IP"
  exit 0
fi

# ------------------------------------------------------------------ fresh install
echo "Fresh install. You'll be asked for the admin email and password."
echo

read -r -p "Admin email: " ADMIN_EMAIL
[[ -n "$ADMIN_EMAIL" && "$ADMIN_EMAIL" == *"@"* ]] || {
  echo "ERROR: invalid email."
  exit 1
}

# Read password without echoing it
read -r -s -p "Admin password (min 8 chars): " ADMIN_PASSWORD
echo
[[ ${#ADMIN_PASSWORD} -ge 8 ]] || {
  echo "ERROR: password must be at least 8 characters."
  exit 1
}

read -r -s -p "Confirm password: " ADMIN_PASSWORD_CONFIRM
echo
[[ "$ADMIN_PASSWORD" == "$ADMIN_PASSWORD_CONFIRM" ]] || {
  echo "ERROR: passwords do not match."
  exit 1
}

POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '\n')
JWT_SECRET=$(openssl rand -hex 48)

cat > "$ENV_FILE" <<EOF
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
JWT_SECRET=$JWT_SECRET
EOF
chmod 600 "$ENV_FILE"

# Wipe any prior bad postgres state so the new password takes effect
echo
echo "Clearing any prior stack and database volume..."
docker compose down 2>/dev/null || true
docker volume rm "$VOLUME_NAME" 2>/dev/null || true

echo "Pulling images..."
docker compose pull

echo "Starting stack..."
docker compose up -d

# Wait for backend to be ready (max ~120s — first boot includes migrate + seed)
echo -n "Waiting for backend to come up"
for _ in $(seq 1 60); do
  if curl -sf http://localhost:3000/health >/dev/null 2>&1; then
    echo " ready."
    break
  fi
  echo -n "."
  sleep 2
done

if ! curl -sf http://localhost:3000/health >/dev/null 2>&1; then
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

SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
[[ -z "${SERVER_IP:-}" ]] && SERVER_IP="<server-ip>"

echo
echo "============================================================"
echo " Solvro is running."
echo
echo "   URL:       http://$SERVER_IP"
echo "   Login as:  $ADMIN_EMAIL"
echo
echo " Useful commands (run from $DEPLOY_DIR):"
echo "   docker compose ps              # check container status"
echo "   docker compose logs -f backend # tail backend logs"
echo "   bash setup.sh                  # re-run to update images"
echo
echo " Backup the database before destructive operations:"
echo "   docker run --rm -v $VOLUME_NAME:/data -v \$PWD:/backup alpine \\"
echo "     tar czf /backup/pg-\$(date +%F).tgz -C / data"
echo "============================================================"
