-- Advisory forecast registry.
-- Stores user-confirmed and auto-detected recurring patterns.
-- Never affects actual transaction data or financial totals.
-- Only records with is_user_confirmed=1 enter primary forecast totals.
CREATE TABLE IF NOT EXISTS recurring_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  display_label TEXT NOT NULL,
  description_pattern TEXT NOT NULL,
  counterparty_pattern TEXT,
  direction TEXT NOT NULL DEFAULT 'expense'
    CHECK(direction IN ('income', 'expense')),
  business_unit TEXT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  financial_nature TEXT NOT NULL DEFAULT 'unknown',
  cash_flow_type TEXT NOT NULL DEFAULT 'unknown',
  pnl_impact TEXT NOT NULL DEFAULT 'maybe',
  expected_amount REAL,
  amount_min REAL,
  amount_max REAL,
  amount_variance REAL,
  frequency TEXT NOT NULL DEFAULT 'monthly'
    CHECK(frequency IN ('monthly', 'bimonthly', 'quarterly', 'annual', 'irregular')),
  expected_interval_months REAL,
  expected_day_of_month INTEGER CHECK(expected_day_of_month BETWEEN 1 AND 31),
  start_date TEXT,
  end_date TEXT,
  last_seen_date TEXT,
  source_type TEXT NOT NULL DEFAULT 'auto_detected'
    CHECK(source_type IN ('auto_detected', 'manual', 'installment', 'rule_derived')),
  confidence_score REAL,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_user_confirmed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_recurring_patterns_workspace
  ON recurring_patterns(workspace_id);
CREATE INDEX IF NOT EXISTS idx_recurring_patterns_active
  ON recurring_patterns(workspace_id, is_active, is_user_confirmed);
