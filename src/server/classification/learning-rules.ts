import "server-only";

import { getDb } from "@/server/db";
import {
  getImportRow,
  listImportRows,
} from "@/server/db/queries/import-rows";
import { saveUserClassificationRule } from "@/server/db/queries/classification-rules";
import {
  getRiskyRuleReasons,
  LearningPolicyError,
  resolveLearningRulePreview,
  sameRulePattern,
  validateManualApproval,
  type LearningCandidate,
  type LearningRulePreview,
} from "@/lib/classification-learning-policy";
import type {
  ClassificationCorrection,
  LearningDecision,
  ImportRow,
  LearningApplyScope,
  LearningRuleMatchType,
  TransactionDirection,
} from "@/lib/types";

interface ApplyLearningOptions {
  decision: LearningDecision;
  scope: LearningApplyScope;
  saveAsRule: boolean;
  matchType?: LearningRuleMatchType;
  matchValue?: string;
  riskyRuleAcknowledged?: boolean;
  otherBusinessConfirmed?: boolean;
}

export interface LearningResult {
  affectedRows: number;
  ruleId: number | null;
}

function matchesStoredRule(
  candidate: LearningCandidate,
  match: LearningRulePreview
): boolean {
  const haystack =
    match.field === "counterparty"
      ? candidate.counterparty?.trim() ?? ""
      : match.field === "source_category"
        ? candidate.sourceCategory?.trim() ?? ""
        : candidate.description?.trim() ?? "";
  const normalizedHaystack = haystack.toLocaleLowerCase();
  const normalizedNeedle = match.value.toLocaleLowerCase();
  return match.type === "contains"
    ? normalizedHaystack.includes(normalizedNeedle)
    : normalizedHaystack === normalizedNeedle;
}

function updateImportRow(
  row: ImportRow,
  correction: ClassificationCorrection,
  decision: LearningDecision,
  syncLinkedTransaction = true
): void {
  const db = getDb();
  const status =
    decision === "approve" ? "manually_approved" : "needs_review";
  const explanation =
    decision === "approve"
      ? "Manual correction"
      : "Manual correction; kept in review";
  db.prepare(
    `UPDATE import_rows
     SET category_id = ?,
         financial_nature = ?,
         cash_flow_type = ?,
         pnl_impact = ?,
         business_unit = ?,
         classification_status = ?,
         confidence_score = ?,
         ai_explanation = ?,
         updated_at = datetime('now')
     WHERE workspace_id = ? AND id = ?`
  ).run(
    correction.categoryId,
    correction.financialNature,
    correction.cashFlowType,
    correction.pnlImpact,
    correction.businessUnit,
    status,
    decision === "approve" ? 1 : null,
    explanation,
    row.workspaceId,
    row.id
  );

  if (syncLinkedTransaction && row.transactionId != null) {
    updateTransaction(
      row.workspaceId,
      row.transactionId,
      correction,
      decision
    );
  }
}

function updateTransaction(
  workspaceId: number,
  transactionId: number,
  correction: ClassificationCorrection,
  decision: LearningDecision
): void {
  const status =
    decision === "approve" ? "manually_approved" : "needs_review";
  const explanation =
    decision === "approve"
      ? "Manual correction"
      : "Manual correction; kept in review";
  getDb()
    .prepare(
      `UPDATE transactions
       SET category_id = ?,
           category_source = CASE WHEN ? IS NULL THEN NULL ELSE 'user' END,
           financial_nature = ?,
           cash_flow_type = ?,
           pnl_impact = ?,
           business_unit = ?,
           classification_status = ?,
           confidence_score = ?,
           ai_explanation = ?,
           needs_review = ?,
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
      status,
      decision === "approve" ? 1 : null,
      explanation,
      decision === "approve" ? 0 : 1,
      workspaceId,
      transactionId
    );
}

function importRowCandidate(row: ImportRow): LearningCandidate {
  return {
    counterparty: row.counterparty,
    description: row.cleanDescription ?? row.rawDescription,
    sourceCategory: row.sourceCategory,
  };
}

function saveRule(
  workspaceId: number,
  match: LearningRulePreview,
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

function validateLearningOptions(
  candidate: LearningCandidate,
  correction: ClassificationCorrection,
  options: ApplyLearningOptions
): LearningRulePreview | null {
  if (options.decision === "keep_review") {
    if (options.scope !== "row" || options.saveAsRule) {
      throw new LearningPolicyError(
        "Keeping a row in review is row-only and cannot create a future rule."
      );
    }
    return null;
  }

  const approvalErrors = validateManualApproval(
    correction,
    options.otherBusinessConfirmed === true
  );
  if (approvalErrors.length > 0) {
    throw new LearningPolicyError(approvalErrors.join(" "));
  }

  const needsMatch =
    options.scope === "batch_similar" || options.saveAsRule;
  if (!needsMatch) return null;
  if (!options.matchType) {
    throw new LearningPolicyError("Choose an explicit match type.");
  }

  let match: LearningRulePreview;
  try {
    match = resolveLearningRulePreview(candidate, options.matchType);
  } catch (error) {
    throw new LearningPolicyError(
      error instanceof Error ? error.message : "Invalid match pattern."
    );
  }
  if (options.saveAsRule) {
    if (!options.matchValue?.trim()) {
      throw new LearningPolicyError(
        "Confirm the exact future-rule pattern."
      );
    }
    if (!sameRulePattern(match, options.matchValue)) {
      throw new LearningPolicyError(
        "The submitted rule pattern does not match the selected row."
      );
    }
    const riskReasons = getRiskyRuleReasons({
      matchType: options.matchType,
      matchValue: match.value,
      correction,
    });
    if (
      riskReasons.length > 0 &&
      options.riskyRuleAcknowledged !== true
    ) {
      throw new LearningPolicyError(
        `This future rule needs explicit risk acknowledgement: ${riskReasons.join(
          "; "
        )}.`
      );
    }
  }
  return match;
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

  const match = validateLearningOptions(
    importRowCandidate(sourceRow),
    correction,
    options
  );
  const targets =
    options.scope === "batch_similar" && match
      ? listImportRows(workspaceId, batchId).filter((row) =>
          matchesStoredRule(importRowCandidate(row), match)
        )
      : [sourceRow];

  return getDb().transaction(() => {
    for (const target of targets) {
      updateImportRow(target, correction, options.decision);
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
              r.source_category as sourceCategory,
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
    description:
      transaction.cleanDescription ?? transaction.description,
    sourceCategory: transaction.sourceCategory,
  };
  const match = validateLearningOptions(candidate, correction, options);
  const direction: TransactionDirection =
    transaction.kind === "transfer" ? "transfer" : transaction.kind;

  return getDb().transaction(() => {
    updateTransaction(
      workspaceId,
      transactionId,
      correction,
      options.decision
    );
    if (transaction.importRowId != null) {
      const importRow = getImportRow(workspaceId, transaction.importRowId);
      if (importRow) {
        updateImportRow(importRow, correction, options.decision, false);
      }
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
