import "server-only";

import { getDb } from "../index";
import { mapTransactionRow } from "./transactions";
import type {
  DataQualitySummary,
  ImportHealthItem,
  ImportRowActionItem,
  NeedsReviewTransaction,
} from "@/lib/types";

const LOW_COVERAGE_THRESHOLD = 40;

export interface NeedsReviewFilters {
  importBatchId?: number;
  search?: string;
}

export interface ImportRowActionFilters {
  batchId?: number;
  status?: "pending" | "pending_duplicate" | "skipped_duplicate";
}

function percentage(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

export function getDataQualitySummary(
  workspaceId: number
): DataQualitySummary {
  const row = getDb()
    .prepare(
      `SELECT
         COUNT(*) AS totalTransactions,
         SUM(CASE WHEN classification_status != 'needs_review' THEN 1 ELSE 0 END)
           AS classifiedTransactions,
         SUM(CASE WHEN classification_status = 'needs_review' THEN 1 ELSE 0 END)
           AS needsReviewTransactions,
         COALESCE(SUM(ABS(charged_amount)), 0) AS totalAbsoluteValue,
         COALESCE(SUM(
           CASE WHEN classification_status != 'needs_review'
             THEN ABS(charged_amount) ELSE 0 END
         ), 0) AS classifiedAbsoluteValue,
         COALESCE(SUM(
           CASE WHEN classification_status = 'needs_review'
             THEN ABS(charged_amount) ELSE 0 END
         ), 0) AS unclassifiedValueTotal,
         COALESCE(SUM(
           CASE WHEN classification_status = 'needs_review' AND charged_amount > 0
             THEN charged_amount ELSE 0 END
         ), 0) AS unclassifiedIncomeValue,
         COALESCE(SUM(
           CASE WHEN classification_status = 'needs_review' AND charged_amount < 0
             THEN ABS(charged_amount) ELSE 0 END
         ), 0) AS unclassifiedExpenseValue
       FROM transactions
       WHERE workspace_id = ? AND is_excluded = 0`
    )
    .get(workspaceId) as {
    totalTransactions: number;
    classifiedTransactions: number | null;
    needsReviewTransactions: number | null;
    totalAbsoluteValue: number;
    classifiedAbsoluteValue: number;
    unclassifiedValueTotal: number;
    unclassifiedIncomeValue: number;
    unclassifiedExpenseValue: number;
  };

  const totalTransactions = row.totalTransactions ?? 0;
  const classifiedTransactions = row.classifiedTransactions ?? 0;
  const totalAbsoluteValue = row.totalAbsoluteValue ?? 0;
  const classifiedAbsoluteValue = row.classifiedAbsoluteValue ?? 0;
  const coverageByCount = percentage(
    classifiedTransactions,
    totalTransactions
  );
  const coverageByValue = percentage(
    classifiedAbsoluteValue,
    totalAbsoluteValue
  );

  return {
    totalTransactions,
    classifiedTransactions,
    needsReviewTransactions: row.needsReviewTransactions ?? 0,
    coverageByCount,
    coverageByValue,
    totalAbsoluteValue,
    classifiedAbsoluteValue,
    unclassifiedValueTotal: row.unclassifiedValueTotal ?? 0,
    unclassifiedIncomeValue: row.unclassifiedIncomeValue ?? 0,
    unclassifiedExpenseValue: row.unclassifiedExpenseValue ?? 0,
    lowCoverage: coverageByCount < LOW_COVERAGE_THRESHOLD,
  };
}

export function getNeedsReviewTransactions(
  workspaceId: number,
  limit = 200,
  filters: NeedsReviewFilters = {}
): NeedsReviewTransaction[] {
  const conditions = [
    "t.workspace_id = ?",
    "t.is_excluded = 0",
    "t.classification_status = 'needs_review'",
  ];
  const params: Array<string | number> = [workspaceId];

  if (filters.importBatchId != null) {
    conditions.push("t.import_batch_id = ?");
    params.push(filters.importBatchId);
  }
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(
      "(t.description LIKE ? OR t.counterparty LIKE ? OR t.clean_description LIKE ?)"
    );
    params.push(term, term, term);
  }

  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 1000));
  const rows = getDb()
    .prepare(
      `SELECT
         t.*,
         c.name AS category_name,
         c.color AS category_color,
         bc.label AS account_label,
         ir.source_category AS source_category,
         ir.legacy_category AS legacyCategory,
         ir.legacy_rule_category AS legacyRuleCategory,
         ir.source_type AS sourceType,
         ir.source_section AS sourceSection,
         ir.source_sheet_name AS sourceSheetName,
         ir.import_status AS importStatus,
         ir.applied_rule_id AS appliedRuleId,
         ir.applied_rule_confidence AS appliedRuleConfidence,
         ir.applied_rule_source AS appliedRuleSource,
         ib.source_filename AS sourceFilename,
         ib.adapter_key AS adapterKey,
         MAX(
           0,
           CAST(julianday('now') - julianday(t.created_at) AS INTEGER)
         ) AS daysPending
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       LEFT JOIN bank_credentials bc ON t.credential_id = bc.id
       LEFT JOIN import_rows ir ON t.import_row_id = ir.id
       LEFT JOIN import_batches ib ON t.import_batch_id = ib.id
       WHERE ${conditions.join(" AND ")}
       ORDER BY ABS(t.charged_amount) DESC, t.date DESC, t.id DESC
       LIMIT ?`
    )
    .all(...params, safeLimit) as Array<
    Record<string, unknown> & {
      legacyCategory: string | null;
      legacyRuleCategory: string | null;
      sourceFilename: string | null;
      adapterKey: NeedsReviewTransaction["adapterKey"];
      sourceType: NeedsReviewTransaction["sourceType"];
      sourceSection: string | null;
      sourceSheetName: string | null;
      importStatus: NeedsReviewTransaction["importStatus"];
      appliedRuleId: number | null;
      appliedRuleConfidence: number | null;
      appliedRuleSource: NeedsReviewTransaction["appliedRuleSource"];
      daysPending: number;
    }
  >;

  return rows.map((row) => ({
    ...mapTransactionRow(row),
    legacyCategory: row.legacyCategory ?? null,
    legacyRuleCategory: row.legacyRuleCategory ?? null,
    sourceFilename: row.sourceFilename ?? null,
    adapterKey: row.adapterKey ?? null,
    sourceType: row.sourceType ?? null,
    sourceSection: row.sourceSection ?? null,
    sourceSheetName: row.sourceSheetName ?? null,
    importStatus: row.importStatus ?? null,
    appliedRuleId: row.appliedRuleId ?? null,
    appliedRuleConfidence: row.appliedRuleConfidence ?? null,
    appliedRuleSource: row.appliedRuleSource ?? null,
    daysPending: row.daysPending ?? 0,
  }));
}

