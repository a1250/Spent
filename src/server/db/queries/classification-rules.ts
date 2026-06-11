import "server-only";

import { getDb } from "../index";
import type {
  ClassificationRule,
  RuleMatchField,
  RuleMatchType,
  RuleCreatedFrom,
  FinancialNature,
  CashFlowType,
  PnlImpact,
  TransactionDirection,
  BusinessUnit,
} from "@/lib/types";

const RULE_COLUMNS = `
  id,
  workspace_id      as workspaceId,
  match_field       as matchField,
  match_type        as matchType,
  match_value       as matchValue,
  financial_nature  as financialNature,
  cash_flow_type    as cashFlowType,
  pnl_impact        as pnlImpact,
  category_id       as categoryId,
  direction,
  business_unit     as businessUnit,
  priority,
  times_applied     as timesApplied,
  confidence_boost  as confidenceBoost,
  is_active         as isActive,
  created_from      as createdFrom,
  created_at        as createdAt,
  updated_at        as updatedAt
`.trim();

function hydrate(row: Record<string, unknown>): ClassificationRule {
  return {
    ...row,
    isActive: Boolean(row.isActive),
  } as unknown as ClassificationRule;
}

export function createClassificationRule(
  workspaceId: number,
  data: {
    matchField: RuleMatchField;
    matchType: RuleMatchType;
    matchValue: string;
    financialNature?: FinancialNature | null;
    cashFlowType?: CashFlowType | null;
    pnlImpact?: PnlImpact | null;
    categoryId?: number | null;
    direction?: TransactionDirection | null;
    businessUnit?: BusinessUnit | null;
    priority?: number;
    confidenceBoost?: number;
    createdFrom?: RuleCreatedFrom;
  }
): ClassificationRule {
  const row = getDb()
    .prepare(
      `INSERT INTO classification_rules (
         workspace_id, match_field, match_type, match_value,
         financial_nature, cash_flow_type, pnl_impact, category_id,
         direction, business_unit, priority, confidence_boost, created_from
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING ${RULE_COLUMNS}`
    )
    .get(
      workspaceId,
      data.matchField,
      data.matchType,
      data.matchValue,
      data.financialNature ?? null,
      data.cashFlowType ?? null,
      data.pnlImpact ?? null,
      data.categoryId ?? null,
      data.direction ?? null,
      data.businessUnit ?? null,
      data.priority ?? 100,
      data.confidenceBoost ?? 0.2,
      data.createdFrom ?? "user"
    ) as Record<string, unknown>;
  return hydrate(row);
}

export function bulkInsertSeedRules(
  workspaceId: number,
  rules: Array<{
    matchField: RuleMatchField;
    matchType: RuleMatchType;
    matchValue: string;
    financialNature?: FinancialNature | null;
    cashFlowType?: CashFlowType | null;
    pnlImpact?: PnlImpact | null;
    categoryId?: number | null;
    direction?: TransactionDirection | null;
    businessUnit?: BusinessUnit | null;
    priority?: number;
    confidenceBoost?: number;
  }>
): number {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO classification_rules (
       workspace_id, match_field, match_type, match_value,
       financial_nature, cash_flow_type, pnl_impact, category_id,
       direction, business_unit, priority, confidence_boost, created_from
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed')`
  );
  const insert = db.transaction((items: typeof rules) => {
    let count = 0;
    for (const r of items) {
      const info = stmt.run(
        workspaceId,
        r.matchField,
        r.matchType,
        r.matchValue,
        r.financialNature ?? null,
        r.cashFlowType ?? null,
        r.pnlImpact ?? null,
        r.categoryId ?? null,
        r.direction ?? null,
        r.businessUnit ?? null,
        r.priority ?? 100,
        r.confidenceBoost ?? 0.2
      );
      count += info.changes;
    }
    return count;
  });
  return insert(rules) as number;
}

export function listClassificationRules(
  workspaceId: number,
  opts?: { activeOnly?: boolean; matchField?: RuleMatchField; createdFrom?: RuleCreatedFrom }
): ClassificationRule[] {
  const conditions = ["workspace_id = ?"];
  const params: unknown[] = [workspaceId];
  if (opts?.activeOnly) { conditions.push("is_active = 1"); }
  if (opts?.matchField) { conditions.push("match_field = ?"); params.push(opts.matchField); }
  if (opts?.createdFrom) { conditions.push("created_from = ?"); params.push(opts.createdFrom); }
  const rows = getDb()
    .prepare(
      `SELECT ${RULE_COLUMNS} FROM classification_rules
       WHERE ${conditions.join(" AND ")}
       ORDER BY priority ASC, id ASC`
    )
    .all(...params) as Record<string, unknown>[];
  return rows.map(hydrate);
}

export function getActiveRulesForEngine(workspaceId: number): ClassificationRule[] {
  const rows = getDb()
    .prepare(
      `SELECT ${RULE_COLUMNS} FROM classification_rules
       WHERE workspace_id = ? AND is_active = 1
       ORDER BY priority ASC, id ASC`
    )
    .all(workspaceId) as Record<string, unknown>[];
  return rows.map(hydrate);
}

export function incrementRuleTimesApplied(ruleId: number): void {
  getDb()
    .prepare(
      `UPDATE classification_rules
       SET times_applied = times_applied + 1, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(ruleId);
}

export function updateClassificationRule(
  workspaceId: number,
  ruleId: number,
  data: Partial<Pick<
    ClassificationRule,
    | "matchField" | "matchType" | "matchValue"
    | "financialNature" | "cashFlowType" | "pnlImpact"
    | "categoryId" | "direction" | "businessUnit"
    | "priority" | "confidenceBoost" | "isActive"
  >>
): void {
  const map: Record<string, string> = {
    matchField: "match_field",
    matchType: "match_type",
    matchValue: "match_value",
    financialNature: "financial_nature",
    cashFlowType: "cash_flow_type",
    pnlImpact: "pnl_impact",
    categoryId: "category_id",
    direction: "direction",
    businessUnit: "business_unit",
    priority: "priority",
    confidenceBoost: "confidence_boost",
    isActive: "is_active",
  };
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, col] of Object.entries(map)) {
    if (key in data) {
      sets.push(`${col} = ?`);
      const val = (data as Record<string, unknown>)[key];
      params.push(key === "isActive" ? (val ? 1 : 0) : val);
    }
  }
  if (sets.length === 0) return;
  params.push(workspaceId, ruleId);
  getDb()
    .prepare(
      `UPDATE classification_rules
       SET ${sets.join(", ")}, updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`
    )
    .run(...params);
}

export function deleteClassificationRule(workspaceId: number, ruleId: number): void {
  getDb()
    .prepare(`DELETE FROM classification_rules WHERE workspace_id = ? AND id = ?`)
    .run(workspaceId, ruleId);
}

export function countSeedRules(workspaceId: number): number {
  const result = getDb()
    .prepare(
      `SELECT COUNT(*) as n FROM classification_rules
       WHERE workspace_id = ? AND created_from = 'seed'`
    )
    .get(workspaceId) as { n: number };
  return result.n;
}
