-- Adds the financial-intelligence layer to existing transactions.
--
-- Every column uses a safe default so zero existing rows are affected.
-- The import_batch_id / import_row_id back-links are added here (after
-- tables 021/022 exist) so the FK is enforced by SQLite's foreign_keys pragma.
-- Existing transactions (synced from bank scrapers) leave these NULL, which
-- is correct: they were not created through the import pipeline.

-- ── Financial meaning ─────────────────────────────────────────────────────
-- What kind of financial event this transaction represents.
-- 'unknown' until the classification pipeline runs.
ALTER TABLE transactions ADD COLUMN financial_nature TEXT NOT NULL DEFAULT 'unknown';

-- Whether cash actually moved in or out, or stayed inside the same entity.
ALTER TABLE transactions ADD COLUMN cash_flow_type TEXT NOT NULL DEFAULT 'unknown';

-- Whether this transaction affects the profit-and-loss calculation.
-- 'maybe' until confirmed. Internal transfers and investments are 'no'.
ALTER TABLE transactions ADD COLUMN pnl_impact TEXT NOT NULL DEFAULT 'maybe';

-- ── Classification tracking ───────────────────────────────────────────────
-- Tracks how the financial_nature / cash_flow_type / pnl_impact were set
-- and whether a human has reviewed them.
ALTER TABLE transactions ADD COLUMN classification_status TEXT NOT NULL DEFAULT 'auto_classified';

-- Float 0-1 confidence produced by the rules engine or AI.
-- Complements the existing ai_confidence INTEGER (1-7) from the scraper flow.
ALTER TABLE transactions ADD COLUMN confidence_score REAL;

-- Short plain-text explanation of why the classification was chosen.
ALTER TABLE transactions ADD COLUMN ai_explanation TEXT;

-- ── Enriched / cleaned data ───────────────────────────────────────────────
-- Which business unit this transaction belongs to.
ALTER TABLE transactions ADD COLUMN business_unit TEXT;

-- Cleaned merchant / sender name (without bank noise like account numbers).
ALTER TABLE transactions ADD COLUMN counterparty TEXT;

-- Human-readable description after stripping codes and identifiers.
ALTER TABLE transactions ADD COLUMN clean_description TEXT;

-- Account balance at the time of the transaction, if the source file had it.
ALTER TABLE transactions ADD COLUMN original_balance REAL;

-- ── Transfer pairing ──────────────────────────────────────────────────────
-- For internal transfers, points to the matching leg in another account
-- (e.g. debit in account A links to credit in account B).
ALTER TABLE transactions ADD COLUMN linked_transaction_id INTEGER
  REFERENCES transactions(id) ON DELETE SET NULL;

-- ── Import audit trail ────────────────────────────────────────────────────
-- NULL for transactions created by the bank scraper.
-- Set for transactions that came through the import pipeline.
ALTER TABLE transactions ADD COLUMN import_batch_id INTEGER
  REFERENCES import_batches(id) ON DELETE SET NULL;

ALTER TABLE transactions ADD COLUMN import_row_id INTEGER
  REFERENCES import_rows(id) ON DELETE SET NULL;

-- ── Indexes ───────────────────────────────────────────────────────────────
-- Supports the real-burn-rate dashboard filter (exclude non-operating rows).
CREATE INDEX idx_transactions_financial_nature
  ON transactions(workspace_id, financial_nature);

-- Supports P&L report filter.
CREATE INDEX idx_transactions_pnl_impact
  ON transactions(workspace_id, pnl_impact);

-- Supports the "needs review" badge in the UI.
CREATE INDEX idx_transactions_classification_status
  ON transactions(workspace_id, classification_status);

-- Supports tracing a transaction back to its import batch.
CREATE INDEX idx_transactions_import_batch
  ON transactions(import_batch_id)
  WHERE import_batch_id IS NOT NULL;
