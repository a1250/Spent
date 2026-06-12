-- Backfill rows whose insert was blocked by the transaction dedup constraint.
-- These rows stay in the audit table and require an explicit user decision.
UPDATE import_rows
SET
  is_duplicate = 1,
  duplicate_of_transaction_id = COALESCE(
    duplicate_of_transaction_id,
    (
      SELECT t.id
      FROM transactions t
      WHERE t.workspace_id = import_rows.workspace_id
        AND t.dedup_hash = import_rows.dedup_hash
      ORDER BY t.dedup_sequence ASC, t.id ASC
      LIMIT 1
    )
  ),
  import_status = 'pending_duplicate',
  updated_at = datetime('now')
WHERE import_status = 'pending'
  AND dedup_hash IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM transactions t
    WHERE t.workspace_id = import_rows.workspace_id
      AND t.dedup_hash = import_rows.dedup_hash
  );

UPDATE import_rows
SET import_status = 'pending_duplicate', updated_at = datetime('now')
WHERE import_status = 'pending'
  AND is_duplicate = 1;

UPDATE import_batches
SET duplicate_rows = (
  SELECT COUNT(*)
  FROM import_rows r
  WHERE r.batch_id = import_batches.id
    AND r.is_duplicate = 1
);
