-- Provenance for explicit learning rules created from manual corrections.
-- `created_from` remains for backward compatibility with the existing engine:
-- seed rules use `seed`, while explicit user-approved rules use `user`.
ALTER TABLE classification_rules ADD COLUMN rule_source TEXT;
ALTER TABLE classification_rules ADD COLUMN created_from_import_row_id INTEGER
  REFERENCES import_rows(id) ON DELETE SET NULL;
ALTER TABLE classification_rules ADD COLUMN created_from_transaction_id INTEGER
  REFERENCES transactions(id) ON DELETE SET NULL;

UPDATE classification_rules
SET rule_source = CASE created_from
  WHEN 'seed' THEN 'legacy_index'
  WHEN 'user' THEN 'user_approved'
  WHEN 'ai' THEN 'ai_approved'
  ELSE created_from
END
WHERE rule_source IS NULL;

CREATE INDEX idx_classification_rules_source
  ON classification_rules(workspace_id, rule_source, is_active);

CREATE INDEX idx_classification_rules_import_row
  ON classification_rules(created_from_import_row_id)
  WHERE created_from_import_row_id IS NOT NULL;

CREATE INDEX idx_classification_rules_transaction
  ON classification_rules(created_from_transaction_id)
  WHERE created_from_transaction_id IS NOT NULL;
