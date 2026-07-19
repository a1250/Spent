#!/usr/bin/env bash
# qa-learning-policy.sh -- regression tests for the Phase 2P classification learning policy.
#
# ALL mutations run only against a sandbox copy of the DB (data/tmp/qa-*).
# The live DB at data/spent.db is NEVER modified.
#
# Usage:
#   ./scripts/qa-learning-policy.sh
#
# Requirements:
#   - sqlite3 in PATH
#   - npm / Node.js in PATH
#   - Port 3777 free

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LIVE_DB="$REPO_ROOT/data/spent.db"
APP_PORT=3777
APP_BASE="http://127.0.0.1:$APP_PORT"
APP_LOG="$(mktemp /tmp/qa-policy-app.XXXXXX.log)"
APP_PID=""
SANDBOX=""
PASS=0
FAIL=0

# ── Live DB baseline ─────────────────────────────────────────────────────────
# This script's job is to prove the live DB is untouched by the sandbox test
# run, not to enforce a fixed transaction count — real bank syncs grow the
# live DB over time. Baseline values are captured fresh from the live DB
# below (LIVE_*_BEFORE) and compared only against themselves after the run.

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

p()       { echo -e "  ${GREEN}PASS${NC}  $1"; PASS=$((PASS + 1)); }
f()       { echo -e "  ${RED}FAIL${NC}  $1"; FAIL=$((FAIL + 1)); }
info()    { echo -e "  ${CYAN}info${NC}  $1"; }
section() { echo -e "\n${BOLD}${YELLOW}── $1${NC}"; }

# ── Cleanup ───────────────────────────────────────────────────────────────────
cleanup() {
  if [ -n "$APP_PID" ] && kill -0 "$APP_PID" 2>/dev/null; then
    kill "$APP_PID" 2>/dev/null || true
    wait "$APP_PID" 2>/dev/null || true
  fi
  # Kill anything still holding our port
  lsof -ti:"$APP_PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true
  if [ -n "$SANDBOX" ] && [ -d "$SANDBOX" ]; then
    rm -rf "$SANDBOX"
    info "Sandbox removed: $SANDBOX"
  fi
  rm -f "$APP_LOG"
}
trap cleanup EXIT

# ── Helpers ───────────────────────────────────────────────────────────────────

# Escape a value for embedding inside a JSON string (backslash + double-quote)
json_esc() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

http_status() {
  local method="$1" url="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -s -o /dev/null -w "%{http_code}" \
      -X "$method" "$url" \
      -H "Content-Type: application/json" \
      -H "x-workspace-id: 1" \
      -H "Origin: $APP_BASE" \
      -d "$body"
  else
    curl -s -o /dev/null -w "%{http_code}" \
      -X "$method" "$url" \
      -H "x-workspace-id: 1" \
      -H "Origin: $APP_BASE"
  fi
}

http_body() {
  local method="$1" url="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -s -X "$method" "$url" \
      -H "Content-Type: application/json" \
      -H "x-workspace-id: 1" \
      -H "Origin: $APP_BASE" \
      -d "$body"
  else
    curl -s -X "$method" "$url" \
      -H "x-workspace-id: 1" \
      -H "Origin: $APP_BASE"
  fi
}

assert_status() {
  local label="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    p "$label → HTTP $actual"
  else
    f "$label → expected HTTP $expected, got HTTP $actual"
  fi
}

db()   { sqlite3 "$SANDBOX/spent.db" "$1"; }
live() { sqlite3 "$LIVE_DB" "$1"; }

# ── Pre-flight ────────────────────────────────────────────────────────────────
section "Pre-flight"

if lsof -ti:"$APP_PORT" > /dev/null 2>&1; then
  echo "ERROR: Port $APP_PORT is already in use." >&2
  exit 1
fi

if [ ! -f "$LIVE_DB" ]; then
  echo "ERROR: Live DB not found: $LIVE_DB" >&2
  exit 1
fi

