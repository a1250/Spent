#!/usr/bin/env bash
# Backup and restore integration test — runs against a sandbox copy only.
# Never touches data/spent.db.
#
# Usage:
#   SANDBOX=$(./scripts/qa-sandbox.sh) && ./scripts/test-backup-restore.sh "$SANDBOX"
#
# Or pass the sandbox path directly:
#   ./scripts/test-backup-restore.sh /path/to/sandbox
#
# Exits non-zero on any failure.

set -euo pipefail

SANDBOX="${1:-}"

if [[ -z "$SANDBOX" ]]; then
  echo "ERROR: sandbox path is required as \$1"
  echo "Usage: SANDBOX=\$(./scripts/qa-sandbox.sh) && ./scripts/test-backup-restore.sh \"\$SANDBOX\""
  exit 1
fi

if [[ "$SANDBOX" == "$(pwd)/data" || "$SANDBOX" == "./data" ]]; then
  echo "ERROR: SANDBOX points at the live data directory — refusing to run"
  exit 1
fi

if [[ ! -f "$SANDBOX/spent.db" ]]; then
  echo "ERROR: No spent.db found at $SANDBOX"
  exit 1
fi

export SPENT_DATA_DIR="$SANDBOX"

PORT=3778
BASE_URL="http://127.0.0.1:$PORT"
# CSRF middleware requires Origin header on all mutating requests
ORIGIN_HEADER="Origin: $BASE_URL"

echo ""
echo "=== Backup/Restore Integration Test ==="
echo "Sandbox: $SANDBOX"
echo "Port: $PORT"
echo ""

# --- Start sandbox server ---
echo "[1/8] Starting sandbox server on port $PORT..."
npm run build --silent 2>/dev/null || { echo "ERROR: build failed"; exit 1; }
SPENT_DATA_DIR="$SANDBOX" npx next start -p $PORT &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

sleep 6

# --- Baseline transaction count ---
echo "[2/8] Reading baseline transaction count..."
TX_BEFORE=$(sqlite3 "$SANDBOX/spent.db" "SELECT COUNT(*) FROM transactions;")
echo "  Transactions before: $TX_BEFORE"

# --- List backups (should be empty initially) ---
echo "[3/8] GET /api/data/backups (expect empty)..."
LIST1=$(curl -s "$BASE_URL/api/data/backups")
COUNT1=$(echo "$LIST1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['backups']))" 2>/dev/null || echo "error")
echo "  Backup count: $COUNT1"
if [[ "$COUNT1" != "0" ]]; then
  echo "  (non-zero is OK if sandbox already had backups)"
fi

# --- Create a backup ---
echo "[4/8] POST /api/data/backups (create backup)..."
CREATE_RESP=$(curl -s -X POST "$BASE_URL/api/data/backups" \
  -H "$ORIGIN_HEADER" \
  -H "Content-Type: application/json")
BACKUP_FILE=$(echo "$CREATE_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['backup']['filename'])" 2>/dev/null || echo "")
BACKUP_TX=$(echo "$CREATE_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['backup']['transactionCount'])" 2>/dev/null || echo "")
BACKUP_INTEGRITY=$(echo "$CREATE_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['backup']['integrity'])" 2>/dev/null || echo "")

if [[ -z "$BACKUP_FILE" ]]; then
  echo "ERROR: backup creation failed"
  echo "Response: $CREATE_RESP"
  exit 1
fi

echo "  Created: $BACKUP_FILE"
echo "  Transactions in backup: $BACKUP_TX"
echo "  Integrity: $BACKUP_INTEGRITY"

if [[ "$BACKUP_INTEGRITY" != "ok" ]]; then
  echo "ERROR: backup integrity check failed"
  exit 1
fi

if [[ ! -f "$SANDBOX/backups/$BACKUP_FILE" ]]; then
  echo "ERROR: backup file not found on disk at $SANDBOX/backups/$BACKUP_FILE"
  exit 1
fi

echo "  [ok] backup file exists on disk"

