/**
 * Deduplication: computes a stable hash for a normalised transaction and checks
 * whether a matching transaction already exists in the `transactions` table.
 *
 * Hash inputs: date + amount (2dp) + cleanDescription + direction
 * This is intentionally loose: two transactions on the same day for the same
 * amount with the same description are almost certainly the same event.
 *
 * The hash is stored on import_rows.dedup_hash.  On commit, before inserting
 * a transaction we re-check against existing transactions by the same hash.
 */

import { createHash } from "crypto";
import { getDb } from "@/server/db/index";

export function computeDedupHash(
  date: string,
  amount: number,
  cleanDescription: string,
  direction: string
): string {
  const canonical = [
    date,
    amount.toFixed(2),
    cleanDescription.toLowerCase().trim(),
    direction,
  ].join("|");
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

export interface DedupResult {
  hash: string;
  isDuplicate: boolean;
  existingTransactionId: number | null;
}

/**
 * Checks the transactions table for an existing row with a matching dedup hash.
 * Only looks at transactions with a dedup_hash column (added in migration 020 or earlier).
 */
export function checkDuplicate(
  workspaceId: number,
  hash: string
): DedupResult {
  const db = getDb();

  // Check existing committed transactions
  const existingTx = db
    .prepare(
      `SELECT id FROM transactions
       WHERE workspace_id = ? AND dedup_hash = ?
       LIMIT 1`
    )
    .get(workspaceId, hash) as { id: number } | undefined;

  if (existingTx) {
    return { hash, isDuplicate: true, existingTransactionId: existingTx.id };
  }

  // Also check already-imported import_rows in the same workspace
  // (catches duplicates within the same batch or across batches)
  const existingRow = db
    .prepare(
      `SELECT transaction_id FROM import_rows
       WHERE workspace_id = ? AND dedup_hash = ? AND import_status = 'imported'
       LIMIT 1`
    )
    .get(workspaceId, hash) as { transaction_id: number } | undefined;

  if (existingRow) {
    return {
      hash,
      isDuplicate: true,
      existingTransactionId: existingRow.transaction_id,
    };
  }

  return { hash, isDuplicate: false, existingTransactionId: null };
}