LIVE_HASH_BEFORE=$(shasum -a 256 "$LIVE_DB" | awk '{print $1}')
info "Live DB hash: $LIVE_HASH_BEFORE"

LIVE_TOTAL_BEFORE=$(live    "SELECT COUNT(*) FROM transactions;")
LIVE_APPROVED_BEFORE=$(live "SELECT COUNT(*) FROM transactions WHERE classification_status='manually_approved';")
LIVE_REVIEW_BEFORE=$(live   "SELECT COUNT(*) FROM transactions WHERE classification_status='needs_review';")
LIVE_AUTO_BEFORE=$(live     "SELECT COUNT(*) FROM transactions WHERE classification_status='auto_classified';")
LIVE_USER_RULES_BEFORE=$(live   "SELECT COUNT(*) FROM classification_rules WHERE rule_source='user_approved' AND is_active=1;")
LIVE_LEGACY_RULES_BEFORE=$(live "SELECT COUNT(*) FROM classification_rules WHERE rule_source='legacy_index'  AND is_active=1;")

info "Live counts: total=$LIVE_TOTAL_BEFORE approved=$LIVE_APPROVED_BEFORE review=$LIVE_REVIEW_BEFORE auto=$LIVE_AUTO_BEFORE user_rules=$LIVE_USER_RULES_BEFORE legacy_rules=$LIVE_LEGACY_RULES_BEFORE"

# ── Sandbox setup ─────────────────────────────────────────────────────────────
section "Sandbox setup"

cd "$REPO_ROOT"
SANDBOX=$("$SCRIPT_DIR/qa-sandbox.sh")
export SPENT_DATA_DIR="$SANDBOX"
info "Sandbox: $SANDBOX"

"$SCRIPT_DIR/assert-qa-sandbox.sh"

# Resolve test data from sandbox DB
CAT_ID=$(db "SELECT id FROM categories ORDER BY id LIMIT 1;")
WORKSPACE_ID=$(db "SELECT id FROM workspaces LIMIT 1;")

# 5 ASCII-safe needs_review transactions with import_row_id, no embedded quotes
SAFE_FILTER="classification_status='needs_review'
  AND import_row_id IS NOT NULL
  AND counterparty GLOB '*[A-Z]*'
  AND counterparty NOT GLOB '*[\"]*'
  AND counterparty NOT GLOB '*['']*'"

TX_A=$(db "SELECT id FROM transactions WHERE $SAFE_FILTER ORDER BY id LIMIT 1 OFFSET 0;")
TX_B=$(db "SELECT id FROM transactions WHERE $SAFE_FILTER ORDER BY id LIMIT 1 OFFSET 1;")
TX_C=$(db "SELECT id FROM transactions WHERE $SAFE_FILTER ORDER BY id LIMIT 1 OFFSET 2;")
TX_D=$(db "SELECT id FROM transactions WHERE $SAFE_FILTER ORDER BY id LIMIT 1 OFFSET 3;")
TX_E=$(db "SELECT id FROM transactions WHERE $SAFE_FILTER ORDER BY id LIMIT 1 OFFSET 4;")

CP_A=$(db "SELECT counterparty FROM transactions WHERE id=$TX_A;")
CP_B=$(db "SELECT counterparty FROM transactions WHERE id=$TX_B;")
CP_C=$(db "SELECT counterparty FROM transactions WHERE id=$TX_C;")
CP_D=$(db "SELECT counterparty FROM transactions WHERE id=$TX_D;")

JCP_A=$(json_esc "$CP_A")
JCP_C=$(json_esc "$CP_C")
JCP_D=$(json_esc "$CP_D")

TX_A_BATCH=$(db "SELECT import_batch_id FROM transactions WHERE id=$TX_A;")

info "Workspace=$WORKSPACE_ID  CAT_ID=$CAT_ID"
info "TX_A=$TX_A ($CP_A) TX_B=$TX_B ($CP_B) TX_C=$TX_C ($CP_C) TX_D=$TX_D TX_E=$TX_E"
info "TX_A batch=$TX_A_BATCH"

