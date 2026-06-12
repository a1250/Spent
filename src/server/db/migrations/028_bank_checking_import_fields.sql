-- Audit fields for Hebrew checking-account exports.
ALTER TABLE import_rows ADD COLUMN value_date TEXT;
ALTER TABLE import_rows ADD COLUMN balance_after REAL;
ALTER TABLE import_rows ADD COLUMN reference TEXT;
ALTER TABLE import_rows ADD COLUMN bank_account_label TEXT;
ALTER TABLE import_rows ADD COLUMN bank_account_number_masked TEXT;
ALTER TABLE import_rows ADD COLUMN source_bank TEXT;

CREATE INDEX idx_import_rows_bank_account
  ON import_rows(workspace_id, bank_account_number_masked);

CREATE INDEX idx_import_rows_reference
  ON import_rows(workspace_id, reference)
  WHERE reference IS NOT NULL;
