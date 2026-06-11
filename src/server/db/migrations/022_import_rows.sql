-- Staging table for rows parsed from an import file.
--
-- Rows are NEVER deleted after commit. Once a transaction is created from a
-- row, import_status becomes 'imported' and transaction_id is set. This
-- gives a permanent audit trail: any transaction can be traced back to the
-- exact source file and row number it came from.
--
-- The table is split into three logical layers per row:
--   1. Raw    - byte-for-byte values from the source file
--   2. Normal - cleaned, typed values ready for the app
--   3. Class  - financial meaning assigned by rules / AI / user
CREATE TABLE import_rows (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id     INTEGER NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id)     ON DELETE CASCADE,

  -- ── 1. Raw layer ───────────────────────────────────────────────────────────
  raw_row_number  INTEGER NOT NULL,
  raw_date        TEXT,
  raw_amount      TEXT,
  raw_description TEXT,
  raw_account     TEXT,
  raw_balance     TEXT,
  -- Any extra columns not mapped explicitly, stored as a JSON object.
  raw_metadata TEXT,

  -- ── 2. Normalised layer ────────────────────────────────────────────────────
  date             TEXT,   -- ISO 8601
  amount           REAL,   -- positive = income, negative = expense
  direction        TEXT,   -- 'income' | 'expense' | 'transfer' | 'unknown'
  account          TEXT,
  counterparty     TEXT,
  clean_description TEXT,
  category_id      INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  business_unit    TEXT,   -- 'personal' | 'business' | 'investment'

  -- ── 3. Classification layer ────────────────────────────────────────────────
  financial_nature TEXT NOT NULL DEFAULT 'unknown',
  cash_flow_type   TEXT NOT NULL DEFAULT 'unknown',
  pnl_impact       TEXT NOT NULL DEFAULT 'maybe',

  classification_status TEXT NOT NULL DEFAULT 'needs_review',
  -- 0.0 = no confidence, 1.0 = certain. NULL until classification runs.
  confidence_score REAL,
  ai_explanation   TEXT,

  -- ── Duplicate detection ────────────────────────────────────────────────────
  -- sha256(date || amount || description) computed during normalisation.
  dedup_hash                   TEXT,
  is_duplicate                 INTEGER NOT NULL DEFAULT 0,
  -- Points to the existing transaction this row duplicates, if any.
  duplicate_of_transaction_id  INTEGER REFERENCES transactions(id) ON DELETE SET NULL,

  -- ── Pipeline status ────────────────────────────────────────────────────────
  import_status TEXT NOT NULL DEFAULT 'pending',
  -- Set on commit, never changes afterwards (permanent audit link).
  transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Batch-scoped lookups used by the review UI and the commit step.
CREATE INDEX idx_import_rows_batch_status
  ON import_rows(batch_id, import_status);

-- Date-range queries per workspace (e.g. duplicate detection window).
CREATE INDEX idx_import_rows_workspace_date
  ON import_rows(workspace_id, date);

-- Fast hash lookup during dedup check.
CREATE INDEX idx_import_rows_dedup_hash
  ON import_rows(dedup_hash);

-- Review-screen filter: show only rows that need attention.
CREATE INDEX idx_import_rows_needs_review
  ON import_rows(batch_id, classification_status);