# ── Start app ─────────────────────────────────────────────────────────────────
section "Starting app on port $APP_PORT"

# Use next start (production mode) rather than next dev to avoid the
# Turbopack single-instance lock that prevents a second dev server.
# Requires a prior 'npm run build'; check for the build artifact first.
if [ ! -f "$REPO_ROOT/.next/BUILD_ID" ]; then
  echo "ERROR: No production build found at .next/BUILD_ID." >&2
  echo "       Run 'npm run build' first, then re-run this script." >&2
  exit 1
fi

SPENT_DATA_DIR="$SANDBOX" \
  "$REPO_ROOT/node_modules/.bin/next" start -H 127.0.0.1 -p "$APP_PORT" \
  > "$APP_LOG" 2>&1 &
APP_PID=$!
info "App PID: $APP_PID  Log: $APP_LOG"

READY=0
for i in $(seq 1 45); do
  if curl -sf "$APP_BASE/api/categories" \
       -H "x-workspace-id: 1" > /dev/null 2>&1; then
    READY=1
    info "App ready after $((i * 2))s"
    break
  fi
  sleep 2
done

if [ "$READY" -eq 0 ]; then
  echo "ERROR: App did not start within 90s." >&2
  tail -30 "$APP_LOG" >&2
  exit 1
fi

# Capture sandbox rule baseline AFTER app starts (migrations may run on startup)
SANDBOX_USER_RULES_BASELINE=$(db "SELECT COUNT(*) FROM classification_rules WHERE rule_source='user_approved' AND is_active=1;")
info "Sandbox user_approved rules after startup: $SANDBOX_USER_RULES_BASELINE (live=$LIVE_USER_RULES_BEFORE)"

# ─────────────────────────────────────────────────────────────────────────────
# T1: keep_review leaves classification_status = needs_review, no rule created
# ─────────────────────────────────────────────────────────────────────────────
section "T1: keep_review → stays needs_review, no rule"

T1_STATUS=$(http_status PATCH "$APP_BASE/api/transactions/$TX_A" \
  "{\"learning\":{\"categoryId\":$CAT_ID,\"financialNature\":\"operating_expense\",\"cashFlowType\":\"real_cash_out\",\"pnlImpact\":\"yes\",\"businessUnit\":\"operations\",\"decision\":\"keep_review\",\"applyScope\":\"row\",\"saveAsRule\":false}}")
assert_status "T1 HTTP 200" 200 "$T1_STATUS"

T1_TX_STATUS=$(db "SELECT classification_status FROM transactions WHERE id=$TX_A;")
if [ "$T1_TX_STATUS" = "needs_review" ]; then
  p "T1 classification_status still needs_review"
else
  f "T1 classification_status changed to '$T1_TX_STATUS' (expected needs_review)"
fi

T1_RULES=$(db "SELECT COUNT(*) FROM classification_rules WHERE rule_source='user_approved' AND is_active=1;")
if [ "$T1_RULES" = "$SANDBOX_USER_RULES_BASELINE" ]; then
  p "T1 no new rule created"
else
  f "T1 rule count changed (baseline=$SANDBOX_USER_RULES_BASELINE, now $T1_RULES)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# T2: keep_review + batch_similar → rejected
# ─────────────────────────────────────────────────────────────────────────────
section "T2: keep_review + batch_similar → 400"

T2_STATUS=$(http_status PATCH "$APP_BASE/api/transactions/$TX_A" \
  "{\"learning\":{\"categoryId\":$CAT_ID,\"financialNature\":\"operating_expense\",\"cashFlowType\":\"real_cash_out\",\"pnlImpact\":\"yes\",\"businessUnit\":\"operations\",\"decision\":\"keep_review\",\"applyScope\":\"batch_similar\",\"saveAsRule\":false}}")
assert_status "T2 keep_review+batch_similar rejected" 400 "$T2_STATUS"

