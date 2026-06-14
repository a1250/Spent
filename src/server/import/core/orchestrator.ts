/**
 * Generic import orchestration. File-specific parsing lives in adapters while
 * staging, classification, deduplication, review, and commit stay shared.
 */

import "server-only";

import path from "path";
import * as XLSX from "xlsx";
import { getDb } from "@/server/db/index";
import {
  createImportBatch,
  getImportBatch,
  updateImportBatchCounters,
  updateImportBatchStatus,
} from "@/server/db/queries/import-batches";
import {
  commitImportRow,
  getImportRow,
  insertImportRow,
  listImportRows,
  markImportRowDedup,
  markImportRowPendingDuplicate,
  markImportRowSkippedDuplicate,
  setImportRowRuleProvenance,
  updateImportRowClassification,
  updateImportRowNormalized,
} from "@/server/db/queries/import-rows";
import { getActiveRulesForEngine } from "@/server/db/queries/classification-rules";
import {
  detectImportAdapter,
  ImportDetectionError,
} from "@/server/import/adapters/detector";
import type { ParsedImportRow } from "@/server/import/adapters/types";
import type {
  ImportBatch,
  ImportRow,
  ImportRowSourceType,
} from "@/lib/types";
import { normalise } from "./normalizer";
import { checkDuplicate, computeDedupHash } from "./dedup";
import { classifyRow } from "./rules-engine";

function detectSourceType(filePath: string): "excel" | "csv" {
  return path.extname(filePath).toLowerCase() === ".csv" ? "csv" : "excel";
}

function providerForSource(sourceType: ImportRowSourceType): string {
  return sourceType === "legacy_excel" ? "legacy_import" : sourceType;
}

function dedupHashForRow(
  parsed: ParsedImportRow,
  normalized: {
    date: string;
    amount: number;
    cleanDescription: string;
    direction: string;
  }
): string {
  if (parsed.sourceType === "legacy_excel") {
    return computeDedupHash(
      normalized.date,
      normalized.amount,
      normalized.cleanDescription,
      normalized.direction
    );
  }

  const sourceIdentity = [
    parsed.sourceType,
    parsed.bankAccountNumberMasked ??
      parsed.cardLast4 ??
      parsed.account ??
      "",
    parsed.originalCurrency ?? parsed.currency ?? "",
  ];
  if (parsed.sourceType === "bank_checking_account") {
    sourceIdentity.push(parsed.reference ?? "", parsed.valueDate ?? "");
  }

  return computeDedupHash(
    normalized.date,
    parsed.originalAmount ?? normalized.amount,
    normalized.cleanDescription,
    normalized.direction,
    sourceIdentity
  );
}

export interface StageResult {
  batch: ImportBatch;
  totalRows: number;
  skipped: number;
  needsReview: number;
  autoClassified: number;
  duplicates: number;
  pending: number;
}

