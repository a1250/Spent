import "server-only";

import { getDb } from "../index";
import type {
  RecurringPattern,
  FinancialNature,
  CashFlowType,
  PnlImpact,
  RecurringFrequency,
  RecurringSourceType,
  ForecastItem,
  ForecastMonth,
  InstallmentAdvisory,
} from "@/lib/types";

// ── Row mapping ───────────────────────────────────────────────────────────────

interface RawPattern {
  id: number;
  workspace_id: number;
  display_label: string;
  description_pattern: string;
  counterparty_pattern: string | null;
  direction: "income" | "expense";
  business_unit: string | null;
  category_id: number | null;
  financial_nature: string;
  cash_flow_type: string;
  pnl_impact: string;
  expected_amount: number | null;
  amount_min: number | null;
  amount_max: number | null;
  amount_variance: number | null;
  frequency: string;
  expected_interval_months: number | null;
  expected_day_of_month: number | null;
  start_date: string | null;
  end_date: string | null;
  last_seen_date: string | null;
  source_type: string;
  confidence_score: number | null;
  is_active: number;
  is_user_confirmed: number;
  created_at: string;
  updated_at: string;
}

function rowToPattern(r: RawPattern): RecurringPattern {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    displayLabel: r.display_label,
    descriptionPattern: r.description_pattern,
    counterpartyPattern: r.counterparty_pattern,
    direction: r.direction,
    businessUnit: r.business_unit,
    categoryId: r.category_id,
    financialNature: r.financial_nature as FinancialNature,
    cashFlowType: r.cash_flow_type as CashFlowType,
    pnlImpact: r.pnl_impact as PnlImpact,
    expectedAmount: r.expected_amount,
    amountMin: r.amount_min,
    amountMax: r.amount_max,
    amountVariance: r.amount_variance,
    frequency: r.frequency as RecurringFrequency,
    expectedIntervalMonths: r.expected_interval_months,
    expectedDayOfMonth: r.expected_day_of_month,
    startDate: r.start_date,
    endDate: r.end_date,
    lastSeenDate: r.last_seen_date,
    sourceType: r.source_type as RecurringSourceType,
    confidenceScore: r.confidence_score,
    isActive: r.is_active === 1,
    isUserConfirmed: r.is_user_confirmed === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export interface ListPatternsOptions {
  activeOnly?: boolean;
  confirmedOnly?: boolean;
}

export function listRecurringPatterns(
  workspaceId: number,
  opts: ListPatternsOptions = {}
): RecurringPattern[] {
  let sql = `SELECT * FROM recurring_patterns WHERE workspace_id = ?`;
  const params: (number | string)[] = [workspaceId];
  if (opts.activeOnly) {
    sql += " AND is_active = 1";
  }
  if (opts.confirmedOnly) {
    sql += " AND is_user_confirmed = 1";
  }
  sql += " ORDER BY direction, display_label";
  return (getDb().prepare(sql).all(...params) as RawPattern[]).map(rowToPattern);
}

export function getRecurringPattern(
  workspaceId: number,
  id: number
): RecurringPattern | null {
  const row = getDb()
    .prepare("SELECT * FROM recurring_patterns WHERE id = ? AND workspace_id = ?")
    .get(id, workspaceId) as RawPattern | undefined;
  return row ? rowToPattern(row) : null;
}

export interface CreatePatternData {
  displayLabel: string;
  descriptionPattern: string;
  counterpartyPattern?: string | null;
  direction: "income" | "expense";
  businessUnit?: string | null;
  categoryId?: number | null;
  financialNature: FinancialNature;
  cashFlowType: CashFlowType;
  pnlImpact: PnlImpact;
  expectedAmount?: number | null;
  amountMin?: number | null;
  amountMax?: number | null;
  amountVariance?: number | null;
  frequency: RecurringFrequency;
  expectedIntervalMonths?: number | null;
  expectedDayOfMonth?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  lastSeenDate?: string | null;
  sourceType?: RecurringSourceType;
  confidenceScore?: number | null;
  isUserConfirmed: boolean;
}

export function createRecurringPattern(
  workspaceId: number,
  data: CreatePatternData
): RecurringPattern {
  const result = getDb()
    .prepare(
      `INSERT INTO recurring_patterns (
        workspace_id, display_label, description_pattern, counterparty_pattern,
        direction, business_unit, category_id, financial_nature, cash_flow_type,
        pnl_impact, expected_amount, amount_min, amount_max, amount_variance,
        frequency, expected_interval_months, expected_day_of_month,
        start_date, end_date, last_seen_date, source_type, confidence_score,
        is_user_confirmed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      workspaceId,
      data.displayLabel,
      data.descriptionPattern,
      data.counterpartyPattern ?? null,
      data.direction,
      data.businessUnit ?? null,
      data.categoryId ?? null,
      data.financialNature,
      data.cashFlowType,
      data.pnlImpact,
      data.expectedAmount ?? null,
      data.amountMin ?? null,
      data.amountMax ?? null,
      data.amountVariance ?? null,
      data.frequency,
      data.expectedIntervalMonths ?? null,
      data.expectedDayOfMonth ?? null,
      data.startDate ?? null,
      data.endDate ?? null,
      data.lastSeenDate ?? null,
      data.sourceType ?? "manual",
      data.confidenceScore ?? null,
      data.isUserConfirmed ? 1 : 0
    );
  const id = result.lastInsertRowid as number;
  return getRecurringPattern(workspaceId, id)!;
}

export interface UpdatePatternData {
  displayLabel?: string;
  counterpartyPattern?: string | null;
  businessUnit?: string | null;
  categoryId?: number | null;
  financialNature?: FinancialNature;
  cashFlowType?: CashFlowType;
  pnlImpact?: PnlImpact;
  expectedAmount?: number | null;
  amountMin?: number | null;
  amountMax?: number | null;
  amountVariance?: number | null;
  frequency?: RecurringFrequency;
  expectedIntervalMonths?: number | null;
  expectedDayOfMonth?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  isActive?: boolean;
  isUserConfirmed?: boolean;
}

export function updateRecurringPattern(
  workspaceId: number,
  id: number,
  data: UpdatePatternData
): RecurringPattern | null {
  const existing = getRecurringPattern(workspaceId, id);
  if (!existing) return null;

  const sets: string[] = ["updated_at = datetime('now')"];
  const params: (string | number | null)[] = [];

  const fields: Array<[keyof UpdatePatternData, string]> = [
    ["displayLabel", "display_label"],
    ["counterpartyPattern", "counterparty_pattern"],
    ["businessUnit", "business_unit"],
    ["categoryId", "category_id"],
    ["financialNature", "financial_nature"],
    ["cashFlowType", "cash_flow_type"],
    ["pnlImpact", "pnl_impact"],
    ["expectedAmount", "expected_amount"],
    ["amountMin", "amount_min"],
    ["amountMax", "amount_max"],
    ["amountVariance", "amount_variance"],
    ["frequency", "frequency"],
    ["expectedIntervalMonths", "expected_interval_months"],
    ["expectedDayOfMonth", "expected_day_of_month"],
    ["startDate", "start_date"],
    ["endDate", "end_date"],
  ];

  for (const [jsKey, sqlCol] of fields) {
    if (jsKey in data) {
      sets.push(`${sqlCol} = ?`);
      const val = data[jsKey as keyof UpdatePatternData];
      params.push(val === undefined ? null : (val as string | number | null));
    }
  }

  if ("isActive" in data) {
    sets.push("is_active = ?");
    params.push(data.isActive ? 1 : 0);
  }
  if ("isUserConfirmed" in data) {
    sets.push("is_user_confirmed = ?");
    params.push(data.isUserConfirmed ? 1 : 0);
  }

  params.push(id, workspaceId);
  getDb()
    .prepare(
      `UPDATE recurring_patterns SET ${sets.join(", ")} WHERE id = ? AND workspace_id = ?`
    )
    .run(...params);
  return getRecurringPattern(workspaceId, id);
}

// ── Installment advisory ──────────────────────────────────────────────────────

interface RawInstallment {
  id: number;
  description: string;
  charged_amount: number;
  installment_number: number | null;
  installment_total: number | null;
  date: string;
}

export function getInstallmentAdvisory(workspaceId: number): InstallmentAdvisory {
  const rows = getDb()
    .prepare(
      `SELECT id, description, charged_amount, installment_number, installment_total, date
       FROM transactions
       WHERE workspace_id = ? AND type = 'installments' AND is_excluded = 0
       ORDER BY description, date`
    )
    .all(workspaceId) as RawInstallment[];

  const missing = rows.filter(
    (r) => r.installment_number == null || r.installment_total == null
  );

  if (rows.length === 0 || missing.length > 0) {
    return {
      installmentRowCount: rows.length,
      rowsWithMissingSequence: missing.length,
      dataQualitySufficient: false,
      projections: [],
    };
  }

  // Group by description to find sequences
  const grouped = new Map<string, RawInstallment[]>();
  for (const r of rows) {
    const key = r.description;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }

  const projections = [];
  for (const [, txns] of grouped) {
    // Take the latest row in this sequence
    const sorted = [...txns].sort((a, b) => b.date.localeCompare(a.date));
    const latest = sorted[0];
    if (
      latest.installment_number == null ||
      latest.installment_total == null ||
      latest.installment_number >= latest.installment_total
    ) {
      continue; // sequence complete
    }

    const remaining = latest.installment_total - latest.installment_number;
    const latestDate = new Date(latest.date);
    const projectedMonths: string[] = [];
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(latestDate.getFullYear(), latestDate.getMonth() + i, 1);
      projectedMonths.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      );
    }

    projections.push({
      transactionId: latest.id,
      description: latest.description,
      chargedAmount: Math.abs(latest.charged_amount),
      installmentNumber: latest.installment_number,
      installmentTotal: latest.installment_total,
      remainingCount: remaining,
      projectedMonths,
    });
  }

  return {
    installmentRowCount: rows.length,
    rowsWithMissingSequence: 0,
    dataQualitySufficient: true,
    projections,
  };
}

// ── Forecast month ────────────────────────────────────────────────────────────

interface RawMatchTx {
  id: number;
  clean_description: string;
  kind: string;
  charged_amount: number;
  date: string;
  financial_nature: string;
  pnl_impact: string;
}

function computeStatus(
  pattern: RecurringPattern,
  matched: boolean,
  month: string
): ForecastItem["status"] {
  if (pattern.pnlImpact === "maybe") return "uncertain";
  if (!pattern.isActive) return "inactive";

  const now = new Date();
  const [year, mon] = month.split("-").map(Number);
  const monthEnd = new Date(year, mon, 0); // last day of month
  const isPast = monthEnd < now;

  if (matched) return "matched";
  if (isPast) return "missing";

  // Check if expected day of month has passed within this (current) month
  if (
    pattern.expectedDayOfMonth &&
    now.getFullYear() === year &&
    now.getMonth() + 1 === mon &&
    now.getDate() > pattern.expectedDayOfMonth
  ) {
    return "missing";
  }

  return "expected";
}

export function getForecastMonth(
  workspaceId: number,
  month: string
): ForecastMonth {
  const from = `${month}-01`;
  // YYYY-MM-31 safely covers all months in SQLite date comparison
  const to = `${month}-31`;

  const patterns = listRecurringPatterns(workspaceId, {
    activeOnly: true,
  });

  const allTx = getDb()
    .prepare(
      `SELECT id, clean_description, kind, charged_amount, date, financial_nature, pnl_impact
       FROM transactions
       WHERE workspace_id = ? AND is_excluded = 0
         AND date >= ? AND date <= ?`
    )
    .all(workspaceId, from, to) as RawMatchTx[];

  const confirmedPatterns = patterns.filter((p) => p.isUserConfirmed);
  const unconfirmedCount = patterns.filter((p) => !p.isUserConfirmed).length;

  const toForecastItem = (p: RecurringPattern): ForecastItem => {
    const kindTarget = p.direction === "income" ? "income" : "expense";
    const matched = allTx.filter(
      (tx) =>
        tx.kind === kindTarget &&
        (tx.clean_description === p.descriptionPattern ||
          tx.clean_description
            .toLowerCase()
            .includes(p.descriptionPattern.toLowerCase()))
    );
    const actualAmount =
      matched.length > 0
        ? matched.reduce((sum, tx) => sum + Math.abs(tx.charged_amount), 0)
        : null;

    return {
      patternId: p.id,
      displayLabel: p.displayLabel,
      direction: p.direction,
      financialNature: p.financialNature,
      pnlImpact: p.pnlImpact,
      expectedAmount: p.expectedAmount ?? 0,
      amountMin: p.amountMin,
      amountMax: p.amountMax,
      actualAmount,
      status: computeStatus(p, matched.length > 0, month),
      matchedTransactionIds: matched.map((tx) => tx.id),
      expectedDayOfMonth: p.expectedDayOfMonth,
    };
  };

  const confirmedPnlIncome = confirmedPatterns
    .filter((p) => p.direction === "income" && p.pnlImpact === "yes")
    .map(toForecastItem);
  const confirmedPnlExpenses = confirmedPatterns
    .filter((p) => p.direction === "expense" && p.pnlImpact === "yes")
    .map(toForecastItem);
  const confirmedNonPnlCashIn = confirmedPatterns
    .filter((p) => p.direction === "income" && p.pnlImpact === "no")
    .map(toForecastItem);
  const confirmedNonPnlCashOut = confirmedPatterns
    .filter((p) => p.direction === "expense" && p.pnlImpact === "no")
    .map(toForecastItem);
  const uncertain = confirmedPatterns
    .filter((p) => p.pnlImpact === "maybe")
    .map(toForecastItem);

  const sum = (items: ForecastItem[], field: "expectedAmount" | "actualAmount") =>
    items.reduce((acc, i) => acc + (i[field] ?? 0), 0);

  return {
    month,
    confirmedPnlIncome,
    confirmedPnlExpenses,
    confirmedNonPnlCashIn,
    confirmedNonPnlCashOut,
    uncertain,
    installmentAdvisory: getInstallmentAdvisory(workspaceId),
    totalExpectedPnlIncome: sum(confirmedPnlIncome, "expectedAmount"),
    totalExpectedPnlExpenses: sum(confirmedPnlExpenses, "expectedAmount"),
    totalActualPnlIncome: sum(confirmedPnlIncome, "actualAmount"),
    totalActualPnlExpenses: sum(confirmedPnlExpenses, "actualAmount"),
    unconfirmedSuggestionCount: unconfirmedCount,
  };
}