# ─────────────────────────────────────────────────────────────────────────────
# T3: keep_review + saveAsRule → rejected
# ─────────────────────────────────────────────────────────────────────────────
section "T3: keep_review + saveAsRule → 400"

T3_STATUS=$(http_status PATCH "$APP_BASE/api/transactions/$TX_A" \
  "{\"learning\":{\"categoryId\":$CAT_ID,\"financialNature\":\"operating_expense\",\"cashFlowType\":\"real_cash_out\",\"pnlImpact\":\"yes\",\"businessUnit\":\"operations\",\"decision\":\"keep_review\",\"applyScope\":\"row\",\"saveAsRule\":true,\"ruleMatchType\":\"exact_merchant\",\"ruleMatchValue\":\"$JCP_A\"}}")
assert_status "T3 keep_review+saveAsRule rejected" 400 "$T3_STATUS"

# ─────────────────────────────────────────────────────────────────────────────
# T4: Approval validation – each missing field individually rejected
# ─────────────────────────────────────────────────────────────────────────────
section "T4: Approval validation failures"

# T4a: categoryId null
T4A=$(http_status PATCH "$APP_BASE/api/transactions/$TX_A" \
  "{\"learning\":{\"categoryId\":null,\"financialNature\":\"operating_expense\",\"cashFlowType\":\"real_cash_out\",\"pnlImpact\":\"yes\",\"businessUnit\":\"operations\",\"decision\":\"approve\",\"applyScope\":\"row\",\"saveAsRule\":false}}")
assert_status "T4a no category → 400" 400 "$T4A"

# T4b: financialNature=unknown
T4B=$(http_status PATCH "$APP_BASE/api/transactions/$TX_A" \
  "{\"learning\":{\"categoryId\":$CAT_ID,\"financialNature\":\"unknown\",\"cashFlowType\":\"real_cash_out\",\"pnlImpact\":\"yes\",\"businessUnit\":\"operations\",\"decision\":\"approve\",\"applyScope\":\"row\",\"saveAsRule\":false}}")
assert_status "T4b unknown financialNature → 400" 400 "$T4B"

# T4c: cashFlowType=unknown
T4C=$(http_status PATCH "$APP_BASE/api/transactions/$TX_A" \
  "{\"learning\":{\"categoryId\":$CAT_ID,\"financialNature\":\"operating_expense\",\"cashFlowType\":\"unknown\",\"pnlImpact\":\"yes\",\"businessUnit\":\"operations\",\"decision\":\"approve\",\"applyScope\":\"row\",\"saveAsRule\":false}}")
assert_status "T4c unknown cashFlowType → 400" 400 "$T4C"

# T4d: businessUnit=unknown
T4D=$(http_status PATCH "$APP_BASE/api/transactions/$TX_A" \
  "{\"learning\":{\"categoryId\":$CAT_ID,\"financialNature\":\"operating_expense\",\"cashFlowType\":\"real_cash_out\",\"pnlImpact\":\"yes\",\"businessUnit\":\"unknown\",\"decision\":\"approve\",\"applyScope\":\"row\",\"saveAsRule\":false}}")
assert_status "T4d unknown businessUnit → 400" 400 "$T4D"

# ─────────────────────────────────────────────────────────────────────────────
# T5: businessUnit=other requires explicit confirmation
# ─────────────────────────────────────────────────────────────────────────────
section "T5: businessUnit=other confirmation"

# T5a: other, no otherBusinessConfirmed → 400
T5A=$(http_status PATCH "$APP_BASE/api/transactions/$TX_A" \
  "{\"learning\":{\"categoryId\":$CAT_ID,\"financialNature\":\"operating_expense\",\"cashFlowType\":\"real_cash_out\",\"pnlImpact\":\"yes\",\"businessUnit\":\"other\",\"decision\":\"approve\",\"applyScope\":\"row\",\"saveAsRule\":false}}")
assert_status "T5a other BU without confirm → 400" 400 "$T5A"

