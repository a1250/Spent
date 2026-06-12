/**
 * Rules engine: runs classification_rules against a normalised row.
 *
 * Rules are evaluated in ascending priority order (lower number = first).
 * The first rule whose match_field/match_type/match_value matches the row
 * wins and its classification fields are applied.
 *
 * Confidence starts at 0 and accumulates confidence_boost from every
 * matching rule.  A row reaching >= CONFIDENCE_THRESHOLD is marked
 * 'auto_classified' ONLY when at least one matched rule was user-created
 * (createdFrom === 'user').  Seed/legacy rules accumulate confidence as a
 * suggestion but can never promote a row to 'auto_classified' on their own —
 * those rows stay 'needs_review' regardless of how many seed rules match.
 *
 * The engine is pure (no DB calls) — callers load the rule list once and
 * pass it in, so bulk imports don't re-query for every row.
 */

import type {
  ClassificationRule,
  FinancialNature,
  CashFlowType,
  PnlImpact,
  TransactionDirection,
  BusinessUnit,
  ClassificationStatus,
} from "@/lib/types";

export const CONFIDENCE_THRESHOLD = 0.7;

// ── Match logic ───────────────────────────────────────────────────────────────

function getFieldValue(row: RowToClassify, field: string): string {
  switch (field) {
    case "description":  return row.cleanDescription ?? "";
    case "counterparty": return row.counterparty ?? "";
    case "account":      return row.account ?? "";
    case "amount_range": return String(row.amount ?? 0);
    default:             return "";
  }
}

function matchesRule(row: RowToClassify, rule: ClassificationRule): boolean {
  if (rule.matchField === "amount_range") {
    const amount = row.amount ?? 0;
    try {
      const { min, max } = JSON.parse(rule.matchValue) as { min: number; max: number };
      return amount >= min && amount <= max;
    } catch {
      return false;
    }
  }

  const haystack = getFieldValue(row, rule.matchField).toLowerCase();
  const needle = rule.matchValue.toLowerCase();

  switch (rule.matchType) {
    case "exact":       return haystack === needle;
    case "contains":    return haystack.includes(needle);
    case "starts_with": return haystack.startsWith(needle);
    case "regex": {
      try {
        return new RegExp(rule.matchValue, "i").test(haystack);
      } catch {
        return false;
      }
    }
    default: return false;
  }
}

// ── Cash-flow type derivation ─────────────────────────────────────────────────

function deriveCashFlowType(
  financialNature: FinancialNature,
  direction: TransactionDirection
): CashFlowType {
  if (financialNature === "internal_transfer") return "internal_transfer";
  if (direction === "income") return "real_cash_in";
  if (direction === "expense") return "real_cash_out";
  return "unknown";
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface RowToClassify {
  cleanDescription: string | null;
  counterparty: string | null;
  account: string | null;
  amount: number | null;
  direction: TransactionDirection | null;
}

export interface ClassificationResult {
  financialNature: FinancialNature;
  cashFlowType: CashFlowType;
  pnlImpact: PnlImpact;
  direction: TransactionDirection;
  categoryId: number | null;
  businessUnit: BusinessUnit | null;
  classificationStatus: ClassificationStatus;
  confidenceScore: number;
  matchedRuleIds: number[];
  /** True when at least one matched rule was created by a human (createdFrom='user'). */
  hasUserApprovedRule: boolean;
}

// ── Engine ────────────────────────────────────────────────────────────────────

/**
 * Runs all active rules against a single row.  Rules must be pre-sorted by
 * priority ASC before passing in (getActiveRulesForEngine already does this).
 *
 * @param row       Normalised row fields to evaluate
 * @param rules     All active rules for the workspace, sorted by priority ASC
 * @returns         Classification result with confidence score
 */
export function classifyRow(
  row: RowToClassify,
  rules: ClassificationRule[]
): ClassificationResult {
  let financialNature: FinancialNature = "unknown";
  let cashFlowType: CashFlowType = "unknown";
  let pnlImpact: PnlImpact = "maybe";
  let direction: TransactionDirection = row.direction ?? "unknown";
  let categoryId: number | null = null;
  let businessUnit: BusinessUnit | null = null;
  let confidence = 0;
  let hasUserApprovedRule = false;
  const matchedRuleIds: number[] = [];

  for (const rule of rules) {
    if (!matchesRule(row, rule)) continue;

    // First matching rule wins the classification fields
    if (financialNature === "unknown" && rule.financialNature) {
      financialNature = rule.financialNature;
    }
    if (cashFlowType === "unknown" && rule.cashFlowType) {
      cashFlowType = rule.cashFlowType;
    }
    if (pnlImpact === "maybe" && rule.pnlImpact) {
      pnlImpact = rule.pnlImpact;
    }
    if (direction === "unknown" && rule.direction) {
      direction = rule.direction;
    }
    if (!businessUnit && rule.businessUnit) {
      businessUnit = rule.businessUnit;
    }
    if (categoryId == null && rule.categoryId != null) {
      categoryId = rule.categoryId;
    }

    if (rule.createdFrom === "user") {
      hasUserApprovedRule = true;
    }

    confidence = Math.min(1, confidence + rule.confidenceBoost);
    matchedRuleIds.push(rule.id);

    // Once we hit full confidence there's no point testing more rules
    if (confidence >= 1) break;
  }

  if (cashFlowType === "unknown") {
    cashFlowType = deriveCashFlowType(financialNature, direction);
  }

  // auto_classified requires BOTH:
  //   1. confidence >= threshold
  //   2. at least one user-created rule matched
  // Seed/legacy rules alone can never promote a row to auto_classified.
  const classificationStatus: ClassificationStatus =
    confidence >= CONFIDENCE_THRESHOLD && hasUserApprovedRule
      ? "auto_classified"
      : "needs_review";

  return {
    financialNature,
    cashFlowType,
    pnlImpact,
    direction,
    categoryId,
    businessUnit,
    classificationStatus,
    confidenceScore: Math.round(confidence * 100) / 100,
    matchedRuleIds,
    hasUserApprovedRule,
  };
}

/**
 * Batch-classify an array of rows.  Returns results in the same order.
 */
export function classifyRows(
  rows: RowToClassify[],
  rules: ClassificationRule[]
): ClassificationResult[] {
  return rows.map((row) => classifyRow(row, rules));
}
