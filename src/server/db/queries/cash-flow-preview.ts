import "server-only";

import { getDb } from "../index";
import { getPnLCoverageSummary } from "./pnl-preview";
import type {
  CashFlowScopeSummaries,
  CashFlowScopeSummary,
  CashFlowTotals,
  MonthlyCashFlowDetail,
  MonthlyCashFlowPreview,
  MonthlyCashFlowRow,
  PnLReportMode,
} from "@/lib/types";

const CLASSIFIED_STATUSES =
  "('manually_approved', 'auto_classified')";
const INCLUDED_CASH_TYPES =
  "('real_cash_in', 'real_cash_out', 'internal_transfer')";
const OPERATING_NATURES =
  "('operating_income', 'operating_expense', 'tax', 'refund', 'receivable_collection', 'payable_payment')";
const FINANCING_NATURES =
  "('owner_deposit', 'owner_draw', 'loan_received', 'loan_repayment')";
const INTERNAL_NATURES = "('internal_transfer', 'working_capital')";
const MAPPED_NATURES =
  "('operating_income', 'operating_expense', 'tax', 'refund', 'receivable_collection', 'payable_payment', 'investment', 'owner_deposit', 'owner_draw', 'loan_received', 'loan_repayment', 'internal_transfer', 'working_capital')";

export interface CashFlowPreviewFilters {
  fromMonth?: string;
  toMonth?: string;
  businessUnit?: string;
  mode?: PnLReportMode;
}

interface SqlFilter {
  where: string;
  params: Array<string | number>;
}

interface MonthlyAggregateRow extends CashFlowTotals {
  month: string;
}

interface MonthlyCoverageRow {
  month: string;
  totalTransactions: number;
  classifiedTransactions: number;
  needsReviewCount: number;
  classifiedAbsoluteValue: number;
  totalAbsoluteValue: number;
  unclassifiedValue: number;
}