# T5b: other + otherBusinessConfirmed=true → 200 (TX_B, destructive)
T5B=$(http_status PATCH "$APP_BASE/api/transactions/$TX_B" \
  "{\"learning\":{\"categoryId\":$CAT_ID,\"financialNature\":\"operating_expense\",\"cashFlowType\":\"real_cash_out\",\"pnlImpact\":\"yes\",\"businessUnit\":\"other\",\"otherBusinessConfirmed\":true,\"decision\":\"approve\",\"applyScope\":\"row\",\"saveAsRule\":false}}")
assert_status "T5b other BU + confirm → 200" 200 "$T5B"

T5B_ST=$(db "SELECT classification_status FROM transactions WHERE id=$TX_B;")
if [ "$T5B_ST" = "manually_approved" ]; then
  p "T5b TX_B is manually_approved in sandbox"
else
  f "T5b TX_B status='$T5B_ST' (expected manually_approved)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# T6: saveAsRule validation
# ─────────────────────────────────────────────────────────────────────────────
section "T6: saveAsRule validation"

# T6a: saveAsRule without ruleMatchType → 400
T6A=$(http_status PATCH "$APP_BASE/api/transactions/$TX_A" \
  "{\"learning\":{\"categoryId\":$CAT_ID,\"financialNature\":\"operating_expense\",\"cashFlowType\":\"real_cash_out\",\"pnlImpact\":\"yes\",\"businessUnit\":\"operations\",\"decision\":\"approve\",\"applyScope\":\"row\",\"saveAsRule\":true}}")
assert_status "T6a saveAsRule no matchType → 400" 400 "$T6A"

# T6b: saveAsRule with matchType but no ruleMatchValue → 400
T6B=$(http_status PATCH "$APP_BASE/api/transactions/$TX_A" \
  "{\"learning\":{\"categoryId\":$CAT_ID,\"financialNature\":\"operating_expense\",\"cashFlowType\":\"real_cash_out\",\"pnlImpact\":\"yes\",\"businessUnit\":\"operations\",\"decision\":\"approve\",\"applyScope\":\"row\",\"saveAsRule\":true,\"ruleMatchType\":\"merchant_contains\"}}")
assert_status "T6b saveAsRule no matchValue → 400" 400 "$T6B"

# T6c: valid non-risky rule (merchant_contains, TX_C, destructive)
# merchant_contains is not in the exact/counterparty risky list and CP_C is safe
SANDBOX_RULES_BEFORE=$(db "SELECT COUNT(*) FROM classification_rules WHERE rule_source='user_approved' AND is_active=1;")
# SANDBOX_RULES_BEFORE is captured just before T6c runs (after T1-T5 which create no rules)

T6C=$(http_status PATCH "$APP_BASE/api/transactions/$TX_C" \
  "{\"learning\":{\"categoryId\":$CAT_ID,\"financialNature\":\"operating_expense\",\"cashFlowType\":\"real_cash_out\",\"pnlImpact\":\"yes\",\"businessUnit\":\"operations\",\"decision\":\"approve\",\"applyScope\":\"row\",\"saveAsRule\":true,\"ruleMatchType\":\"merchant_contains\",\"ruleMatchValue\":\"$JCP_C\"}}")
assert_status "T6c non-risky rule → 200" 200 "$T6C"

SANDBOX_RULES_AFTER=$(db "SELECT COUNT(*) FROM classification_rules WHERE rule_source='user_approved' AND is_active=1;")
if [ "$SANDBOX_RULES_AFTER" -gt "$SANDBOX_RULES_BEFORE" ]; then
  NEW_RULE=$(db "SELECT rule_source||'|'||match_field||'|'||match_type||'|'||match_value FROM classification_rules WHERE rule_source='user_approved' ORDER BY id DESC LIMIT 1;")
  p "T6c rule created in sandbox: $NEW_RULE"
else
  f "T6c no rule created (before=$SANDBOX_RULES_BEFORE after=$SANDBOX_RULES_AFTER)"
fi

