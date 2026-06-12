-- Generic source metadata for modular import adapters.
ALTER TABLE import_batches ADD COLUMN adapter_key TEXT;

ALTER TABLE import_rows ADD COLUMN source_type TEXT;
ALTER TABLE import_rows ADD COLUMN source_section TEXT;
ALTER TABLE import_rows ADD COLUMN billing_date TEXT;
ALTER TABLE import_rows ADD COLUMN card_last4 TEXT;
ALTER TABLE import_rows ADD COLUMN digital_wallet_card_id TEXT;
ALTER TABLE import_rows ADD COLUMN voucher_number TEXT;
ALTER TABLE import_rows ADD COLUMN original_amount REAL;
ALTER TABLE import_rows ADD COLUMN original_currency TEXT;
ALTER TABLE import_rows ADD COLUMN fx_rate REAL;
ALTER TABLE import_rows ADD COLUMN transaction_type TEXT;
ALTER TABLE import_rows ADD COLUMN payment_channel TEXT;
ALTER TABLE import_rows ADD COLUMN source_category TEXT;
ALTER TABLE import_rows ADD COLUMN currency TEXT;
ALTER TABLE import_rows ADD COLUMN transaction_status TEXT NOT NULL DEFAULT 'completed';

-- Preserve explicit provenance for rows imported before adapters were introduced.
UPDATE import_batches
SET adapter_key = 'legacy-excel'
WHERE adapter_key IS NULL;

UPDATE import_rows
SET
  source_type = 'legacy_excel',
  source_section = CASE
    WHEN source_sheet_name = 'הכנסות' THEN 'income'
    WHEN source_sheet_name = 'הוצאות' THEN 'expenses'
    ELSE source_section
  END,
  original_amount = COALESCE(original_amount, amount),
  original_currency = COALESCE(original_currency, 'ILS'),
  currency = COALESCE(currency, 'ILS')
WHERE source_type IS NULL;

CREATE INDEX idx_import_rows_source_type
  ON import_rows(workspace_id, source_type);

CREATE INDEX idx_import_rows_transaction_status
  ON import_rows(batch_id, transaction_status, import_status);