function percentage(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

function nextMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function buildTemporalFilter(
  workspaceId: number,
  filters: CashFlowPreviewFilters,
  alias = "t"
): SqlFilter {
  const conditions = [`${alias}.workspace_id = ?`];
  const params: Array<string | number> = [workspaceId];

  if (filters.fromMonth) {
    conditions.push(`${alias}.date >= ?`);
    params.push(`${filters.fromMonth}-01`);
  }
  if (filters.toMonth) {
    conditions.push(`${alias}.date < ?`);
    params.push(nextMonth(filters.toMonth));
  }

  return {
    where: conditions.join(" AND "),
    params,
  };
}

function buildFilter(
  workspaceId: number,
  filters: CashFlowPreviewFilters,
  alias = "t"
): SqlFilter {
  const temporal = buildTemporalFilter(workspaceId, filters, alias);
  const conditions = [temporal.where];
  const params = [...temporal.params];
  const mode = filters.mode ?? "business";

  if (mode === "business") {
    conditions.push(
      `${alias}.business_unit IS NOT NULL`,
      `${alias}.business_unit != ''`,
      `${alias}.business_unit NOT IN ('personal', 'unknown', 'shared')`
    );
    if (filters.businessUnit) {
      conditions.push(`${alias}.business_unit = ?`);
      params.push(filters.businessUnit);
    }
  } else if (mode === "personal") {
    conditions.push(`${alias}.business_unit = 'personal'`);
  } else if (filters.businessUnit === "unassigned") {
    conditions.push(
      `(${alias}.business_unit IS NULL OR ${alias}.business_unit = '' OR ${alias}.business_unit = 'unknown')`
    );
  } else if (filters.businessUnit) {
    conditions.push(`${alias}.business_unit = ?`);
    params.push(filters.businessUnit);
  }

  return {
    where: conditions.join(" AND "),
    params,
  };
}

function emptyTotals(): CashFlowTotals {
  return {
    operatingIn: 0,
    operatingOut: 0,
    netOperating: 0,
    investingIn: 0,
    investingOut: 0,
    netInvesting: 0,
    financingIn: 0,
    financingOut: 0,
    netFinancing: 0,
    internalIn: 0,
    internalOut: 0,
    internalNet: 0,
    internalMovementTotal: 0,
    netCashFlow: 0,
  };
}

function emptyScopeSummary(): CashFlowScopeSummary {
  return {
    netCashFlow: 0,
    internalMovementTotal: 0,
    transactionCount: 0,
  };
}

function getScopeSummaries(
  workspaceId: number,
  filters: CashFlowPreviewFilters
): CashFlowScopeSummaries {
  const temporal = buildTemporalFilter(workspaceId, filters);
  const rows = getDb()
    .prepare(
      `SELECT
         CASE
           WHEN t.business_unit = 'personal' THEN 'personal'
           WHEN t.business_unit = 'shared' THEN 'shared'
           WHEN t.business_unit IS NULL
             OR t.business_unit = ''
             OR t.business_unit = 'unknown'
             THEN 'unknown'
           ELSE 'business'
         END AS scope,
         COALESCE(SUM(CASE
           WHEN t.cash_flow_type != 'internal_transfer'
            AND t.financial_nature NOT IN ${INTERNAL_NATURES}
           THEN t.charged_amount ELSE 0 END), 0) AS netCashFlow,
         COALESCE(SUM(CASE
           WHEN t.cash_flow_type = 'internal_transfer'
             OR t.financial_nature IN ${INTERNAL_NATURES}
           THEN ABS(t.charged_amount) ELSE 0 END), 0) AS internalMovementTotal,
         COUNT(*) AS transactionCount
       FROM transactions t
       WHERE ${temporal.where}
         AND t.classification_status IN ${CLASSIFIED_STATUSES}
         AND t.cash_flow_type IN ${INCLUDED_CASH_TYPES}
         AND t.financial_nature IN ${MAPPED_NATURES}
       GROUP BY scope`
    )
    .all(...temporal.params) as Array<CashFlowScopeSummary & {
    scope: Exclude<keyof CashFlowScopeSummaries, "all">;
  }>;

  const summaries: CashFlowScopeSummaries = {
    business: emptyScopeSummary(),
    personal: emptyScopeSummary(),
    all: emptyScopeSummary(),
    unknown: emptyScopeSummary(),
    shared: emptyScopeSummary(),
  };

  for (const { scope, ...summary } of rows) {
    summaries[scope] = summary;
    summaries.all.netCashFlow += summary.netCashFlow;
    summaries.all.internalMovementTotal += summary.internalMovementTotal;
    summaries.all.transactionCount += summary.transactionCount;
  }

  return summaries;
}

export function getMonthlyCashFlowPreview(
  workspaceId: number,
  filters: CashFlowPreviewFilters = {}
): MonthlyCashFlowPreview {
  const db = getDb();
  const filter = buildFilter(workspaceId, filters);
  const range = db
    .prepare(
      `SELECT
         substr(MIN(date), 1, 7) AS fromMonth,
         substr(MAX(date), 1, 7) AS toMonth
       FROM transactions
       WHERE workspace_id = ?`
    )
    .get(workspaceId) as {
    fromMonth: string | null;
    toMonth: string | null;
  };

  const monthlyRows = db
    .prepare(
      `SELECT
         substr(t.date, 1, 7) AS month,
         COALESCE(SUM(CASE
           WHEN t.financial_nature IN ${OPERATING_NATURES}
            AND t.cash_flow_type = 'real_cash_in'
           THEN t.charged_amount ELSE 0 END), 0) AS operatingIn,
         COALESCE(SUM(CASE
           WHEN t.financial_nature IN ${OPERATING_NATURES}
            AND t.cash_flow_type = 'real_cash_out'
           THEN ABS(t.charged_amount) ELSE 0 END), 0) AS operatingOut,
         COALESCE(SUM(CASE
           WHEN t.financial_nature IN ${OPERATING_NATURES}
            AND t.cash_flow_type IN ('real_cash_in', 'real_cash_out')
           THEN t.charged_amount ELSE 0 END), 0) AS netOperating,
         COALESCE(SUM(CASE
           WHEN t.financial_nature = 'investment'
            AND t.cash_flow_type = 'real_cash_in'
           THEN t.charged_amount ELSE 0 END), 0) AS investingIn,
         COALESCE(SUM(CASE
           WHEN t.financial_nature = 'investment'
            AND t.cash_flow_type = 'real_cash_out'
           THEN ABS(t.charged_amount) ELSE 0 END), 0) AS investingOut,
         COALESCE(SUM(CASE
           WHEN t.financial_nature = 'investment'
            AND t.cash_flow_type IN ('real_cash_in', 'real_cash_out')
           THEN t.charged_amount ELSE 0 END), 0) AS netInvesting,
         COALESCE(SUM(CASE
           WHEN t.financial_nature IN ${FINANCING_NATURES}
            AND t.cash_flow_type = 'real_cash_in'
           THEN t.charged_amount ELSE 0 END), 0) AS financingIn,
         COALESCE(SUM(CASE
           WHEN t.financial_nature IN ${FINANCING_NATURES}
            AND t.cash_flow_type = 'real_cash_out'
           THEN ABS(t.charged_amount) ELSE 0 END), 0) AS financingOut,
         COALESCE(SUM(CASE
           WHEN t.financial_nature IN ${FINANCING_NATURES}
            AND t.cash_flow_type IN ('real_cash_in', 'real_cash_out')
           THEN t.charged_amount ELSE 0 END), 0) AS netFinancing,
         COALESCE(SUM(CASE
           WHEN (
             t.cash_flow_type = 'internal_transfer'
             OR t.financial_nature IN ${INTERNAL_NATURES}
           ) AND t.charged_amount > 0
           THEN t.charged_amount ELSE 0 END), 0) AS internalIn,
         COALESCE(SUM(CASE
           WHEN (
             t.cash_flow_type = 'internal_transfer'
             OR t.financial_nature IN ${INTERNAL_NATURES}
           ) AND t.charged_amount < 0
           THEN ABS(t.charged_amount) ELSE 0 END), 0) AS internalOut,
         COALESCE(SUM(CASE
           WHEN t.cash_flow_type = 'internal_transfer'
             OR t.financial_nature IN ${INTERNAL_NATURES}
           THEN t.charged_amount ELSE 0 END), 0) AS internalNet,
         COALESCE(SUM(CASE
           WHEN t.cash_flow_type = 'internal_transfer'
             OR t.financial_nature IN ${INTERNAL_NATURES}
           THEN ABS(t.charged_amount) ELSE 0 END), 0) AS internalMovementTotal,
         COALESCE(SUM(CASE
           WHEN t.cash_flow_type != 'internal_transfer'
            AND t.financial_nature NOT IN ${INTERNAL_NATURES}
           THEN t.charged_amount ELSE 0 END), 0) AS netCashFlow
       FROM transactions t
       WHERE ${filter.where}
         AND t.classification_status IN ${CLASSIFIED_STATUSES}
         AND t.cash_flow_type IN ${INCLUDED_CASH_TYPES}
         AND t.financial_nature IN ${MAPPED_NATURES}
       GROUP BY substr(t.date, 1, 7)
       ORDER BY month DESC`
    )
    .all(...filter.params) as MonthlyAggregateRow[];

  const monthlyCoverageRows = db
    .prepare(
      `SELECT
         substr(t.date, 1, 7) AS month,
         COUNT(*) AS totalTransactions,
         COALESCE(SUM(
           t.classification_status IN ${CLASSIFIED_STATUSES}
         ), 0) AS classifiedTransactions,
         COALESCE(SUM(
           t.classification_status = 'needs_review'
         ), 0) AS needsReviewCount,
         COALESCE(SUM(CASE
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
           THEN ABS(t.charged_amount) ELSE 0 END), 0)
           AS classifiedAbsoluteValue,
         COALESCE(SUM(ABS(t.charged_amount)), 0) AS totalAbsoluteValue,
         COALESCE(SUM(CASE
           WHEN t.classification_status NOT IN ${CLASSIFIED_STATUSES}
           THEN ABS(t.charged_amount) ELSE 0 END), 0)
           AS unclassifiedValue
       FROM transactions t
       WHERE ${filter.where}
       GROUP BY substr(t.date, 1, 7)
       ORDER BY month DESC`
    )
    .all(...filter.params) as MonthlyCoverageRow[];

  const detailRows = db
    .prepare(
      `SELECT
         substr(t.date, 1, 7) AS month,
         CASE
           WHEN t.cash_flow_type = 'internal_transfer'
             OR t.financial_nature IN ${INTERNAL_NATURES}
             THEN 'internal'
           WHEN t.financial_nature = 'investment' THEN 'investing'
           WHEN t.financial_nature IN ${FINANCING_NATURES}
             THEN 'financing'
           WHEN t.financial_nature IN ${OPERATING_NATURES}
             THEN 'operating'
         END AS section,
         t.financial_nature AS financialNature,
         COALESCE(category.name, 'Uncategorized') AS categoryName,
         COALESCE(NULLIF(t.business_unit, ''), 'unknown') AS businessUnit,
         SUM(t.charged_amount) AS amount,
         COUNT(*) AS transactionCount
       FROM transactions t
       LEFT JOIN categories category ON category.id = t.category_id
       WHERE ${filter.where}
         AND t.classification_status IN ${CLASSIFIED_STATUSES}
         AND t.cash_flow_type IN ${INCLUDED_CASH_TYPES}
         AND t.financial_nature IN ${MAPPED_NATURES}
       GROUP BY
         substr(t.date, 1, 7),
         section,
         t.financial_nature,
         categoryName,
         businessUnit
       ORDER BY month DESC, section, financialNature, categoryName`
    )
    .all(...filter.params) as Array<MonthlyCashFlowDetail & {
    month: string;
  }>;

  const detailsByMonth = new Map<string, MonthlyCashFlowDetail[]>();
  for (const { month, ...detail } of detailRows) {
    const details = detailsByMonth.get(month) ?? [];
    details.push(detail);
    detailsByMonth.set(month, details);
  }

  const aggregatesByMonth = new Map(
    monthlyRows.map((row) => [row.month, row])
  );
  const months: MonthlyCashFlowRow[] = monthlyCoverageRows.map((coverage) => {
    const aggregate =
      aggregatesByMonth.get(coverage.month) ?? {
        month: coverage.month,
        ...emptyTotals(),
      };

    return {
      ...aggregate,
      totalTransactions: coverage.totalTransactions,
      classifiedTransactions: coverage.classifiedTransactions,
      needsReviewCount: coverage.needsReviewCount,
      coverageByCount: percentage(
        coverage.classifiedTransactions,
        coverage.totalTransactions
      ),
      classifiedValueCoverage: percentage(
        coverage.classifiedAbsoluteValue,
        coverage.totalAbsoluteValue
      ),
      unclassifiedValue: coverage.unclassifiedValue,
      details: detailsByMonth.get(coverage.month) ?? [],
    };
  });

  const totals = months.reduce<CashFlowTotals>(
    (sum, month) => ({
      operatingIn: sum.operatingIn + month.operatingIn,
      operatingOut: sum.operatingOut + month.operatingOut,
      netOperating: sum.netOperating + month.netOperating,
      investingIn: sum.investingIn + month.investingIn,
      investingOut: sum.investingOut + month.investingOut,
      netInvesting: sum.netInvesting + month.netInvesting,
      financingIn: sum.financingIn + month.financingIn,
      financingOut: sum.financingOut + month.financingOut,
      netFinancing: sum.netFinancing + month.netFinancing,
      internalIn: sum.internalIn + month.internalIn,
      internalOut: sum.internalOut + month.internalOut,
      internalNet: sum.internalNet + month.internalNet,
      internalMovementTotal:
        sum.internalMovementTotal + month.internalMovementTotal,
      netCashFlow: sum.netCashFlow + month.netCashFlow,
    }),
    emptyTotals()
  );

  return {
    coverage: getPnLCoverageSummary(workspaceId, filters),
    totals,
    scopeSummaries: getScopeSummaries(workspaceId, filters),
    months,
    availableRange: range,
    filters: {
      fromMonth: filters.fromMonth ?? null,
      toMonth: filters.toMonth ?? null,
      businessUnit: filters.businessUnit ?? null,
      mode: filters.mode ?? "business",
    },
  };
}
