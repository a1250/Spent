import type {
  ClassificationCorrection,
  LearningRuleMatchType,
  RuleMatchField,
  RuleMatchType,
} from "@/lib/types";

export interface LearningCandidate {
  counterparty: string | null;
  description: string | null;
  sourceCategory: string | null;
}

export interface LearningRulePreview {
  field: RuleMatchField;
  type: RuleMatchType;
  value: string;
}

export interface RiskyRuleContext {
  matchType: LearningRuleMatchType;
  matchValue: string;
  correction: ClassificationCorrection;
}

export class LearningPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LearningPolicyError";
  }
}

function text(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export function resolveLearningRulePreview(
  candidate: LearningCandidate,
  requested: LearningRuleMatchType
): LearningRulePreview {
  const counterparty = text(candidate.counterparty);
  const description = text(candidate.description);
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
        throw new Error("This row has no provider source category to match");
      }
      return {
        field: "source_category",
        type: "exact",
        value: sourceCategory,
      };
  }
}

export function validateManualApproval(
  correction: ClassificationCorrection,
  otherBusinessConfirmed: boolean
): string[] {
  const errors: string[] = [];
  if (correction.categoryId == null) {
    errors.push("Choose a category before approving this row.");
  }
  if (correction.financialNature === "unknown") {
    errors.push("Choose a financial nature before approving this row.");
  }
  if (correction.cashFlowType === "unknown") {
    errors.push("Choose a cash-flow type before approving this row.");
  }
  if (
    !correction.businessUnit ||
    correction.businessUnit === "unknown"
  ) {
    errors.push(
      "Choose a business unit, or keep the row in review while it is unresolved."
    );
  }
  if (
    correction.businessUnit === "other" &&
    !otherBusinessConfirmed
  ) {
    errors.push(
      "Confirm that Other means this is business activity whose exact unit is not assigned yet."
    );
  }
  return errors;
}

export function getRiskyRuleReasons({
  matchType,
  matchValue,
  correction,
}: RiskyRuleContext): string[] {
  const normalized = matchValue
    .normalize("NFKC")
    .toLocaleLowerCase("he-IL");
  const reasons = new Set<string>();

  if (
    correction.financialNature === "tax" ||
    /\b(tax|taxes|vat|payroll)\b|מס הכנסה|מע["״']?מ|ביטוח לאומי/.test(
      normalized
    )
  ) {
    reasons.add("tax, VAT, National Insurance, or payroll-like activity");
  }
  if (/\b(bit|paybox)\b/.test(normalized)) {
    reasons.add("a payment rail that does not identify the transaction purpose");
  }
  if (
    /\b(amazon|marketplace|mktpl|temu|ebay|aliexpress)\b/.test(normalized)
  ) {
    reasons.add("a marketplace whose purchases may have different purposes");
  }
  if (/משיכת מזומן|cash withdrawal|atm/.test(normalized)) {
    reasons.add("a cash withdrawal");
  }
  if (
    correction.financialNature === "internal_transfer" ||
    correction.cashFlowType === "internal_transfer" ||
    /\btransfer\b|העברה|הע\./.test(normalized)
  ) {
    reasons.add("a transfer pattern");
  }
  if (
    matchType === "exact_merchant" ||
    matchType === "exact_counterparty"
  ) {
    reasons.add("an exact or potentially one-off pattern");
  }

  return [...reasons];
}

export function sameRulePattern(
  expected: LearningRulePreview,
  submitted: string
): boolean {
  return expected.value.trim() === submitted.trim();
}
