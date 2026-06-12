import "server-only";

import { getDb } from "@/server/db";
import {
  getImportRow,
  listImportRows,
} from "@/server/db/queries/import-rows";
import { saveUserClassificationRule } from "@/server/db/queries/classification-rules";
import type {
  ClassificationCorrection,
  ImportRow,
  LearningApplyScope,
  LearningRuleMatchType,
  RuleMatchField,
  RuleMatchType,
  TransactionDirection,
} from "@/lib/types";

interface LearningCandidate {
  counterparty: string | null;
  cleanDescription: string | null;
  sourceCategory: string | null;
}

interface StoredMatch {
  field: RuleMatchField;
  type: RuleMatchType;
  value: string;
}

interface ApplyLearningOptions {
  scope: LearningApplyScope;
  saveAsRule: boolean;
  matchType?: LearningRuleMatchType;
}

export interface LearningResult {
  affectedRows: number;
  ruleId: number | null;
}

function text(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function resolveStoredMatch(
  candidate: LearningCandidate,
  requested: LearningRuleMatchType
): StoredMatch {
  const counterparty = text(candidate.counterparty);
  const description = text(candidate.cleanDescription);
  const sourceCategory = text(candidate.sourceCategory);

  switch (requested) {
    case "exact_merchant":
      if (!counterparty) throw new Error("This row has no merchant to match");
      return { field: "counterparty", type: "exact", value: counterparty };
    case "merchant_contains":
      if (!counterparty) throw new Error("This row has no merchant to match");
      return { field: "counterparty", type: "contains", value: counterparty };
    case "description_contains":
      if (!description) throw new Error("This row has no description to match");
      return { field: "description", type: "contains", value: description };
    case "exact_counterparty":
      if (!counterparty) {
        throw new Error("This row has no counterparty to match");
      }
      return { field: "counterparty", type: "exact", value: counterparty };
    case "source_category":
      if (!sourceCategory) {
        throw new Error("This row has no source category to match");
      }
      return {
        field: "source_category",
        type: "exact",
        value: sourceCategory,
      };
  }
}

function matchesStoredRule(
  candidate: LearningCandidate,
  match: StoredMatch
): boolean {
  const haystack =
    match.field === "counterparty"
      ? text(candidate.counterparty)
      : match.field === "source_category"
        ? text(candidate.sourceCategory)
        : text(candidate.cleanDescription);
  const normalizedHaystack = haystack.toLocaleLowerCase();
  const normalizedNeedle = match.value.toLocaleLowerCase();
  return match.type === "contains"
    ? normalizedHaystack.includes(normalizedNeedle)
    : normalizedHaystack === normalizedNeedle;
}

function updateImportRow(
  row: ImportRow,
  correction: ClassificationCorrection,
  syncLinkedTransaction = true
): void {
  const db = getDb();
  db.prepare(
    `UPDATE import_rows
     SET category_id = ?,
         financial_nature = ?,
         cash_flow_type = ?,
         pnl_impact = ?,
         business_unit = ?,
         classification_status = 'manually_approved',
         confidence_score = 1,
         ai_explanation = 'Manual correction',
         updated_at = datetime('now')
     WHERE workspace_id = ? AND id = ?`
  ).run(
    correction.categoryId,
    correction.financialNature,
    correction.cashFlowType,
    correction.pnlImpact,
    correction.businessUnit,
    row.workspaceId,
    row.id
  );

  if (syncLinkedTransaction && row.transactionId != null) {
    updateTransaction(row.workspaceId, row.transactionId, correction);
  }
}

function updateTransaction(
  workspaceId: number,
  transactionId: number,
  correction: ClassificationCorrection
): void {
  getDb()
    .prepare(
      `UPDATE transactions
       SET category_id = ?,
           category_source = CASE WHEN ? IS NULL THEN NULL ELSE 'user' END,
           financial_nature = ?,
           cash_flow_type = ?,
           pnl_impact = ?,
           business_unit = ?,
           classification_status = 'manually_approved',
           confidence_score = 1,
           ai_explanation = 'Manual correction',
           needs_review = 0,
           updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`
    )
    .run(
      correction.categoryId,
      correction.categoryId,
      correction.financialNature,
      correction.cashFlowType,
      correction.pnlImpact,
      correction.businessUnit,
      workspaceId,
      transactionId
    );
}

function importRowCandidate(row: ImportRow): LearningCandidate {
  return {
    counterparty: row.counterparty,
    cleanDescription: row.cleanDescription ?? row.rawDescription,
    sourceCategory: row.sourceCategory ?? row.legacyCategory,
  };
}

function saveRule(
  workspaceId: number,
  match: StoredMatch,
  correction: ClassificationCorrection,
  direction: TransactionDirection | null,
  importRowId: number | null,
  transactionId: number | null
): number {
  return saveUserClassificationRule(workspaceId, {
    matchField: match.field,
    matchType: match.type,
    matchValue: match.value,
    financialNature: correction.financialNature,
    cashFlowType: correction.cashFlowType,
    pnlImpact: correction.pnlImpact,
    categoryId: correction.categoryId,
    direction,
    businessUnit: correction.businessUnit,
    createdFromImportRowId: importRowId,
    createdFromTransactionId: transactionId,
  }).id;
}

export function applyImportRowLearning(
  workspaceId: number,
  batchId: number,
  rowId: number,
  correction: ClassificationCorrection,
  options: ApplyLearningOptions
): LearningResult {
  const sourceRow = getImportRow(workspaceId, rowId);
  if (!sourceRow || sourceRow.batchId !== batchId) {
    throw new Error(`Import row ${rowId} not found`);
  }

  const needsMatch = options.scope === "batch_similar" || options.saveAsRule;
  const match = needsMatch
    ? resolveStoredMatch(
        importRowCandidate(sourceRow),
        options.matchType ?? "merchant_contains"
      )
    : null;
  const targets =
    options.scope === "batch_similar" && match
      ? listImportRows(workspaceId, batchId).filter((row) =>
          matchesStoredRule(importRowCandidate(row), match)
        )
      : [sourceRow];

  return getDb().transaction(() => {
    for (const target of targets) {
      updateImportRow(target, correction);
    }
    const ruleId =
      options.saveAsRule && match
        ? saveRule(
            workspaceId,
            match,
            correction,
            sourceRow.direction,
            sourceRow.id,
            sourceRow.transactionId
          )
        : null;
    return { affectedRows: targets.length, ruleId };
  })();
}

interface TransactionLearningContext {
  id: number;
  importRowId: number | null;
  importBatchId: number | null;
  description: string;
  cleanDescription: string | null;
  counterparty: string | null;
  sourceCategory: string | null;
  kind: "expense" | "income" | "transfer";
}

function getTransactionLearningContext(
  workspaceId: number,
  transactionId: number
): TransactionLearningContext | null {
  return (getDb()
    .prepare(
      `SELECT t.id,
              t.import_row_id as importRowId,
              t.import_batch_id as importBatchId,
              t.description,
              t.clean_description as cleanDescription,
              t.counterparty,
              COALESCE(r.source_category, r.legacy_category) as sourceCategory,
              t.kind
       FROM transactions t
       LEFT JOIN import_rows r ON r.id = t.import_row_id
       WHERE t.workspace_id = ? AND t.id = ?`
    )
    .get(workspaceId, transactionId) as
    | TransactionLearningContext
    | undefined) ?? null;
}

export function applyTransactionLearning(
  workspaceId: number,
  transactionId: number,
  correction: ClassificationCorrection,
  options: ApplyLearningOptions
): LearningResult {
  const transaction = getTransactionLearningContext(workspaceId, transactionId);
  if (!transaction) throw new Error(`Transaction ${transactionId} not found`);

  if (options.scope === "batch_similar") {
    if (transaction.importRowId == null || transaction.importBatchId == null) {
      throw new Error(
        "Apply to similar rows is available only for imported transactions"
      );
    }
    return applyImportRowLearning(
      workspaceId,
      transaction.importBatchId,
      transaction.importRowId,
      correction,
      options
    );
  }

  const candidate: LearningCandidate = {
    counterparty: transaction.counterparty,
    cleanDescription:
      transaction.cleanDescription ?? transaction.description,
    sourceCategory: transaction.sourceCategory,
  };
  const match = options.saveAsRule
    ? resolveStoredMatch(
        candidate,
        options.matchType ?? "merchant_contains"
      )
    : null;
  const direction: TransactionDirection =
    transaction.kind === "transfer" ? "transfer" : transaction.kind;

  return getDb().transaction(() => {
    updateTransaction(workspaceId, transactionId, correction);
    if (transaction.importRowId != null) {
      const importRow = getImportRow(workspaceId, transaction.importRowId);
      if (importRow) updateImportRow(importRow, correction, false);
    }
    const ruleId =
      options.saveAsRule && match
        ? saveRule(
            workspaceId,
            match,
            correction,
            direction,
            transaction.importRowId,
            transaction.id
          )
        : null;
    return { affectedRows: 1, ruleId };
  })();
}