# --- Verify backup appears in list ---
echo "[5/8] GET /api/data/backups (verify backup appears)..."
LIST2=$(curl -s "$BASE_URL/api/data/backups")
COUNT2=$(echo "$LIST2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['backups']))" 2>/dev/null || echo "error")
echo "  Backup count: $COUNT2"
FOUND=$(echo "$LIST2" | python3 -c "import sys,json; d=json.load(sys.stdin); files=[b['filename'] for b in d['backups']]; print('yes' if '$BACKUP_FILE' in files else 'no')" 2>/dev/null || echo "no")
if [[ "$FOUND" != "yes" ]]; then
  echo "ERROR: created backup not found in list"
  exit 1
fi
echo "  [ok] backup visible in list"

# --- Test restore — wrong confirmation ---
echo "[6/8] POST /api/data/restore with wrong confirmation (expect 400)..."
BAD_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/data/restore" \
  -H "$ORIGIN_HEADER" \
  -H "Content-Type: application/json" \
  -d "{\"filename\":\"$BACKUP_FILE\",\"confirmation\":\"wrong\"}")
BAD_STATUS=$(echo "$BAD_RESP" | tail -1)
if [[ "$BAD_STATUS" != "400" ]]; then
  echo "ERROR: expected 400 for bad confirmation, got $BAD_STATUS"
  exit 1
fi
echo "  [ok] wrong confirmation rejected with 400"

# --- Test restore — invalid filename ---
echo "[7/8] POST /api/data/restore with path traversal filename (expect 400)..."
TRAV_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/data/restore" \
  -H "$ORIGIN_HEADER" \
  -H "Content-Type: application/json" \
  -d "{\"filename\":\"../spent.db\",\"confirmation\":\"restore database\"}")
TRAV_STATUS=$(echo "$TRAV_RESP" | tail -1)
if [[ "$TRAV_STATUS" != "400" ]]; then
  echo "ERROR: expected 400 for path traversal, got $TRAV_STATUS"
  exit 1
fi
echo "  [ok] path traversal rejected with 400"

# --- Test actual restore ---
echo "[8/8] POST /api/data/restore with correct confirmation..."
RESTORE_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/data/restore" \
  -H "$ORIGIN_HEADER" \
  -H "Content-Type: application/json" \
  -d "{\"filename\":\"$BACKUP_FILE\",\"confirmation\":\"restore database\"}")
RESTORE_BODY=$(echo "$RESTORE_RESP" | head -1)
RESTORE_STATUS=$(echo "$RESTORE_RESP" | tail -1)

if [[ "$RESTORE_STATUS" != "200" ]]; then
  echo "ERROR: restore returned $RESTORE_STATUS"
  echo "Response: $RESTORE_BODY"
  exit 1
fi

PRE_RESTORE_FILE=$(echo "$RESTORE_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['preRestoreBackup'])" 2>/dev/null || echo "")
REQUIRES_RESTART=$(echo "$RESTORE_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['requiresRestart'])" 2>/dev/null || echo "")

echo "  Pre-restore backup: $PRE_RESTORE_FILE"
echo "  Requires restart: $REQUIRES_RESTART"

if [[ -z "$PRE_RESTORE_FILE" ]]; then
  echo "ERROR: restore response missing preRestoreBackup"
  exit 1
fi

if [[ ! -f "$SANDBOX/backups/$PRE_RESTORE_FILE" ]]; then
  echo "ERROR: pre-restore backup file not found on disk"
  exit 1
fi
echo "  [ok] pre-restore backup exists on disk"

if [[ "$REQUIRES_RESTART" != "True" && "$REQUIRES_RESTART" != "true" ]]; then
  echo "  WARNING: requiresRestart not true — check response shape"
fi

echo ""
echo "=== All tests passed ==="
echo ""
echo "Backup created: $BACKUP_FILE"
echo "Pre-restore backup: $PRE_RESTORE_FILE"
echo ""
echo "Sandbox backups:"
ls "$SANDBOX/backups/" 2>/dev/null | grep "\.db$" | sort | tail -10
echo ""
echo "NOTE: server restart required for restored DB to take effect."
echo "To clean up: rm -rf $SANDBOX"