export async function parseAndStageFile(
  filePath: string,
  workspaceId: number,
  sourceFilename?: string
): Promise<StageResult> {
  const filename = sourceFilename ?? path.basename(filePath);
  const sourceType = detectSourceType(filePath);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fsSync = require("fs") as typeof import("fs");
  const workbook = XLSX.read(fsSync.readFileSync(filePath), {
    cellDates: false,
    type: "buffer",
  });
  const detection = detectImportAdapter(workbook);
  if (detection.status === "unsupported_isracard_profile") {
    throw new ImportDetectionError(
      "unsupported_isracard_profile",
      "This looks like an Isracard export profile that is not supported yet.",
      detection.profileHint
    );
  }
  if (detection.status === "unsupported") {
    throw new ImportDetectionError(
      "unsupported_import_format",
      "Unsupported import format. Use a legacy Excel, Isracard, CAL, or Hebrew bank checking export."
    );
  }

  const adapter = detection.adapter;
  adapter.beforeStage?.({ filePath, workbook, workspaceId });
  const batch = createImportBatch(
    workspaceId,
    filename,
    sourceType,
    adapter.key
  );

  try {
    updateImportBatchStatus(workspaceId, batch.id, "mapped");
    const parsedResult = adapter.parse(workbook);
    const allRules = getActiveRulesForEngine(workspaceId);
    const classificationRules =
      adapter.key === "legacy-excel"
        ? allRules
        : allRules.filter((rule) => rule.ruleSource === "user_approved");

    let needsReview = 0;
    let autoClassified = 0;
    let duplicates = 0;
    let pending = 0;

    const db = getDb();
    db.transaction(() => {
      for (const parsed of parsedResult.rows) {
        const row = insertImportRow(batch.id, workspaceId, {
          rawRowNumber: parsed.rawRowNumber,
          rawDate: parsed.rawDate,
          rawAmount: parsed.rawAmount,
          rawDescription: parsed.rawDescription,
          rawAccount: parsed.rawAccount,
          rawBalance: parsed.rawBalance,
          rawMetadata: parsed.rawMetadata,
          legacyCategory: parsed.legacyCategory ?? null,
          sourceSheetName: parsed.sourceSheetName ?? null,
          sourceType: parsed.sourceType,
          sourceSection: parsed.sourceSection,
          billingDate: parsed.billingDate,
          cardLast4: parsed.cardLast4,
          digitalWalletCardId: parsed.digitalWalletCardId,
          voucherNumber: parsed.voucherNumber,
          originalAmount: parsed.originalAmount,
          originalCurrency: parsed.originalCurrency,
          fxRate: parsed.fxRate,
          transactionType: parsed.transactionType,
          paymentChannel: parsed.paymentChannel,
          sourceCategory: parsed.sourceCategory,
          currency: parsed.currency,
          transactionStatus: parsed.transactionStatus,
          valueDate: parsed.valueDate,
          balanceAfter: parsed.balanceAfter,
          reference: parsed.reference,
          bankAccountLabel: parsed.bankAccountLabel,
          bankAccountNumberMasked: parsed.bankAccountNumberMasked,
          sourceBank: parsed.sourceBank,
          notes: parsed.notes,
        });

        const normalized = normalise({
          rawDate: parsed.rawDate,
          rawAmount: parsed.rawAmount,
          rawDescription: parsed.rawDescription,
          rawAccount: parsed.rawAccount,
          date: parsed.date,
          amount: parsed.amount,
          direction: parsed.direction,
          counterparty: parsed.counterparty,
          cleanDescription: parsed.cleanDescription,
        });
        if (!normalized) continue;

        updateImportRowNormalized(workspaceId, row.id, {
          date: normalized.date,
          amount: normalized.amount,
          direction: normalized.direction,
          account: normalized.account,
          counterparty: normalized.counterparty,
          cleanDescription: normalized.cleanDescription,
        });

        const dedupHash = dedupHashForRow(parsed, normalized);
        const dedup = checkDuplicate(workspaceId, dedupHash);
        markImportRowDedup(
          workspaceId,
          row.id,
          dedupHash,
          dedup.isDuplicate,
          dedup.existingTransactionId
        );

        const classification = classifyRow(
          {
            cleanDescription: normalized.cleanDescription,
            counterparty: normalized.counterparty,
            sourceCategory: parsed.sourceCategory,
            account: normalized.account,
            amount: normalized.amount,
            direction: normalized.direction,
          },
          classificationRules
        );
        const firstMatchedRule =
          classification.matchedRuleIds.length > 0
            ? classificationRules.find(
                (rule) => rule.id === classification.matchedRuleIds[0]
              )
            : null;
        const legacyRuleCategory =
          firstMatchedRule?.createdFrom === "seed"
            ? firstMatchedRule.matchValue
            : null;
        if (legacyRuleCategory) {
          db.prepare(
            `UPDATE import_rows
             SET legacy_rule_category = ?
             WHERE workspace_id = ? AND id = ?`
          ).run(legacyRuleCategory, workspaceId, row.id);
        }

        const financialNature =
          classification.hasUserApprovedRule &&
          classification.financialNature !== "unknown"
            ? classification.financialNature
            : parsed.financialNature ?? classification.financialNature;
        const cashFlowType =
          parsed.transactionStatus === "pending"
            ? "pending"
            : classification.hasUserApprovedRule &&
                classification.cashFlowType !== "unknown"
              ? classification.cashFlowType
              : parsed.cashFlowType ?? classification.cashFlowType;
        const pnlImpact =
          classification.hasUserApprovedRule &&
          classification.pnlImpact !== "maybe"
            ? classification.pnlImpact
            : parsed.pnlImpact ?? classification.pnlImpact;

        updateImportRowNormalized(workspaceId, row.id, {
          categoryId: classification.categoryId,
          businessUnit: classification.businessUnit,
        });
        updateImportRowClassification(workspaceId, row.id, {
          financialNature,
          cashFlowType,
          pnlImpact,
          classificationStatus: classification.classificationStatus,
          confidenceScore: classification.confidenceScore,
          aiExplanation:
            classification.matchedRuleIds.length > 0
              ? `Matched rule(s): ${classification.matchedRuleIds.join(", ")}`
              : null,
        });
        if (classification.appliedRuleId != null) {
          setImportRowRuleProvenance(workspaceId, row.id, {
            appliedRuleId: classification.appliedRuleId,
            appliedRuleConfidence: classification.confidenceScore,
            appliedRuleSource: "user_approved",
          });
        }

        if (dedup.isDuplicate) {
          duplicates++;
          continue;
        }
        if (parsed.transactionStatus === "pending") pending++;
        if (classification.classificationStatus === "needs_review") {
          needsReview++;
        } else {
          autoClassified++;
        }
      }
    })();

    updateImportBatchCounters(workspaceId, batch.id, {
      totalRows: parsedResult.rows.length,
      skippedRows: parsedResult.skipped,
      duplicateRows: duplicates,
      needsReviewRows: needsReview,
      importedRows: 0,
    });
    updateImportBatchStatus(workspaceId, batch.id, "reviewing");

    return {
      batch: getImportBatch(workspaceId, batch.id)!,
      totalRows: parsedResult.rows.length,
      skipped: parsedResult.skipped,
      needsReview,
      autoClassified,
      duplicates,
      pending,
    };
  } catch (error) {
    updateImportBatchStatus(workspaceId, batch.id, "failed");
    throw error;
  }
}