export function getImportRowsNeedingAction(
  workspaceId: number,
  limit = 500,
  filters: ImportRowActionFilters = {}
): ImportRowActionItem[] {
  const conditions = [
    "r.workspace_id = ?",
    `(
      r.import_status IN ('pending', 'pending_duplicate', 'skipped_duplicate')
      OR r.transaction_status = 'pending'
      OR (
        r.transaction_id IS NULL
        AND r.classification_status = 'needs_review'
        AND r.import_status NOT IN ('rejected', 'skipped_duplicate')
      )
    )`,
  ];
  const params: Array<string | number> = [workspaceId];

  if (filters.batchId != null) {
    conditions.push("r.batch_id = ?");
    params.push(filters.batchId);
  }
  if (filters.status) {
    conditions.push("r.import_status = ?");
    params.push(filters.status);
  }

  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 2000));
  return getDb()
    .prepare(
      `SELECT
         r.id,
         r.batch_id AS batchId,
         r.raw_row_number AS rawRowNumber,
         b.source_filename AS sourceFilename,
         b.adapter_key AS adapterKey,
         r.date,
         COALESCE(r.clean_description, r.raw_description) AS description,
         r.counterparty,
         r.amount,
         r.direction,
         r.import_status AS importStatus,
         r.transaction_status AS transactionStatus,
         r.classification_status AS classificationStatus,
         r.financial_nature AS financialNature,
         r.cash_flow_type AS cashFlowType,
         r.pnl_impact AS pnlImpact,
         r.category_id AS categoryId,
         c.name AS categoryName,
         c.color AS categoryColor,
         r.business_unit AS businessUnit,
         r.legacy_category AS legacyCategory,
         r.legacy_rule_category AS legacyRuleCategory,
         r.source_category AS sourceCategory,
         r.source_type AS sourceType,
         r.source_section AS sourceSection,
         r.source_sheet_name AS sourceSheetName,
         r.billing_date AS billingDate,
         r.value_date AS valueDate,
         r.applied_rule_id AS appliedRuleId,
         r.applied_rule_confidence AS appliedRuleConfidence,
         r.applied_rule_source AS appliedRuleSource,
         r.transaction_id AS transactionId,
         r.duplicate_of_transaction_id AS duplicateOfTransactionId,
         r.is_duplicate AS isDuplicate,
         r.created_at AS createdAt
       FROM import_rows r
       JOIN import_batches b ON b.id = r.batch_id
       LEFT JOIN categories c ON c.id = r.category_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY
         CASE r.import_status
           WHEN 'pending_duplicate' THEN 0
           WHEN 'pending' THEN 1
           WHEN 'skipped_duplicate' THEN 2
           ELSE 3
         END,
         ABS(COALESCE(r.amount, 0)) DESC,
         r.id DESC
       LIMIT ?`
    )
    .all(...params, safeLimit)
    .map((row) => {
      const typed = row as Omit<ImportRowActionItem, "isDuplicate"> & {
        isDuplicate: number;
      };
      return {
        ...typed,
        isDuplicate: typed.isDuplicate === 1,
      };
    });
}

