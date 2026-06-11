import "server-only";

import { getDb } from "../index";
import type { ImportBatch, ImportBatchStatus, ImportSourceType } from "@/lib/types";

const BATCH_COLUMNS = `
  id,
  workspace_id        as workspaceId,
  source_filename     as sourceFilename,
  source_type         as sourceType,
  column_mapping      as columnMapping,
  date_range_start    as dateRangeStart,
  date_range_end      as dateRangeEnd,
  total_rows          as totalRows,
  imported_rows       as importedRows,
  skipped_rows        as skippedRows,
  duplicate_rows      as duplicateRows,
  needs_review_rows   as needsReviewRows,
  status,
  created_at          as createdAt,
  committed_at        as committedAt
`.trim();

function hydrate(row: Record<string, unknown>): ImportBatch {
  return {
    ...row,
    columnMapping: row.columnMapping
      ? (JSON.parse(row.columnMapping as string) as Record<string, string>)
      : null,
    isDuplicate: false,
  } as unknown as ImportBatch;
}

export function createImportBatch(
  workspaceId: number,
  sourceFilename: string,
  sourceType: ImportSourceType
): ImportBatch {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO import_batches (workspace_id, source_filename, source_type)
       VALUES (?, ?, ?)
       RETURNING ${BATCH_COLUMNS}`
    )
    .get(workspaceId, sourceFilename, sourceType) as Record<string, unknown>;
  return hydrate(result);
}

export function getImportBatch(
  workspaceId: number,
  batchId: number
): ImportBatch | null {
  const row = getDb()
    .prepare(
      `SELECT ${BATCH_COLUMNS} FROM import_batches
       WHERE workspace_id = ? AND id = ?`
    )
    .get(workspaceId, batchId) as Record<string, unknown> | undefined;
  return row ? hydrate(row) : null;
}

export function listImportBatches(workspaceId: number): ImportBatch[] {
  const rows = getDb()
    .prepare(
      `SELECT ${BATCH_COLUMNS} FROM import_batches
       WHERE workspace_id = ?
       ORDER BY created_at DESC`
    )
    .all(workspaceId) as Record<string, unknown>[];
  return rows.map(hydrate);
}

export function updateImportBatchStatus(
  workspaceId: number,
  batchId: number,
  status: ImportBatchStatus
): void {
  getDb()
    .prepare(
      `UPDATE import_batches
       SET status = ?, committed_at = ${status === "committed" ? "datetime('now')" : "committed_at"}
       WHERE workspace_id = ? AND id = ?`
    )
    .run(status, workspaceId, batchId);
}

export function updateImportBatchMapping(
  workspaceId: number,
  batchId: number,
  columnMapping: Record<string, string>
): void {
  getDb()
    .prepare(
      `UPDATE import_batches
       SET column_mapping = ?, status = 'mapped'
       WHERE workspace_id = ? AND id = ?`
    )
    .run(JSON.stringify(columnMapping), workspaceId, batchId);
}

export function updateImportBatchCounters(
  workspaceId: number,
  batchId: number,
  counters: {
    totalRows?: number;
    importedRows?: number;
    skippedRows?: number;
    duplicateRows?: number;
    needsReviewRows?: number;
  }
): void {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (counters.totalRows !== undefined) { sets.push("total_rows = ?"); params.push(counters.totalRows); }
  if (counters.importedRows !== undefined) { sets.push("imported_rows = ?"); params.push(counters.importedRows); }
  if (counters.skippedRows !== undefined) { sets.push("skipped_rows = ?"); params.push(counters.skippedRows); }
  if (counters.duplicateRows !== undefined) { sets.push("duplicate_rows = ?"); params.push(counters.duplicateRows); }
  if (counters.needsReviewRows !== undefined) { sets.push("needs_review_rows = ?"); params.push(counters.needsReviewRows); }
  if (sets.length === 0) return;
  params.push(workspaceId, batchId);
  getDb()
    .prepare(`UPDATE import_batches SET ${sets.join(", ")} WHERE workspace_id = ? AND id = ?`)
    .run(...params);
}
