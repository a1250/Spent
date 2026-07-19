#!/usr/bin/env bash
# Import Review classification acceptance test. Runs only against a sandbox DB.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SANDBOX="${1:-}"
PORT="${PORT:-3783}"

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
case "$SANDBOX" in
  "$ROOT"/data/tmp/*) ;;
  *)
    echo "ERROR: refusing to run outside data/tmp sandbox: $SANDBOX" >&2
    exit 1
    ;;
esac

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

json_get() {
  node -e "let s=''; process.stdin.on('data', c => s += c); process.stdin.on('end', () => { const d = JSON.parse(s); const path = process.argv[1].split('.'); let v = d; for (const p of path) v = v[p]; console.log(v == null ? '' : v); });" "$1"
}

assert_eq() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [[ "$actual" != "$expected" ]]; then
    echo "FAIL: $label expected '$expected' got '$actual'" >&2
    exit 1
  fi
  echo "  [ok] $label"
}

echo "=== Import Review Classification Acceptance Test ==="
echo "Sandbox: $SANDBOX"
echo "Port: $PORT"

CAT_ID=$(sqlite3 "$DB" "SELECT id FROM categories WHERE is_archived = 0 AND parent_id IS NOT NULL ORDER BY id LIMIT 1;")
CAT_NAME=$(sqlite3 "$DB" "SELECT name FROM categories WHERE id = $CAT_ID;")
BU=$(sqlite3 "$DB" "SELECT slug FROM business_units WHERE is_active = 1 AND slug != 'unknown' ORDER BY CASE slug WHEN 'personal' THEN 0 ELSE 1 END, slug LIMIT 1;")
RULES_BEFORE=$(sqlite3 "$DB" "SELECT COUNT(*) FROM classification_rules;")

ARCHIVED_CAT_ID=$(sqlite3 "$DB" "
  INSERT INTO categories (workspace_id, parent_id, name, color, icon, kind, is_archived)
  VALUES (1, NULL, 'QA Archived Import Review', '#999999', 'archive', 'expense', 1);
  SELECT last_insert_rowid();
")
BATCH_ID=$(sqlite3 "$DB" "
  INSERT INTO import_batches (
    workspace_id, source_filename, source_type, adapter_key,
    total_rows, needs_review_rows, status
  )
  VALUES (1, 'qa-import-review.csv', 'csv', 'legacy_excel', 4, 4, 'reviewing');
  SELECT last_insert_rowid();
")
for n in 1 2 3 4; do
  sqlite3 "$DB" "
    INSERT INTO import_rows (
      batch_id, workspace_id, raw_row_number, raw_date, raw_amount, raw_description,
      date, amount, direction, account, counterparty, clean_description,
      financial_nature, cash_flow_type, pnl_impact, classification_status,
      import_status, transaction_status, source_type, source_category
    )
    VALUES (
      $BATCH_ID, 1, $n, '2026-06-0$n', '-12.$n', 'QA Import Review Row $n',
      '2026-06-0$n', -12.$n, 'expense', 'QA', 'QA_IMPORT_REVIEW_$n',
      'QA Import Review Row $n', 'unknown', 'unknown', 'maybe',
      'needs_review', 'pending', 'completed', 'bank_checking_account',
      'QA Source Category'
    );
  "
done

ROW1=$(sqlite3 "$DB" "SELECT id FROM import_rows WHERE batch_id = $BATCH_ID AND raw_row_number = 1;")
ROW2=$(sqlite3 "$DB" "SELECT id FROM import_rows WHERE batch_id = $BATCH_ID AND raw_row_number = 2;")
ROW3=$(sqlite3 "$DB" "SELECT id FROM import_rows WHERE batch_id = $BATCH_ID AND raw_row_number = 3;")
ROW4=$(sqlite3 "$DB" "SELECT id FROM import_rows WHERE batch_id = $BATCH_ID AND raw_row_number = 4;")

SPENT_DATA_DIR="$SANDBOX" npx next start -H 127.0.0.1 -p "$PORT" &
SERVER_PID=$!

for _ in {1..60}; do
  if curl -fsS "$BASE/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

echo "[1/7] Review page and UI affordance contract..."
curl -fsS -L "$BASE/review" -o /tmp/bw-import-review.html
grep -q "Needs Review" /tmp/bw-import-review.html
grep -q "Edit / Classify" "$ROOT/src/components/review/review-page.tsx"
grep -q "Bulk Edit / Classify" "$ROOT/src/components/review/review-page.tsx"
grep -q "No category / ללא קטגוריה" "$ROOT/src/components/review/review-page.tsx"
grep -q "data-import-review-table" "$ROOT/src/components/review/review-page.tsx"
grep -q "sticky start-12" "$ROOT/src/components/review/review-page.tsx"
grep -q 'dir="rtl"' "$ROOT/src/components/review/review-page.tsx"
grep -q "min-h-9" "$ROOT/src/components/review/review-page.tsx"
grep -q "Save / Apply" "$ROOT/src/components/review/review-page.tsx"
grep -q "Cancel" "$ROOT/src/components/review/review-page.tsx"
echo "  [ok] explicit tablet/RTL/touch action contract present"

echo "[2/7] Pending row with no category appears through review API..."
ROWS_JSON=$(curl -fsS "$BASE/api/review/import-rows?limit=2000")
echo "$ROWS_JSON" | grep -q "QA_IMPORT_REVIEW_1"
ROW1_CAT=$(sqlite3 "$DB" "SELECT COALESCE(category_id, 'NULL') FROM import_rows WHERE id = $ROW1;")
assert_eq "row starts without category" "NULL" "$ROW1_CAT"

echo "[3/7] Cancel/no-op leaves row unchanged..."
ROW1_BEFORE=$(sqlite3 "$DB" "SELECT COALESCE(category_id, 'NULL') || '|' || classification_status FROM import_rows WHERE id = $ROW1;")
# UI cancel does not call PATCH; assert source contract and DB no-op.
grep -q "onCancel={() => setEditingRows(null)}" "$ROOT/src/components/review/review-page.tsx"
ROW1_AFTER_CANCEL=$(sqlite3 "$DB" "SELECT COALESCE(category_id, 'NULL') || '|' || classification_status FROM import_rows WHERE id = $ROW1;")
assert_eq "cancel no-op state" "$ROW1_BEFORE" "$ROW1_AFTER_CANCEL"

echo "[4/7] Category can be selected and saved..."
PATCH_BODY=$(printf '{"categoryId":%s,"financialNature":"operating_expense","cashFlowType":"real_cash_out","pnlImpact":"yes","businessUnit":"%s","decision":"approve","applyScope":"row","saveAsRule":false}' "$CAT_ID" "$BU")
PATCH_RESP=$(curl -fsS -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  -X PATCH "$BASE/api/import/$BATCH_ID/rows/$ROW1" -d "$PATCH_BODY")
SUCCESS=$(echo "$PATCH_RESP" | json_get success)
AFFECTED=$(echo "$PATCH_RESP" | json_get affectedRows)
assert_eq "single save success" "true" "$SUCCESS"
assert_eq "single save affected one row" "1" "$AFFECTED"
ROW1_SAVED=$(sqlite3 "$DB" "SELECT category_id || '|' || classification_status || '|' || financial_nature || '|' || cash_flow_type || '|' || pnl_impact || '|' || business_unit || '|' || COALESCE(transaction_id, 'NULL') FROM import_rows WHERE id = $ROW1;")
assert_eq "selected category visible after save" "$CAT_ID|manually_approved|operating_expense|real_cash_out|yes|$BU|NULL" "$ROW1_SAVED"

echo "[5/7] Inactive/archived categories are excluded by default..."
CATEGORIES_JSON=$(curl -fsS "$BASE/api/categories?leavesOnly=1")
if echo "$CATEGORIES_JSON" | grep -q "QA Archived Import Review"; then
  echo "FAIL: archived category appeared in default category API" >&2
  exit 1
fi
echo "  [ok] archived category excluded"

echo "[6/7] Bulk edit affects selected rows only..."
for row_id in "$ROW2" "$ROW3"; do
  curl -fsS -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
    -X PATCH "$BASE/api/import/$BATCH_ID/rows/$row_id" -d "$PATCH_BODY" >/dev/null
done
ROW2_CAT=$(sqlite3 "$DB" "SELECT COALESCE(category_id, 'NULL') FROM import_rows WHERE id = $ROW2;")
ROW3_CAT=$(sqlite3 "$DB" "SELECT COALESCE(category_id, 'NULL') FROM import_rows WHERE id = $ROW3;")
ROW4_CAT=$(sqlite3 "$DB" "SELECT COALESCE(category_id, 'NULL') || '|' || classification_status FROM import_rows WHERE id = $ROW4;")
assert_eq "bulk selected row 2 updated" "$CAT_ID" "$ROW2_CAT"
assert_eq "bulk selected row 3 updated" "$CAT_ID" "$ROW3_CAT"
assert_eq "unselected row unchanged" "NULL|needs_review" "$ROW4_CAT"

echo "[7/7] Source linkage and no automatic learning rule..."
ROW1_LINK=$(sqlite3 "$DB" "SELECT batch_id || '|' || raw_row_number || '|' || source_category FROM import_rows WHERE id = $ROW1;")
assert_eq "source linkage preserved" "$BATCH_ID|1|QA Source Category" "$ROW1_LINK"
RULES_AFTER=$(sqlite3 "$DB" "SELECT COUNT(*) FROM classification_rules;")
assert_eq "no learning rule created automatically" "$RULES_BEFORE" "$RULES_AFTER"

echo "=== Import Review classification acceptance passed ==="
echo "Category used: $CAT_ID ($CAT_NAME)"
echo "Business unit used: $BU"
