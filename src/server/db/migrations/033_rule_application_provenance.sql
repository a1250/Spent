-- Tracks the primary user-approved rule that auto-classified an import row.
-- Existing rows are intentionally not backfilled; all new columns remain NULL
-- until a future import is auto-classified by a user-approved rule.

ALTER TABLE import_rows ADD COLUMN applied_rule_id INTEGER
  REFERENCES classification_rules(id) ON DELETE SET NULL;
ALTER TABLE import_rows ADD COLUMN applied_rule_confidence REAL
  CHECK (
    applied_rule_confidence IS NULL
    OR (applied_rule_confidence >= 0 AND applied_rule_confidence <= 1)
  );
ALTER TABLE import_rows ADD COLUMN applied_rule_at TEXT;
ALTER TABLE import_rows ADD COLUMN applied_rule_source TEXT;

CREATE INDEX idx_import_rows_applied_rule
  ON import_rows(applied_rule_id)
  WHERE applied_rule_id IS NOT NULL;
