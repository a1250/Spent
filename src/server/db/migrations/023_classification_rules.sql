-- Persistent classification rules used by the rules engine before AI runs.
--
-- Rules are created from three sources:
--   'seed'  - imported from legacy Excel index files (one-time bootstrap)
--   'user'  - created or confirmed by the user when correcting a row
--   'ai'    - suggested by the AI and approved by the user
--
-- The engine evaluates rules in ascending priority order (lower = first).
-- A matching rule boosts confidence_score and fills classification fields.
-- Rows matched with confidence >= threshold skip the AI call entirely.
CREATE TABLE classification_rules (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- ── Match definition ──────────────────────────────────────────────────────
  match_field TEXT NOT NULL,
  -- 'description' | 'counterparty' | 'account' | 'amount_range'

  match_type TEXT NOT NULL,
  -- 'exact' | 'contains' | 'starts_with' | 'regex'

  match_value TEXT NOT NULL,
  -- The string or pattern to test against match_field.
  -- For 'amount_range': JSON {"min": 0, "max": 500}

  -- ── Fields to assign on match ─────────────────────────────────────────────
  -- Any of these may be NULL, meaning the rule does not set that field.
  financial_nature TEXT,
  cash_flow_type   TEXT,
  pnl_impact       TEXT,
  category_id      INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  direction        TEXT,
  business_unit    TEXT,

  -- ── Rule behaviour ─────────────────────────────────────────────────────────
  -- Lower priority number = evaluated first. Seed rules default to 100;
  -- user rules default to 50 so they override seed rules.
  priority         INTEGER NOT NULL DEFAULT 100,
  times_applied    INTEGER NOT NULL DEFAULT 0,
  -- Added to confidence_score when this rule fires.
  confidence_boost REAL    NOT NULL DEFAULT 0.2,
  is_active        INTEGER NOT NULL DEFAULT 1,

  created_from TEXT NOT NULL DEFAULT 'user',
  -- 'seed' | 'user' | 'ai'

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Primary access pattern: all active rules for a workspace, ordered for engine.
CREATE INDEX idx_classification_rules_engine
  ON classification_rules(workspace_id, is_active, priority)
  WHERE is_active = 1;

-- Secondary access pattern: management UI lists rules by field + type.
CREATE INDEX idx_classification_rules_field
  ON classification_rules(workspace_id, match_field, match_type);