export interface CommitResult {
  inserted: number;
  skipped: number;
  pending: number;
  batchId: number;
}

export async function commitBatch(
  batchId: number,
  workspaceId: number
): Promise<CommitResult> {
  const batch = getImportBatch(workspaceId, batchId);
  if (!batch) throw new Error(`Batch ${batchId} not found`);
  if (batch.status === "committed") throw new Error("Batch already committed");

  const rows = listImportRows(workspaceId, batchId, {
    importStatus: "pending",
  });
  const db = getDb();
  let inserted = 0;
  let skipped = 0;
  let pending = 0;
  let syncRunId: number | null = null;

  db.transaction(() => {
    for (const row of rows) {
      if (row.transactionStatus === "pending") {
        pending++;
        continue;
      }
      if (row.isDuplicate || !row.date || row.amount == null) {
        skipped++;
        continue;
      }

      const dedupHash =
        row.dedupHash ??
        computeDedupHash(
          row.date,
          row.amount,
          row.cleanDescription ?? row.rawDescription ?? "",
          row.direction ?? "unknown"
        );
      syncRunId ??= getOrCreateImportSyncRun(workspaceId, batchId, rows);
      const transaction = insertTransactionFromImportRow(
        row,
        batchId,
        workspaceId,
        syncRunId,
        dedupHash,
        0,
        "completed"
      );

      if (transaction) {
        commitImportRow(workspaceId, row.id, transaction.id);
        inserted++;
        continue;
      }

      const match = db
        .prepare(
          `SELECT id
           FROM transactions
           WHERE workspace_id = ? AND dedup_hash = ?
           ORDER BY dedup_sequence, id
           LIMIT 1`
        )
        .get(workspaceId, dedupHash) as { id: number } | undefined;
      markImportRowPendingDuplicate(workspaceId, row.id, match?.id ?? null);
      skipped++;
    }
  })();

  refreshBatchCounters(workspaceId, batchId);
  updateImportBatchStatus(workspaceId, batchId, "committed");
  return { inserted, skipped, pending, batchId };
}

export type DuplicateReviewAction =
  | "skip_duplicate"
  | "import_anyway"
  | "keep_pending";

