/**
 * Import orchestrator: ties together the Format-C parser, normaliser, dedup,
 * and rules engine.  This is the single entry point for the import pipeline.
 *
 * Two public operations:
 *   1. parseAndStageFile  — parse Excel → stage rows → run rules → return preview
 *   2. commitBatch        — insert approved import_rows as real transactions
 */

import "server-only";

import path from "path";
import { getDb } from "@/server/db/index";
import {
  createImportBatch,
  updateImportBatchStatus,
  updateImportBatchCounters,
  getImportBatch,
} from "@/server/db/queries/import-batches";
import {
  insertImportRow,
  updateImportRowNormalized,
  updateImportRowClassification,
  markImportRowDedup,
  commitImportRow,
  listImportRows,
} from "@/server/db/queries/import-rows";
import { getActiveRulesForEngine, countSeedRules } from "@/server/db/queries/classification-rules";
import { parseFormatC, isFormatC } from "@/server/import/adapters/legacy-excel/format-c";
import { seedClassificationRulesFromExcel } from "@/server/import/adapters/legacy-excel/index-seeder";
import { normalise } from "./normalizer";
import { computeDedupHash, checkDuplicate } from "./dedup";
import { classifyRow } from "./rules-engine";
import type { ImportBatch, ImportRow } from "@/lib/types";

// ── Format detection ──────────────────────────────────────────────────────────

import * as XLSX from "xlsx";

function detectSourceType(filePath: string): "excel" | "csv" {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".csv" ? "csv" : "excel";
}

// ── Step 1: parse + stage ─────────────────────────────────────────────────────

export interface StageResult {
  batch: ImportBatch;
  totalRows: number;
  skipped: number;
  needsReview: number;
  autoClassified: number;
  duplicates: number;
}

