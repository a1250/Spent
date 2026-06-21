#!/usr/bin/env bash
# V1 entry/navigation acceptance test. Runs only against a sandbox DB.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SANDBOX="${1:-}"
PORT="${PORT:-3782}"

if [[ -z "$SANDBOX" ]]; then
  SANDBOX="$("$ROOT/scripts/qa-sandbox.sh")"
fi

DB="$SANDBOX/spent.db"
BASE="http://127.0.0.1:$PORT"
ORIGIN="$BASE"

if [[ ! -f "$DB" ]]; then
  echo "ERROR: sandbox DB not found at $DB" >&2
  exit 1
fi

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "=== V1 Entry/Navigation Acceptance Test ==="
echo "Sandbox: $SANDBOX"
echo "Port: $PORT"

sqlite3 "$DB" "
  PRAGMA foreign_keys = OFF;
  DELETE FROM sync_runs;
  DELETE FROM bank_credentials;
  DELETE FROM transactions;
  DELETE FROM import_rows;
  DELETE FROM import_batches;
  PRAGMA foreign_keys = ON;
"

SPENT_DATA_DIR="$SANDBOX" npx next start -H 127.0.0.1 -p "$PORT" &
SERVER_PID=$!

for _ in {1..60}; do
  if curl -fsS "$BASE/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

request_page() {
  local path="$1"
  local out="$2"
  local meta
  meta=$(curl -sS -L -o "$out" -w '%{http_code} %{url_effective} %{num_redirects}' "$BASE$path")
  local code effective redirects
  read -r code effective redirects <<<"$meta"
  echo "  $path -> $code $effective redirects=$redirects"
  if [[ "$code" != "200" ]]; then
    echo "ERROR: $path returned $code" >&2
    exit 1
  fi
  if [[ "$effective" == "$BASE/setup"* ]]; then
    echo "ERROR: $path was forced to setup" >&2
    exit 1
  fi
  if [[ "$redirects" -gt 5 ]]; then
    echo "ERROR: $path looks like a redirect loop" >&2
    exit 1
  fi
}

echo "[1/4] Fresh workspace: no transactions, no integrations..."
request_page "/" /tmp/bw-v1-home.html
grep -q "Go to Dashboard" /tmp/bw-v1-home.html
grep -q "Connect Bank or Service" /tmp/bw-v1-home.html
grep -q "Import File" /tmp/bw-v1-home.html
grep -q "Add Manual Transaction" /tmp/bw-v1-home.html
request_page "/transactions" /tmp/bw-v1-transactions.html
request_page "/import" /tmp/bw-v1-import.html
request_page "/settings/bank" /tmp/bw-v1-bank.html
grep -q "Connections are optional" /tmp/bw-v1-bank.html
grep -q "Import a file instead" /tmp/bw-v1-bank.html

echo "[2/4] Integration failure does not block app..."
FAIL_RESP=$(curl -sS -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  -X POST "$BASE/api/setup/bank/test" \
  -d '{"provider":"unsupported-provider","credentials":{"x":"y"}}')
echo "$FAIL_RESP" | node -e "let s=''; process.stdin.on('data', c => s += c); process.stdin.on('end', () => { const d = JSON.parse(s); if (d.success !== false) throw new Error('expected failure'); if (!d.message) throw new Error('missing message'); });"
request_page "/" /tmp/bw-v1-after-fail.html
request_page "/import" /tmp/bw-v1-import-after-fail.html

echo "[3/4] Integration exists, no transactions..."
curl -sS -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  -X POST "$BASE/api/setup/bank" \
  -d '{"provider":"oneZero","label":"Sandbox One Zero","credentials":{"email":"sandbox@example.com","password":"not-real","phoneNumber":"+972501234567"}}' \
  | node -e "let s=''; process.stdin.on('data', c => s += c); process.stdin.on('end', () => { const d = JSON.parse(s); if (!d.success || !d.credentialId) throw new Error('credential save failed'); });"
request_page "/" /tmp/bw-v1-integration-home.html
request_page "/import" /tmp/bw-v1-integration-import.html
request_page "/settings/bank" /tmp/bw-v1-integration-bank.html
grep -q "connected" /tmp/bw-v1-integration-bank.html

echo "[4/4] Primary navigation routes..."
for route in \
  "/" \
  "/transactions" \
  "/import" \
  "/import/history" \
  "/settings/bank" \
  "/reports" \
  "/reports/forecast" \
  "/settings/data"; do
  request_page "$route" "/tmp/bw-v1-route.html"
done

echo "=== V1 entry/navigation acceptance passed ==="