# Confirm live DB did NOT get this rule
LIVE_RULES_AFTER_T6C=$(live "SELECT COUNT(*) FROM classification_rules WHERE rule_source='user_approved' AND is_active=1;")
if [ "$LIVE_RULES_AFTER_T6C" = "$LIVE_USER_RULES_BEFORE" ]; then
  p "T6c live user_approved rules unchanged ($LIVE_RULES_AFTER_T6C)"
else
  f "T6c live rule count changed: $LIVE_USER_RULES_BEFORE → $LIVE_RULES_AFTER_T6C"
fi

# ─────────────────────────────────────────────────────────────────────────────
# T7: Risky rule requires explicit acknowledgement
# exact_merchant / exact_counterparty are always flagged as risky
# ─────────────────────────────────────────────────────────────────────────────
section "T7: Risky rule acknowledgement"

# T7a: exact_merchant without riskyRuleAcknowledged → 400
T7A=$(http_status PATCH "$APP_BASE/api/transactions/$TX_A" \
  "{\"learning\":{\"categoryId\":$CAT_ID,\"financialNature\":\"operating_expense\",\"cashFlowType\":\"real_cash_out\",\"pnlImpact\":\"yes\",\"businessUnit\":\"operations\",\"decision\":\"approve\",\"applyScope\":\"row\",\"saveAsRule\":true,\"ruleMatchType\":\"exact_merchant\",\"ruleMatchValue\":\"$JCP_A\"}}")
assert_status "T7a exact_merchant no ack → 400" 400 "$T7A"

# T7b: exact_merchant + riskyRuleAcknowledged=true → 200 (TX_D, destructive)
T7B=$(http_status PATCH "$APP_BASE/api/transactions/$TX_D" \
  "{\"learning\":{\"categoryId\":$CAT_ID,\"financialNature\":\"operating_expense\",\"cashFlowType\":\"real_cash_out\",\"pnlImpact\":\"yes\",\"businessUnit\":\"operations\",\"decision\":\"approve\",\"applyScope\":\"row\",\"saveAsRule\":true,\"ruleMatchType\":\"exact_merchant\",\"ruleMatchValue\":\"$JCP_D\",\"riskyRuleAcknowledged\":true}}")
assert_status "T7b exact_merchant + ack → 200" 200 "$T7B"

T7B_RULE=$(db "SELECT COUNT(*) FROM classification_rules WHERE rule_source='user_approved' AND match_type='exact' AND match_field='counterparty' AND is_active=1;")
if [ "$T7B_RULE" -gt 0 ]; then
  p "T7b exact counterparty rule created in sandbox"
else
  f "T7b exact counterparty rule not found in sandbox"
fi

# ─────────────────────────────────────────────────────────────────────────────
# T8: source_category matcher never falls back to legacy_category
# TX_E has legacy_category but source_category IS NULL → reject with 400
# ─────────────────────────────────────────────────────────────────────────────
section "T8: source_category isolation (no legacy_category fallback)"

TX_E_SRC=$(db "SELECT COALESCE(r.source_category, 'NULL') FROM transactions t LEFT JOIN import_rows r ON r.id=t.import_row_id WHERE t.id=$TX_E;")
TX_E_LEG=$(db "SELECT COALESCE(r.legacy_category, 'NULL') FROM transactions t LEFT JOIN import_rows r ON r.id=t.import_row_id WHERE t.id=$TX_E;")
info "TX_E ($TX_E) source_category=$TX_E_SRC  legacy_category=$TX_E_LEG"

if [ "$TX_E_SRC" = "NULL" ]; then
  p "T8 precondition: TX_E has no source_category (only legacy_category)"
else
  f "T8 precondition: TX_E unexpectedly has source_category='$TX_E_SRC' – test may not be valid"
fi

T8=$(http_status PATCH "$APP_BASE/api/transactions/$TX_E" \
  "{\"learning\":{\"categoryId\":$CAT_ID,\"financialNature\":\"operating_expense\",\"cashFlowType\":\"real_cash_out\",\"pnlImpact\":\"yes\",\"businessUnit\":\"operations\",\"decision\":\"approve\",\"applyScope\":\"row\",\"saveAsRule\":true,\"ruleMatchType\":\"source_category\",\"ruleMatchValue\":\"anything\"}}")
