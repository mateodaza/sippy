#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# VPS-002: Auto-generate .env files for sippy VPS deployment
#
# Usage:
#   bash scripts/vps-setup-env.sh --db-password <val> --alchemy-key <val> [--force]
#
# Idempotent — skips files that already exist unless --force is passed.
# ---------------------------------------------------------------------------

DB_PASSWORD=""
ALCHEMY_KEY=""
FORCE=false

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db-password)
      DB_PASSWORD="$2"
      shift 2
      ;;
    --alchemy-key)
      ALCHEMY_KEY="$2"
      shift 2
      ;;
    --force)
      FORCE=true
      shift
      ;;
    *)
      echo "ERROR: Unknown argument: $1"
      echo "Usage: bash scripts/vps-setup-env.sh --db-password <val> --alchemy-key <val> [--force]"
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Validate required arguments
# ---------------------------------------------------------------------------

if [ -z "${DB_PASSWORD}" ]; then
  echo "ERROR: --db-password is required."
  echo "Usage: bash scripts/vps-setup-env.sh --db-password <val> --alchemy-key <val> [--force]"
  exit 1
fi

if [ -z "${ALCHEMY_KEY}" ]; then
  echo "ERROR: --alchemy-key is required."
  echo "Usage: bash scripts/vps-setup-env.sh --db-password <val> --alchemy-key <val> [--force]"
  exit 1
fi

# ---------------------------------------------------------------------------
# Derive repo root
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "${SCRIPT_DIR}")"

# ---------------------------------------------------------------------------
# Helper: write_file <path> <content>
# ---------------------------------------------------------------------------

write_file() {
  local path="$1"
  local content="$2"

  if [ -f "${path}" ] && [ "${FORCE}" = false ]; then
    echo "SKIP: ${path} already exists (use --force to overwrite)"
    return
  fi

  mkdir -p "$(dirname "${path}")"
  printf '%s\n' "${content}" > "${path}"
  echo "WROTE: ${path}"
}

# ---------------------------------------------------------------------------
# File 1: apps/backend/.env.test
# ---------------------------------------------------------------------------

write_file "${REPO_ROOT}/apps/backend/.env.test" "NODE_ENV=test
DATABASE_URL=postgresql://sippy:${DB_PASSWORD}@127.0.0.1:5432/sippy_test
SESSION_DRIVER=memory
APP_KEY=vps-test-app-key-placeholder-32ch
HOST=127.0.0.1
PORT=3333
APP_URL=http://localhost:3333
LOG_LEVEL=warn
USE_LLM=false
WHATSAPP_VERIFY_TOKEN=test-verify-token
WHATSAPP_PHONE_NUMBER_ID=test-phone-id
WHATSAPP_ACCESS_TOKEN=test-access-token
GROQ_API_KEY=test-groq-key
NOTIFY_SECRET=test-notify-secret
WHATSAPP_APP_SECRET=test-app-secret
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
JWT_PRIVATE_KEY_PEM=
JWT_PUBLIC_KEY_PEM=
JWT_KEY_ID=sippy-1
JWT_ISSUER=sippy"

# ---------------------------------------------------------------------------
# File 2: apps/indexer/.env
# ---------------------------------------------------------------------------

write_file "${REPO_ROOT}/apps/indexer/.env" "DATABASE_SCHEMA=ponder
DATABASE_URL=postgresql://sippy:${DB_PASSWORD}@127.0.0.1:5432/sippy_indexer
INDEXER_API_SECRET=placeholder-change-me
NODE_ENV=production
PONDER_RPC_URL_42161=https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}
PORT=42069
START_BLOCK=437000000"

# ---------------------------------------------------------------------------
# File 3: apps/web/.env.local
# ---------------------------------------------------------------------------

write_file "${REPO_ROOT}/apps/web/.env.local" "NEXT_PUBLIC_BACKEND_URL=http://localhost:3333
BACKEND_URL=http://localhost:3333
NEXT_PUBLIC_CDP_PROJECT_ID=
NEXT_PUBLIC_SIPPY_NETWORK=arbitrum
NEXT_PUBLIC_SIPPY_SPENDER_ADDRESS=
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
NEXT_PUBLIC_BLOCKSCOUT_BASE_URL=https://arbitrum.blockscout.com
NEXT_PUBLIC_BLOCKSCOUT_API_KEY="

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

echo "Done."
