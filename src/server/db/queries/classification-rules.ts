import "server-only";

import { getDb } from "../index";
import type {
  ClassificationRule,
  RuleMatchField,
  RuleMatchType,
  RuleCreatedFrom,
  RuleSource,
  FinancialNature,
  CashFlowType,
  PnlImpact,
  TransactionDirection,
  BusinessUnit,
  RuleEffectiveness,
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
  rule_source       as ruleSource,
  created_from_import_row_id as createdFromImportRowId,
  created_from_transaction_id as createdFromTransactionId,
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
    ruleSource?: RuleSource;
    createdFromImportRowId?: number | null;
    createdFromTransactionId?: number | null;
  }
): ClassificationRule {
  const createdFrom = data.createdFrom ?? "user";
  const ruleSource =
    data.ruleSource ??
    (createdFrom === "seed"
      ? "legacy_index"
      : createdFrom === "ai"
        ? "ai_approved"
        : "user_approved");
  const row = getDb()
    .prepare(
      `INSERT INTO classification_rules (
         workspace_id, match_field, match_type, match_value,
         financial_nature, cash_flow_type, pnl_impact, category_id,
         direction, business_unit, priority, confidence_boost, created_from,
         rule_source, created_from_import_row_id, created_from_transaction_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      createdFrom,
      ruleSource,
      data.createdFromImportRowId ?? null,
      data.createdFromTransactionId ?? null
    ) as Record<string, unknown>;
  return hydrate(row);
}

export function saveUserClassificationRule(
  workspaceId: number,
  data: {
    matchField: RuleMatchField;
    matchType: RuleMatchType;
    matchValue: string;
    financialNature: FinancialNature;
    cashFlowType: CashFlowType;
    pnlImpact: PnlImpact;
    categoryId: number | null;
    direction: TransactionDirection | null;
    businessUnit: BusinessUnit | null;
    createdFromImportRowId?: number | null;
    createdFromTransactionId?: number | null;
  }
): ClassificationRule {
  const existing = getDb()
    .prepare(
      `SELECT id
       FROM classification_rules
       WHERE workspace_id = ?
         AND match_field = ?
         AND match_type = ?
         AND match_value = ?
         AND created_from = 'user'
       ORDER BY id
       LIMIT 1`
    )
    .get(
      workspaceId,
      data.matchField,
      data.matchType,
      data.matchValue
    ) as { id: number } | undefined;

  if (!existing) {
    return createClassificationRule(workspaceId, {
      matchField: data.matchField,
      matchType: data.matchType,
      matchValue: data.matchValue,
      financialNature: data.financialNature,
      cashFlowType: data.cashFlowType,
      pnlImpact: data.pnlImpact,
      categoryId: data.categoryId,
      direction: data.direction,
      businessUnit: data.businessUnit,
      priority: 25,
      confidenceBoost: 0.9,
      createdFrom: "user",
      ruleSource: "user_approved",
      createdFromImportRowId: data.createdFromImportRowId,
      createdFromTransactionId: data.createdFromTransactionId,
    });
  }

  updateClassificationRule(workspaceId, existing.id, {
    financialNature: data.financialNature,
    cashFlowType: data.cashFlowType,
    pnlImpact: data.pnlImpact,
    categoryId: data.categoryId,
    direction: data.direction,
    businessUnit: data.businessUnit,
    priority: 25,
    confidenceBoost: 0.9,
    isActive: true,
  });
  getDb()
    .prepare(
      `UPDATE classification_rules
       SET rule_source = 'user_approved',
           created_from_import_row_id =
             COALESCE(created_from_import_row_id, ?),
           created_from_transaction_id =
             COALESCE(created_from_transaction_id, ?),
           updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`
    )
    .run(
      data.createdFromImportRowId ?? null,
      data.createdFromTransactionId ?? null,
      workspaceId,
      existing.id
    );
  return hydrate(
    getDb()
      .prepare(
        `SELECT ${RULE_COLUMNS}
         FROM classification_rules
         WHERE workspace_id = ? AND id = ?`
      )
      .get(workspaceId, existing.id) as Record<string, unknown>
  );
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
       direction, business_unit, priority, confidence_boost, created_from,
       rule_source
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', 'legacy_index')`
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

export function getUserApprovedRuleEffectiveness(
  workspaceId: number
): RuleEffectiveness[] {
  const rows = getDb()
    .prepare(
      `SELECT
         r.id                  as ruleId,
         r.rule_source         as ruleSource,
         r.match_field         as matchField,
         r.match_type          as matchType,
         r.match_value         as matchValue,
         r.category_id         as categoryId,
         c.name                as categoryName,
         r.financial_nature    as financialNature,
         r.cash_flow_type      as cashFlowType,
         r.pnl_impact          as pnlImpact,
         r.business_unit       as businessUnit,
         r.is_active           as isActive,
         r.created_at          as createdAt,
         COUNT(ir.id)          as appliedRows,
         MAX(ir.applied_rule_at) as lastAppliedAt,
         AVG(ir.applied_rule_confidence) as averageAppliedConfidence
       FROM classification_rules r
       LEFT JOIN categories c
         ON c.id = r.category_id
       LEFT JOIN import_rows ir
         ON ir.workspace_id = r.workspace_id
        AND ir.applied_rule_id = r.id
       WHERE r.workspace_id = ?
         AND r.rule_source = 'user_approved'
       GROUP BY r.id
       ORDER BY appliedRows DESC, r.id ASC`
    )
    .all(workspaceId) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    ...row,
    isActive: Boolean(row.isActive),
  })) as RuleEffectiveness[];
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