assert_status "T8 source_category on null → 400" 400 "$T8"

# ─────────────────────────────────────────────────────────────────────────────
# T9: Legacy approval paths are disabled
# ─────────────────────────────────────────────────────────────────────────────
section "T9: Legacy approve paths blocked"

T9A=$(http_status PUT "$APP_BASE/api/transactions/$TX_A" '{"categoryId":1}')
assert_status "T9a PUT /api/transactions/{id} → 400" 400 "$T9A"

T9B=$(http_status PATCH "$APP_BASE/api/transactions/$TX_A" '{"approve":true,"categoryId":1}')
assert_status "T9b PATCH approve:true → 400" 400 "$T9B"

# ─────────────────────────────────────────────────────────────────────────────
# T10: batch_similar scope applies only within the import batch
# TX_A (STOLERO) has 3 sibling import rows in the same batch – all should update
# ─────────────────────────────────────────────────────────────────────────────
section "T10: batch_similar scope (sandbox only)"

BEFORE_APPROVED_BATCH=$(db "SELECT COUNT(*) FROM transactions WHERE import_batch_id=$TX_A_BATCH AND classification_status='manually_approved';")
BEFORE_MATCHING_REVIEW=$(db "SELECT COUNT(*) FROM transactions WHERE import_batch_id=$TX_A_BATCH AND classification_status='needs_review' AND counterparty='$CP_A';")
info "Batch $TX_A_BATCH: approved_before=$BEFORE_APPROVED_BATCH  matching_needs_review=$BEFORE_MATCHING_REVIEW"

T10_RESP=$(http_body PATCH "$APP_BASE/api/transactions/$TX_A" \
  "{\"learning\":{\"categoryId\":$CAT_ID,\"financialNature\":\"operating_expense\",\"cashFlowType\":\"real_cash_out\",\"pnlImpact\":\"yes\",\"businessUnit\":\"operations\",\"decision\":\"approve\",\"applyScope\":\"batch_similar\",\"saveAsRule\":false,\"ruleMatchType\":\"merchant_contains\",\"ruleMatchValue\":\"$JCP_A\"}}")
T10_STATUS=$(http_status PATCH "$APP_BASE/api/transactions/$TX_A" \
  "{\"learning\":{\"categoryId\":$CAT_ID,\"financialNature\":\"operating_expense\",\"cashFlowType\":\"real_cash_out\",\"pnlImpact\":\"yes\",\"businessUnit\":\"operations\",\"decision\":\"approve\",\"applyScope\":\"batch_similar\",\"saveAsRule\":false,\"ruleMatchType\":\"merchant_contains\",\"ruleMatchValue\":\"$JCP_A\"}}")
# Note: second call is idempotent (rows already manually_approved)
assert_status "T10 batch_similar → 200" 200 "$T10_STATUS"

AFFECTED=$(echo "$T10_RESP" | grep -o '"affectedRows":[0-9]*' | grep -o '[0-9]*' || echo "0")
info "T10 first call affectedRows: $AFFECTED"
if [ "${AFFECTED:-0}" -ge 1 ] 2>/dev/null; then
  p "T10 batch_similar affected $AFFECTED rows in sandbox"
else
  f "T10 batch_similar response: $T10_RESP"
fi

AFTER_APPROVED_BATCH=$(db "SELECT COUNT(*) FROM transactions WHERE import_batch_id=$TX_A_BATCH AND classification_status='manually_approved';")
BATCH_GAINED=$((AFTER_APPROVED_BATCH - BEFORE_APPROVED_BATCH))
info "Batch $TX_A_BATCH: approved_after=$AFTER_APPROVED_BATCH (gained $BATCH_GAINED)"

