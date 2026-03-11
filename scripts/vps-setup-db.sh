#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# VPS-001: Auto-setup PostgreSQL databases for sippy
#
# Usage:
#   PGPASSWORD=<postgres_superuser_pass> DB_USER_PASSWORD=<sippy_role_pass> \
#     bash scripts/vps-setup-db.sh
#
# Idempotent — safe to re-run. All creation steps are guarded.
# ---------------------------------------------------------------------------

readonly DB_USER="sippy"
readonly DB_NAME_TEST="sippy_test"
readonly DB_NAME_INDEXER="sippy_indexer"

# ---------------------------------------------------------------------------
# Step 1 — Validate required env vars
# ---------------------------------------------------------------------------

if [ -z "${PGPASSWORD:-}" ]; then
  echo "ERROR: PGPASSWORD must be set to the PostgreSQL superuser password."
  echo "  Example: PGPASSWORD=yourpassword DB_USER_PASSWORD=yourpassword bash scripts/vps-setup-db.sh"
  exit 1
fi

if [ -z "${DB_USER_PASSWORD:-}" ]; then
  echo "ERROR: DB_USER_PASSWORD must be set to the desired password for the '${DB_USER}' role."
  echo "  Example: PGPASSWORD=yourpassword DB_USER_PASSWORD=yourpassword bash scripts/vps-setup-db.sh"
  exit 1
fi

# ---------------------------------------------------------------------------
# Helper: connect over TCP as the postgres DB superuser
# PGPASSWORD is already set in the environment; psql reads it automatically.
# No OS user switching, no elevated privileges.
# ---------------------------------------------------------------------------

_run_psql() {
  psql -U "${PGUSER:-postgres}" -h 127.0.0.1 -p "${PGPORT:-5432}" "$@"
}

# ---------------------------------------------------------------------------
# Step 2 — Check for PostgreSQL
# ---------------------------------------------------------------------------

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: PostgreSQL is not installed."
  echo "To install on Ubuntu/Debian, run as root:"
  echo "  apt-get update && apt-get install -y postgresql postgresql-client"
  echo "Then re-run this script."
  exit 1
fi

if ! pg_isready -h 127.0.0.1 -q; then
  echo "ERROR: PostgreSQL is installed but not accepting connections on 127.0.0.1."
  echo "Start it with: systemctl start postgresql"
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 3 — Create DB role if not present
# ---------------------------------------------------------------------------

echo "Ensuring role '${DB_USER}' exists..."
_run_psql -c "DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', '${DB_USER}', '${DB_USER_PASSWORD}');
  END IF;
END \$\$;"

# ---------------------------------------------------------------------------
# Step 4 — Create databases if not present
# ---------------------------------------------------------------------------

for DB_NAME in "${DB_NAME_TEST}" "${DB_NAME_INDEXER}"; do
  echo "Ensuring database '${DB_NAME}' exists..."
  DB_EXISTS=$(_run_psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'")
  if [ "${DB_EXISTS}" != "1" ]; then
    _run_psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}"
    _run_psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER}"
  fi
done

# ---------------------------------------------------------------------------
# Step 5 — Run backend migrations against sippy_test
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "${SCRIPT_DIR}")"
BACKEND_DIR="${REPO_ROOT}/apps/backend"

if [ ! -d "${BACKEND_DIR}/node_modules" ]; then
  echo "ERROR: node_modules not found in apps/backend. Run 'pnpm install' first."
  exit 1
fi

echo "Running migrations against '${DB_NAME_TEST}'..."
cd "${BACKEND_DIR}"

# Non-secret configuration values
export NODE_ENV="test"
export PORT="3333"
export HOST="localhost"
export APP_URL="http://localhost:3333"
export LOG_LEVEL="info"
export SESSION_DRIVER="memory"

# Real value: DB connection for sippy_test
export DATABASE_URL="postgresql://${DB_USER}:${DB_USER_PASSWORD}@127.0.0.1:5432/${DB_NAME_TEST}"

# Non-functional placeholders — satisfy Env.schema.string()/secret() validation only.
# Migrations (0001_sippy_existing_schema.ts, 0002_admin_users.ts) use only this.db.rawQuery()
# and Knex schema builder; they never call WhatsApp, GROQ, or session services.
export APP_KEY="migration-only-placeholder"
export WHATSAPP_PHONE_NUMBER_ID="placeholder"
export WHATSAPP_ACCESS_TOKEN="placeholder"
export WHATSAPP_VERIFY_TOKEN="placeholder"
export GROQ_API_KEY="placeholder"

node ace migration:run --force

# ---------------------------------------------------------------------------
# Step 6 — Print connection strings (password redacted)
# ---------------------------------------------------------------------------

echo ""
echo "Done. Connection strings:"
echo "  ${DB_NAME_TEST}:    postgresql://${DB_USER}:***@127.0.0.1:5432/${DB_NAME_TEST}"
echo "  ${DB_NAME_INDEXER}: postgresql://${DB_USER}:***@127.0.0.1:5432/${DB_NAME_INDEXER}"
