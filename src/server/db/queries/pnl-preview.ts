import "server-only";

import { getDb } from "../index";
import type {
  DataQualitySummary,
  MonthlyPnLDetail,
  MonthlyPnLPreview,
  MonthlyPnLRow,
  PnLExcludedSummary,
  PnLPreviewTotals,
  PnLReportMode,
  PnLScopeSummaries,
  PnLScopeSummary,
} from "@/lib/types";

const CLASSIFIED_STATUSES =
  "('manually_approved', 'auto_classified')";
const REAL_CASH_TYPES = "('real_cash_in', 'real_cash_out')";

export interface PnLPreviewFilters {
  fromMonth?: string;
  toMonth?: string;
  businessUnit?: string;
  mode?: PnLReportMode;
}

interface SqlFilter {
  where: string;
  params: Array<string | number>;
}

interface MonthlyAggregateRow {
  month: string;
  operatingRevenue: number;
  refunds: number;
  operatingExpenses: number;
  taxes: number;
  netPnL: number;
  uncertainPnL: number;
  classifiedAbsoluteValue: number;
  totalAbsoluteValue: number;
  needsReviewCount: number;
  internalTransfers: number;
  investments: number;
  workingCapital: number;
  ownerMovements: number;
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
  filters: PnLPreviewFilters,
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
  filters: PnLPreviewFilters,
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

function emptyScopeSummary(): PnLScopeSummary {
  return {
    netPnL: 0,
    uncertainPnL: 0,
    transactionCount: 0,
  };
}

function getPnLScopeSummaries(
  workspaceId: number,
  filters: PnLPreviewFilters
): PnLScopeSummaries {
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
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.pnl_impact = 'yes'
            AND t.cash_flow_type IN ${REAL_CASH_TYPES}
            AND t.financial_nature IN (
              'operating_income', 'operating_expense', 'tax', 'refund'
            )
           THEN t.charged_amount ELSE 0 END), 0) AS netPnL,
         COALESCE(SUM(CASE
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.pnl_impact = 'maybe'
            AND t.cash_flow_type IN ${REAL_CASH_TYPES}
           THEN t.charged_amount ELSE 0 END), 0) AS uncertainPnL,
         SUM(CASE
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.cash_flow_type IN ${REAL_CASH_TYPES}
            AND (
              (
                t.pnl_impact = 'yes'
                AND t.financial_nature IN (
                  'operating_income', 'operating_expense', 'tax', 'refund'
                )
              )
              OR t.pnl_impact = 'maybe'
            )
           THEN 1 ELSE 0 END) AS transactionCount
       FROM transactions t
       WHERE ${temporal.where}
       GROUP BY scope`
    )
    .all(...temporal.params) as Array<PnLScopeSummary & {
    scope: Exclude<keyof PnLScopeSummaries, "all">;
  }>;

  const summaries: PnLScopeSummaries = {
    business: emptyScopeSummary(),
    personal: emptyScopeSummary(),
    all: emptyScopeSummary(),
    unknown: emptyScopeSummary(),
    shared: emptyScopeSummary(),
  };

  for (const { scope, ...summary } of rows) {
    summaries[scope] = summary;
    summaries.all.netPnL += summary.netPnL;
    summaries.all.uncertainPnL += summary.uncertainPnL;
    summaries.all.transactionCount += summary.transactionCount;
  }

  return summaries;
}

export function getPnLCoverageSummary(
  workspaceId: number,
  filters: PnLPreviewFilters = {}
): DataQualitySummary {
  const filter = buildTemporalFilter(workspaceId, filters);
  const row = getDb()
    .prepare(
      `SELECT
         COUNT(*) AS totalTransactions,
         SUM(classification_status != 'needs_review') AS classifiedTransactions,
         SUM(classification_status = 'needs_review') AS needsReviewTransactions,
         COALESCE(SUM(ABS(charged_amount)), 0) AS totalAbsoluteValue,
         COALESCE(SUM(
           CASE WHEN classification_status != 'needs_review'
             THEN ABS(charged_amount) ELSE 0 END
         ), 0) AS classifiedAbsoluteValue,
         COALESCE(SUM(
           CASE WHEN classification_status = 'needs_review'
             THEN ABS(charged_amount) ELSE 0 END
         ), 0) AS unclassifiedValueTotal,
         COALESCE(SUM(
           CASE WHEN classification_status = 'needs_review'
                     AND charged_amount > 0
             THEN charged_amount ELSE 0 END
         ), 0) AS unclassifiedIncomeValue,
         COALESCE(SUM(
           CASE WHEN classification_status = 'needs_review'
                     AND charged_amount < 0
             THEN ABS(charged_amount) ELSE 0 END
         ), 0) AS unclassifiedExpenseValue
       FROM transactions t
       WHERE ${filter.where}`
    )
    .get(...filter.params) as {
    totalTransactions: number;
    classifiedTransactions: number | null;
    needsReviewTransactions: number | null;
    totalAbsoluteValue: number;
    classifiedAbsoluteValue: number;
    unclassifiedValueTotal: number;
    unclassifiedIncomeValue: number;
    unclassifiedExpenseValue: number;
  };

  const totalTransactions = row.totalTransactions ?? 0;
  const classifiedTransactions = row.classifiedTransactions ?? 0;
  const totalAbsoluteValue = row.totalAbsoluteValue ?? 0;
  const classifiedAbsoluteValue = row.classifiedAbsoluteValue ?? 0;
  const coverageByCount = percentage(
    classifiedTransactions,
    totalTransactions
  );

  return {
    totalTransactions,
    classifiedTransactions,
    needsReviewTransactions: row.needsReviewTransactions ?? 0,
    coverageByCount,
    coverageByValue: percentage(
      classifiedAbsoluteValue,
      totalAbsoluteValue
    ),
    totalAbsoluteValue,
    classifiedAbsoluteValue,
    unclassifiedValueTotal: row.unclassifiedValueTotal ?? 0,
    unclassifiedIncomeValue: row.unclassifiedIncomeValue ?? 0,
    unclassifiedExpenseValue: row.unclassifiedExpenseValue ?? 0,
    lowCoverage: coverageByCount < 40,
  };
}

export function getMonthlyPnLPreview(
  workspaceId: number,
  filters: PnLPreviewFilters = {}
): MonthlyPnLPreview {
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
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.pnl_impact = 'yes'
            AND t.cash_flow_type IN ${REAL_CASH_TYPES}
            AND t.financial_nature = 'operating_income'
           THEN t.charged_amount ELSE 0 END), 0) AS operatingRevenue,
         COALESCE(SUM(CASE
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.pnl_impact = 'yes'
            AND t.cash_flow_type IN ${REAL_CASH_TYPES}
            AND t.financial_nature = 'refund'
           THEN t.charged_amount ELSE 0 END), 0) AS refunds,
         COALESCE(SUM(CASE
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.pnl_impact = 'yes'
            AND t.cash_flow_type IN ${REAL_CASH_TYPES}
            AND t.financial_nature = 'operating_expense'
           THEN ABS(t.charged_amount) ELSE 0 END), 0) AS operatingExpenses,
         COALESCE(SUM(CASE
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.pnl_impact = 'yes'
            AND t.cash_flow_type IN ${REAL_CASH_TYPES}
            AND t.financial_nature = 'tax'
           THEN ABS(t.charged_amount) ELSE 0 END), 0) AS taxes,
         COALESCE(SUM(CASE
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.pnl_impact = 'yes'
            AND t.cash_flow_type IN ${REAL_CASH_TYPES}
            AND t.financial_nature IN (
              'operating_income', 'operating_expense', 'tax', 'refund'
            )
           THEN t.charged_amount ELSE 0 END), 0) AS netPnL,
         COALESCE(SUM(CASE
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.pnl_impact = 'maybe'
            AND t.cash_flow_type IN ${REAL_CASH_TYPES}
           THEN t.charged_amount ELSE 0 END), 0) AS uncertainPnL,
         COALESCE(SUM(CASE
           WHEN t.classification_status != 'needs_review'
           THEN ABS(t.charged_amount) ELSE 0 END), 0) AS classifiedAbsoluteValue,
         COALESCE(SUM(ABS(t.charged_amount)), 0) AS totalAbsoluteValue,
         SUM(t.classification_status = 'needs_review') AS needsReviewCount,
         COALESCE(SUM(CASE
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.financial_nature = 'internal_transfer'
           THEN ABS(t.charged_amount) ELSE 0 END), 0) AS internalTransfers,
         COALESCE(SUM(CASE
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.financial_nature = 'investment'
           THEN ABS(t.charged_amount) ELSE 0 END), 0) AS investments,
         COALESCE(SUM(CASE
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.financial_nature = 'working_capital'
           THEN ABS(t.charged_amount) ELSE 0 END), 0) AS workingCapital,
         COALESCE(SUM(CASE
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.financial_nature IN ('owner_deposit', 'owner_draw')
           THEN ABS(t.charged_amount) ELSE 0 END), 0) AS ownerMovements
       FROM transactions t
       WHERE ${filter.where}
       GROUP BY substr(t.date, 1, 7)
       ORDER BY month DESC`
    )
    .all(...filter.params) as MonthlyAggregateRow[];

  const detailRows = db
    .prepare(
      `SELECT
         substr(t.date, 1, 7) AS month,
         CASE
           WHEN t.pnl_impact = 'maybe' THEN 'uncertain'
           WHEN t.financial_nature = 'operating_income'
             THEN 'operating_revenue'
           WHEN t.financial_nature = 'refund' THEN 'refunds'
           WHEN t.financial_nature = 'operating_expense'
             THEN 'operating_expenses'
           WHEN t.financial_nature = 'tax' THEN 'taxes'
         END AS section,
         COALESCE(parent.name, category.name, 'Uncategorized') AS groupName,
         COALESCE(category.name, 'Uncategorized') AS categoryName,
         CASE
           WHEN t.pnl_impact = 'maybe'
             OR t.financial_nature IN ('operating_income', 'refund')
           THEN SUM(t.charged_amount)
           ELSE SUM(ABS(t.charged_amount))
         END AS amount,
         COUNT(*) AS transactionCount
       FROM transactions t
       LEFT JOIN categories category ON category.id = t.category_id
       LEFT JOIN categories parent ON parent.id = category.parent_id
       WHERE ${filter.where}
         AND t.classification_status IN ${CLASSIFIED_STATUSES}
         AND t.cash_flow_type IN ${REAL_CASH_TYPES}
         AND (
           (
             t.pnl_impact = 'yes'
             AND t.financial_nature IN (
               'operating_income', 'operating_expense', 'tax', 'refund'
             )
           )
           OR t.pnl_impact = 'maybe'
         )
       GROUP BY
         substr(t.date, 1, 7),
         section,
         groupName,
         categoryName
       ORDER BY month DESC, section, groupName, categoryName`
    )
    .all(...filter.params) as Array<MonthlyPnLDetail & { month: string }>;

  const detailsByMonth = new Map<string, MonthlyPnLDetail[]>();
  for (const { month, ...detail } of detailRows) {
    const details = detailsByMonth.get(month) ?? [];
    details.push(detail);
    detailsByMonth.set(month, details);
  }

  const months: MonthlyPnLRow[] = monthlyRows.map((row) => ({
    month: row.month,
    operatingRevenue: row.operatingRevenue,
    refunds: row.refunds,
    operatingExpenses: row.operatingExpenses,
    taxes: row.taxes,
    netPnL: row.netPnL,
    uncertainPnL: row.uncertainPnL,
    classifiedValueCoverage: percentage(
      row.classifiedAbsoluteValue,
      row.totalAbsoluteValue
    ),
    needsReviewCount: row.needsReviewCount,
    details: detailsByMonth.get(row.month) ?? [],
    excluded: {
      internalTransfers: row.internalTransfers,
      investments: row.investments,
      workingCapital: row.workingCapital,
      ownerMovements: row.ownerMovements,
    },
  }));

  const totals = months.reduce<PnLPreviewTotals>(
    (sum, month) => ({
      operatingRevenue: sum.operatingRevenue + month.operatingRevenue,
      refunds: sum.refunds + month.refunds,
      operatingExpenses: sum.operatingExpenses + month.operatingExpenses,
      taxes: sum.taxes + month.taxes,
      netPnL: sum.netPnL + month.netPnL,
      uncertainPnL: sum.uncertainPnL + month.uncertainPnL,
    }),
    {
      operatingRevenue: 0,
      refunds: 0,
      operatingExpenses: 0,
      taxes: 0,
      netPnL: 0,
      uncertainPnL: 0,
    }
  );
  const excluded = months.reduce<PnLExcludedSummary>(
    (sum, month) => ({
      internalTransfers:
        sum.internalTransfers + month.excluded.internalTransfers,
      investments: sum.investments + month.excluded.investments,
      workingCapital: sum.workingCapital + month.excluded.workingCapital,
      ownerMovements: sum.ownerMovements + month.excluded.ownerMovements,
    }),
    {
      internalTransfers: 0,
      investments: 0,
      workingCapital: 0,
      ownerMovements: 0,
    }
  );

  return {
    coverage: getPnLCoverageSummary(workspaceId, filters),
    totals,
    scopeSummaries: getPnLScopeSummaries(workspaceId, filters),
    excluded,
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