# Live DB must not have changed during this entire test run
LIVE_APPROVED_NOW=$(live "SELECT COUNT(*) FROM transactions WHERE classification_status='manually_approved';")
if [ "$LIVE_APPROVED_NOW" = "$LIVE_APPROVED_BEFORE" ]; then
  p "T10 live manually_approved count unchanged ($LIVE_APPROVED_NOW)"
else
  f "T10 live manually_approved changed: $LIVE_APPROVED_BEFORE → $LIVE_APPROVED_NOW"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Live DB integrity
# ─────────────────────────────────────────────────────────────────────────────
section "Live DB integrity"

INTEGRITY=$(sqlite3 "$LIVE_DB" "PRAGMA integrity_check;" 2>&1)
if echo "$INTEGRITY" | grep -q "^ok$"; then
  p "Live DB integrity_check ok"
else
  f "Live DB integrity_check: $INTEGRITY"
fi

FK_VIOLATIONS=$(sqlite3 "$LIVE_DB" "PRAGMA foreign_key_check;" 2>&1 | wc -l | tr -d ' ')
if [ "$FK_VIOLATIONS" = "0" ]; then
  p "Live DB foreign_key_check clean"
else
  f "Live DB foreign_key_check: $FK_VIOLATIONS violation(s)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Live DB hash + count assertions
# ─────────────────────────────────────────────────────────────────────────────
section "Live DB safety"

LIVE_HASH_AFTER=$(shasum -a 256 "$LIVE_DB" | awk '{print $1}')
if [ "$LIVE_HASH_BEFORE" = "$LIVE_HASH_AFTER" ]; then
  p "Live DB hash unchanged: $LIVE_HASH_AFTER"
else
  f "Live DB HASH CHANGED  before=$LIVE_HASH_BEFORE  after=$LIVE_HASH_AFTER"
fi

count_check() {
  local label="$1" before="$2" after="$3"
  if [ "$before" = "$after" ]; then
    p "Live $label unchanged ($after)"
  else
    f "Live $label changed: $before → $after"
  fi
}

LIVE_TOTAL_AFTER=$(live    "SELECT COUNT(*) FROM transactions;")
LIVE_APPROVED_AFTER=$(live "SELECT COUNT(*) FROM transactions WHERE classification_status='manually_approved';")
LIVE_REVIEW_AFTER=$(live   "SELECT COUNT(*) FROM transactions WHERE classification_status='needs_review';")
LIVE_AUTO_AFTER=$(live     "SELECT COUNT(*) FROM transactions WHERE classification_status='auto_classified';")
LIVE_USER_RULES_AFTER=$(live   "SELECT COUNT(*) FROM classification_rules WHERE rule_source='user_approved' AND is_active=1;")
LIVE_LEGACY_RULES_AFTER=$(live "SELECT COUNT(*) FROM classification_rules WHERE rule_source='legacy_index'  AND is_active=1;")

count_check "total transactions"  "$LIVE_TOTAL_BEFORE"        "$LIVE_TOTAL_AFTER"
count_check "manually_approved"   "$LIVE_APPROVED_BEFORE"     "$LIVE_APPROVED_AFTER"
count_check "needs_review"        "$LIVE_REVIEW_BEFORE"       "$LIVE_REVIEW_AFTER"
count_check "auto_classified"     "$LIVE_AUTO_BEFORE"         "$LIVE_AUTO_AFTER"
count_check "user_approved rules" "$LIVE_USER_RULES_BEFORE"   "$LIVE_USER_RULES_AFTER"
count_check "legacy_index rules"  "$LIVE_LEGACY_RULES_BEFORE" "$LIVE_LEGACY_RULES_AFTER"

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
section "Summary"
echo ""
echo -e "  ${BOLD}PASS: ${GREEN}$PASS${NC}   ${BOLD}FAIL: ${RED}$FAIL${NC}"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo -e "  ${GREEN}${BOLD}All $PASS tests passed.${NC}"
  exit 0
else
  echo -e "  ${RED}${BOLD}$FAIL test(s) failed.${NC}"
  exit 1
fi