export async function parseAndStageFile(
  filePath: string,
  workspaceId: number
): Promise<StageResult> {
  const filename = path.basename(filePath);
  const sourceType = detectSourceType(filePath);

  // Detect format — use XLSX.read(buffer) to avoid xlsx's own fs access
  // which fails when bundled by Next.js/Turbopack
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fsSync = require("fs") as typeof import("fs");
  const wb = XLSX.read(fsSync.readFileSync(filePath), { cellDates: false, type: "buffer" });
  if (!isFormatC(wb)) {
    throw new Error(
      "Unsupported file format. Only Format-C Excel files (with הכנסות / הוצאות sheets) are supported in Phase 1."
    );
  }

  // Auto-seed classification rules from the index sheets (idempotent: INSERT OR IGNORE).
  // Do this before parsing so the rules engine has rules to evaluate against.
  const hasIndexSheets =
    wb.SheetNames.includes("אינדקס הכנסות") &&
    wb.SheetNames.includes("אינדקס הוצאות");

  if (hasIndexSheets && countSeedRules(workspaceId) === 0) {
    seedClassificationRulesFromExcel(filePath, workspaceId);
  }

  // Create batch record
  const batch = createImportBatch(workspaceId, filename, sourceType);

  try {
    updateImportBatchStatus(workspaceId, batch.id, "mapped");

    // Parse
    const { incomeRows, expenseRows, skippedIncome, skippedExpense } =
      parseFormatC(filePath);

    const allParsed = [...incomeRows, ...expenseRows];
    const totalParsed = allParsed.length;
    const totalSkipped = skippedIncome + skippedExpense;

    // Load rules once for the whole batch
    const rules = getActiveRulesForEngine(workspaceId);

    let needsReview = 0;
    let autoClassified = 0;
    let duplicates = 0;

    const db = getDb();
    const stageAll = db.transaction(() => {
      for (const parsed of allParsed) {
        // Insert raw row — legacy fields from Excel stored explicitly for UI display
        const row = insertImportRow(batch.id, workspaceId, {
          rawRowNumber: parsed.rawRowNumber,
          rawDate: parsed.rawDate,
          rawAmount: parsed.rawAmount,
          rawDescription: parsed.rawDescription,
          rawAccount: parsed.rawAccount,
          rawBalance: null,
          rawMetadata: parsed.rawMetadata,
          legacyCategory: parsed.hebrewCategory || null,
          sourceSheetName: parsed.rawMetadata.sheetName ?? null,
        });

        // Normalise
        const norm = normalise({
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

        if (!norm) continue;

        updateImportRowNormalized(workspaceId, row.id, {
          date: norm.date,
          amount: norm.amount,
          direction: norm.direction,
          account: norm.account,
          counterparty: norm.counterparty,
          cleanDescription: norm.cleanDescription,
        });

        // Dedup
        const hash = computeDedupHash(
          norm.date,
          norm.amount,
          norm.cleanDescription,
          norm.direction
        );
        const dedup = checkDuplicate(workspaceId, hash);
        markImportRowDedup(workspaceId, row.id, hash, dedup.isDuplicate, dedup.existingTransactionId);

        if (dedup.isDuplicate) {
          duplicates++;
          continue;
        }

        // Classify via rules engine
        const classification = classifyRow(
          {
            cleanDescription: norm.cleanDescription,
            counterparty: norm.counterparty,
            account: norm.account,
            amount: norm.amount,
            direction: norm.direction,
          },
          rules
        );

        // Find first matched seed rule's match_value for legacy_rule_category
        const firstMatchedRule = classification.matchedRuleIds.length > 0
          ? rules.find((r) => r.id === classification.matchedRuleIds[0])
          : null;
        const legacyRuleCategory =
          firstMatchedRule?.createdFrom === "seed" ? firstMatchedRule.matchValue : null;

        if (legacyRuleCategory) {
          getDb()
            .prepare(
              `UPDATE import_rows SET legacy_rule_category = ? WHERE workspace_id = ? AND id = ?`
            )
            .run(legacyRuleCategory, workspaceId, row.id);
        }

        updateImportRowClassification(workspaceId, row.id, {
          financialNature: classification.financialNature,
          cashFlowType: classification.cashFlowType,
          pnlImpact: classification.pnlImpact,
          classificationStatus: classification.classificationStatus,
          confidenceScore: classification.confidenceScore,
          aiExplanation:
            classification.matchedRuleIds.length > 0
              ? `Matched rule(s): ${classification.matchedRuleIds.join(", ")}`
              : null,
        });

        if (classification.classificationStatus === "needs_review") {
          needsReview++;
        } else {
          autoClassified++;
        }
      }
    });

    stageAll();

    // Update batch counters
    updateImportBatchCounters(workspaceId, batch.id, {
      totalRows: totalParsed,
      skippedRows: totalSkipped,
      duplicateRows: duplicates,
      needsReviewRows: needsReview,
      importedRows: 0,
    });

    updateImportBatchStatus(workspaceId, batch.id, "reviewing");

    const freshBatch = getImportBatch(workspaceId, batch.id)!;

    return {
      batch: freshBatch,
      totalRows: totalParsed,
      skipped: totalSkipped,
      needsReview,
      autoClassified,
      duplicates,
    };
  } catch (err) {
    updateImportBatchStatus(workspaceId, batch.id, "failed");
    throw err;
  }
}

// ── Step 2: commit ────────────────────────────────────────────────────────────

export interface CommitResult {
  inserted: number;
  skipped: number;
  batchId: number;
}

export async function commitBatch(
  batchId: number,
  workspaceId: number
): Promise<CommitResult> {
  const batch = getImportBatch(workspaceId, batchId);
  if (!batch) throw new Error(`Batch ${batchId} not found`);
  if (batch.status === "committed") {
    throw new Error("Batch already committed");
  }

  const rows = listImportRows(workspaceId, batchId, { importStatus: "pending" });

  // Create a synthetic sync_run so the FK constraint is satisfied
  const db = getDb();
  const dateRange = getDateRange(rows);
  const syncRunId = (
    db
      .prepare(
        `INSERT INTO sync_runs (workspace_id, provider, started_at, completed_at, status, scrape_from_date)
         VALUES (?, 'legacy_import', datetime('now'), datetime('now'), 'completed', ?)
         RETURNING id`
      )
      .get(workspaceId, dateRange.min ?? "2000-01-01") as { id: number }
  ).id;

  let inserted = 0;
  let skipped = 0;

  const commitAll = db.transaction(() => {
    for (const row of rows) {
      if (row.isDuplicate || !row.date || row.amount == null) {
        skipped++;
        continue;
      }

      const signedAmount =
        row.direction === "expense" ? -Math.abs(row.amount) : Math.abs(row.amount);

      // Upsert into transactions
      const txResult = db
        .prepare(
          `INSERT INTO transactions (
             workspace_id, account_number, date, processed_date,
             original_amount, original_currency,
             charged_amount, charged_currency,
             description, memo, type, status,
             identifier, installment_number, installment_total,
             provider, credential_id, sync_run_id,
             dedup_hash, dedup_sequence, kind,
             financial_nature, cash_flow_type, pnl_impact,
             classification_status, confidence_score, ai_explanation,
             counterparty, clean_description,
             import_batch_id, import_row_id
           ) VALUES (
             ?, ?, ?, ?,
             ?, 'ILS',
             ?, 'ILS',
             ?, NULL, 'normal', 'completed',
             NULL, NULL, NULL,
             'legacy_import', NULL, ?,
             ?, 0,
             ?,
             ?, ?, ?,
             ?, ?, ?,
             ?, ?,
             ?, ?
           )
           ON CONFLICT(workspace_id, dedup_hash, dedup_sequence) DO NOTHING
           RETURNING id`
        )
        .get(
          workspaceId,
          row.account ?? "imported",
          row.date,
          row.date,
          signedAmount,
          signedAmount,
          row.cleanDescription ?? row.rawDescription,
          syncRunId,
          row.dedupHash ?? computeDedupHash(row.date, row.amount, row.cleanDescription ?? row.rawDescription ?? "", row.direction ?? "unknown"),
          row.direction === "income" ? "income" : row.direction === "expense" ? "expense" : "transfer",
          row.financialNature,
          row.cashFlowType,
          row.pnlImpact,
          row.classificationStatus,
          row.confidenceScore,
          row.aiExplanation,
          row.counterparty,
          row.cleanDescription,
          batchId,
          row.id
        ) as { id: number } | undefined;

      if (txResult) {
        commitImportRow(workspaceId, row.id, txResult.id);
        inserted++;
      } else {
        skipped++;
      }
    }
  });

  commitAll();

  // Update batch counters
  updateImportBatchCounters(workspaceId, batchId, { importedRows: inserted });
  updateImportBatchStatus(workspaceId, batchId, "committed");

  return { inserted, skipped, batchId };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDateRange(rows: ImportRow[]): { min: string | null; max: string | null } {
  const dates = rows.map((r) => r.date).filter(Boolean) as string[];
  if (dates.length === 0) return { min: null, max: null };
  dates.sort();
  return { min: dates[0], max: dates[dates.length - 1] };
}