export function reviewDuplicateRow(
  batchId: number,
  rowId: number,
  workspaceId: number,
  action: DuplicateReviewAction
): {
  action: DuplicateReviewAction;
  transactionId: number | null;
  dedupSequence: number | null;
} {
  const batch = getImportBatch(workspaceId, batchId);
  if (!batch) throw new Error(`Batch ${batchId} not found`);

  const row = getImportRow(workspaceId, rowId);
  if (!row || row.batchId !== batchId) {
    throw new Error(`Import row ${rowId} not found`);
  }
  if (!row.isDuplicate) {
    throw new Error("Row is not marked as a potential duplicate");
  }
  if (row.importStatus === "imported") {
    throw new Error("Duplicate row was already imported");
  }

  if (action === "skip_duplicate") {
    markImportRowSkippedDuplicate(workspaceId, rowId);
    return { action, transactionId: null, dedupSequence: null };
  }
  if (action === "keep_pending") {
    markImportRowPendingDuplicate(
      workspaceId,
      rowId,
      row.duplicateOfTransactionId
    );
    return { action, transactionId: null, dedupSequence: null };
  }
  if (!row.date || row.amount == null || !row.dedupHash) {
    throw new Error("Duplicate row is missing normalized transaction data");
  }

  const db = getDb();
  return db.transaction(() => {
    const sequence = db
      .prepare(
        `SELECT COALESCE(MAX(dedup_sequence), -1) + 1 as nextSequence
         FROM transactions
         WHERE workspace_id = ? AND dedup_hash = ?`
      )
      .get(workspaceId, row.dedupHash as string) as { nextSequence: number };
    const syncRunId = getOrCreateImportSyncRun(workspaceId, batchId, [row]);
    const transaction = insertTransactionFromImportRow(
      row,
      batchId,
      workspaceId,
      syncRunId,
      row.dedupHash as string,
      sequence.nextSequence,
      row.transactionStatus
    );
    if (!transaction) {
      throw new Error("Could not import duplicate with the next sequence");
    }

    commitImportRow(workspaceId, rowId, transaction.id);
    refreshBatchCounters(workspaceId, batchId);
    return {
      action,
      transactionId: transaction.id,
      dedupSequence: sequence.nextSequence,
    };
  })();
}

export function importPendingRow(
  batchId: number,
  rowId: number,
  workspaceId: number
): { transactionId: number } {
  const batch = getImportBatch(workspaceId, batchId);
  if (!batch) throw new Error(`Batch ${batchId} not found`);

  const row = getImportRow(workspaceId, rowId);
  if (!row || row.batchId !== batchId) {
    throw new Error(`Import row ${rowId} not found`);
  }
  if (row.transactionStatus !== "pending") {
    throw new Error("Row is not a pending imported transaction");
  }
  if (row.importStatus === "imported") {
    throw new Error("Pending row was already imported");
  }
  if (row.isDuplicate) {
    throw new Error("Resolve this row under Potential Duplicates");
  }
  if (!row.date || row.amount == null || !row.dedupHash) {
    throw new Error("Pending row is missing normalized transaction data");
  }

  const duplicate = checkDuplicate(workspaceId, row.dedupHash);
  if (duplicate.isDuplicate) {
    markImportRowPendingDuplicate(
      workspaceId,
      rowId,
      duplicate.existingTransactionId
    );
    throw new Error("A matching transaction already exists; review it as a duplicate");
  }

  const db = getDb();
  return db.transaction(() => {
    const syncRunId = getOrCreateImportSyncRun(workspaceId, batchId, [row]);
    const transaction = insertTransactionFromImportRow(
      row,
      batchId,
      workspaceId,
      syncRunId,
      row.dedupHash as string,
      0,
      "pending"
    );
    if (!transaction) {
      throw new Error("Could not import pending transaction");
    }
    commitImportRow(workspaceId, rowId, transaction.id);
    refreshBatchCounters(workspaceId, batchId);
    return { transactionId: transaction.id };
  })();
}

function refreshBatchCounters(workspaceId: number, batchId: number): void {
  const counters = getDb()
    .prepare(
      `SELECT
         COUNT(CASE WHEN import_status = 'imported' THEN 1 END) as importedRows,
         COUNT(CASE WHEN is_duplicate = 1 THEN 1 END) as duplicateRows
       FROM import_rows
       WHERE workspace_id = ? AND batch_id = ?`
    )
    .get(workspaceId, batchId) as {
      importedRows: number;
      duplicateRows: number;
    };
  updateImportBatchCounters(workspaceId, batchId, counters);
}