export function getImportHealth(workspaceId: number): ImportHealthItem[] {
  const rows = getDb()
    .prepare(
      `WITH row_health AS (
         SELECT
           batch_id,
           COUNT(*) AS totalRows,
           SUM(import_status = 'imported') AS importedRows,
           SUM(import_status = 'pending') AS pendingRows,
           SUM(import_status = 'pending_duplicate') AS pendingDuplicates,
           SUM(import_status = 'skipped_duplicate') AS skippedDuplicates
         FROM import_rows
         WHERE workspace_id = ?
         GROUP BY batch_id
       ),
       transaction_health AS (
         SELECT
           import_batch_id AS batch_id,
           COUNT(*) AS importedTransactions,
           SUM(classification_status = 'manually_approved') AS manuallyApproved,
           SUM(classification_status = 'auto_classified') AS autoClassified,
           SUM(classification_status = 'needs_review') AS needsReview,
           SUM(classification_status != 'needs_review') AS classifiedTransactions
         FROM transactions
         WHERE workspace_id = ? AND import_batch_id IS NOT NULL
         GROUP BY import_batch_id
       )
       SELECT
         b.id AS batchId,
         b.source_filename AS sourceFilename,
         b.adapter_key AS adapterKey,
         b.status,
         b.created_at AS createdAt,
         COALESCE(rh.totalRows, 0) AS totalRows,
         COALESCE(rh.importedRows, 0) AS importedRows,
         COALESCE(rh.pendingRows, 0) AS pendingRows,
         COALESCE(rh.pendingDuplicates, 0) AS pendingDuplicates,
         COALESCE(rh.skippedDuplicates, 0) AS skippedDuplicates,
         COALESCE(th.importedTransactions, 0) AS importedTransactions,
         COALESCE(th.manuallyApproved, 0) AS manuallyApproved,
         COALESCE(th.autoClassified, 0) AS autoClassified,
         COALESCE(th.needsReview, 0) AS needsReview,
         COALESCE(th.classifiedTransactions, 0) AS classifiedTransactions
       FROM import_batches b
       LEFT JOIN row_health rh ON rh.batch_id = b.id
       LEFT JOIN transaction_health th ON th.batch_id = b.id
       WHERE b.workspace_id = ?
       ORDER BY b.created_at DESC, b.id DESC`
    )
    .all(workspaceId, workspaceId, workspaceId) as Array<
    Omit<ImportHealthItem, "classificationPercent"> & {
      classifiedTransactions: number;
    }
  >;

  return rows.map(({ classifiedTransactions, ...row }) => ({
    ...row,
    classificationPercent: percentage(
      classifiedTransactions,
      row.importedTransactions
    ),
  }));
}