function insertTransactionFromImportRow(
  row: ImportRow,
  batchId: number,
  workspaceId: number,
  syncRunId: number,
  dedupHash: string,
  dedupSequence: number,
  status: "completed" | "pending"
): { id: number } | undefined {
  if (!row.date || row.amount == null) return undefined;

  const sign = row.direction === "expense" ? -1 : 1;
  const chargedAmount = sign * Math.abs(row.amount);
  const originalAmount =
    sign * Math.abs(row.originalAmount ?? row.amount);
  const description =
    row.cleanDescription ?? row.rawDescription ?? "Imported transaction";

  return getDb()
    .prepare(
      `INSERT INTO transactions (
         workspace_id, account_number, date, processed_date,
         original_amount, original_currency,
         charged_amount, charged_currency,
         description, memo, type, status,
         identifier, installment_number, installment_total,
         category_id, category_source,
         provider, credential_id, sync_run_id,
         dedup_hash, dedup_sequence, kind, needs_review,
         financial_nature, cash_flow_type, pnl_impact,
         classification_status, confidence_score, ai_explanation,
         business_unit, counterparty, clean_description, original_balance,
         import_batch_id, import_row_id
       ) VALUES (
         @workspaceId, @accountNumber, @date, @processedDate,
         @originalAmount, @originalCurrency,
         @chargedAmount, @chargedCurrency,
         @description, @memo, @type, @status,
         @identifier, NULL, NULL,
         @categoryId, @categorySource,
         @provider, NULL, @syncRunId,
         @dedupHash, @dedupSequence, @kind, @needsReview,
         @financialNature, @cashFlowType, @pnlImpact,
         @classificationStatus, @confidenceScore, @aiExplanation,
         @businessUnit, @counterparty, @cleanDescription, @originalBalance,
         @importBatchId, @importRowId
       )
       ON CONFLICT(workspace_id, dedup_hash, dedup_sequence) DO NOTHING
       RETURNING id`
    )
    .get({
      workspaceId,
      accountNumber:
        row.bankAccountNumberMasked ??
        row.cardLast4 ??
        row.account ??
        "imported",
      date: row.date,
      processedDate: row.valueDate ?? row.billingDate ?? row.date,
      originalAmount,
      originalCurrency: row.originalCurrency ?? row.currency ?? "ILS",
      chargedAmount,
      chargedCurrency: row.currency ?? row.originalCurrency ?? "ILS",
      description,
      memo: row.notes,
      type: row.transactionType?.includes("תשלומים")
        ? "installments"
        : "normal",
      status,
      identifier:
        row.reference ?? row.voucherNumber ?? row.digitalWalletCardId,
      categoryId: row.categoryId,
      categorySource: row.categoryId == null ? null : "user",
      provider: row.sourceBank ?? providerForSource(row.sourceType),
      syncRunId,
      dedupHash,
      dedupSequence,
      kind:
        row.direction === "income"
          ? "income"
          : row.direction === "expense"
            ? "expense"
            : "transfer",
      needsReview: row.classificationStatus === "needs_review" ? 1 : 0,
      financialNature: row.financialNature,
      cashFlowType: row.cashFlowType,
      pnlImpact: row.pnlImpact,
      classificationStatus: row.classificationStatus,
      confidenceScore: row.confidenceScore,
      aiExplanation: row.aiExplanation,
      businessUnit: row.businessUnit,
      counterparty: row.counterparty,
      cleanDescription: row.cleanDescription,
      originalBalance: row.balanceAfter,
      importBatchId: batchId,
      importRowId: row.id,
    }) as { id: number } | undefined;
}

function getOrCreateImportSyncRun(
  workspaceId: number,
  batchId: number,
  rows: ImportRow[]
): number {
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT sync_run_id as syncRunId
       FROM transactions
       WHERE workspace_id = ? AND import_batch_id = ?
       ORDER BY id
       LIMIT 1`
    )
    .get(workspaceId, batchId) as { syncRunId: number } | undefined;
  if (existing) return existing.syncRunId;

  const dates = rows
    .map((row) => row.date)
    .filter((date): date is string => Boolean(date))
    .sort();
  const provider = rows[0]
    ? rows[0].sourceBank ?? providerForSource(rows[0].sourceType)
    : "file_import";
  return (
    db
      .prepare(
        `INSERT INTO sync_runs (
           workspace_id, provider, started_at, completed_at, status, scrape_from_date
         ) VALUES (
           ?, ?, datetime('now'), datetime('now'), 'completed', ?
         )
         RETURNING id`
      )
      .get(workspaceId, provider, dates[0] ?? "2000-01-01") as { id: number }
  ).id;
}
