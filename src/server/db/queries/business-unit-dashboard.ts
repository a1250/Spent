import "server-only";

import { getDb } from "../index";
import { listBusinessUnits } from "./business-units";
import type {
  BusinessUnitDashboard,
  BusinessUnitDashboardRow,
  BusinessUnitDashboardTransaction,
  BusinessUnitMonthlySummary,
  BusinessUnitWarning,
  CashFlowTotals,
  ClassificationStatus,
  DataQualitySummary,
  FinancialNature,
  PnLPreviewTotals,
} from "@/lib/types";

const CLASSIFIED_STATUSES =
  "('manually_approved', 'auto_classified')";
const REAL_CASH_TYPES = "('real_cash_in', 'real_cash_out')";
const INCLUDED_CASH_TYPES =
  "('real_cash_in', 'real_cash_out', 'internal_transfer')";
const OPERATING_NATURES =
  "('operating_income', 'operating_expense', 'tax', 'refund', 'receivable_collection', 'payable_payment')";
const FINANCING_NATURES =
  "('owner_deposit', 'owner_draw', 'loan_received', 'loan_repayment')";
const INTERNAL_NATURES = "('internal_transfer', 'working_capital')";
const MAPPED_NATURES =
  "('operating_income', 'operating_expense', 'tax', 'refund', 'receivable_collection', 'payable_payment', 'investment', 'owner_deposit', 'owner_draw', 'loan_received', 'loan_repayment', 'internal_transfer', 'working_capital')";
const UNIT_KEY =
  "CASE WHEN t.business_unit IS NULL OR t.business_unit = '' OR t.business_unit = 'unknown' THEN 'unknown' ELSE t.business_unit END";

interface UnitAggregateRow extends PnLPreviewTotals, CashFlowTotals {
  unitKey: string;
  totalTransactions: number;
  classifiedTransactions: number;
  needsReviewTransactions: number;
  totalAbsoluteValue: number;
  classifiedAbsoluteValue: number;
  unclassifiedValueTotal: number;
  unclassifiedIncomeValue: number;
  unclassifiedExpenseValue: number;
}

interface MonthlyAggregateRow {
  unitKey: string;
  month: string;
  netPnL: number;
  uncertainPnL: number;
  netCashFlow: number;
  internalMovementTotal: number;
  totalTransactions: number;
  classifiedTransactions: number;
  needsReviewTransactions: number;
  totalAbsoluteValue: number;
  classifiedAbsoluteValue: number;
}

interface TopTransactionRow {
  unitKey: string;
  id: number;
  date: string;
  description: string;
  counterparty: string | null;
  amount: number;
  financialNature: FinancialNature;
  categoryName: string | null;
  classificationStatus: ClassificationStatus;
  pnlIncluded: number;
}

function percentage(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

function emptyPnL(): PnLPreviewTotals {
  return {
    operatingRevenue: 0,
    refunds: 0,
    operatingExpenses: 0,
    taxes: 0,
    netPnL: 0,
    uncertainPnL: 0,
  };
}

function emptyCashFlow(): CashFlowTotals {
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

function emptyQuality(): DataQualitySummary {
  return {
    totalTransactions: 0,
    classifiedTransactions: 0,
    needsReviewTransactions: 0,
    coverageByCount: 0,
    coverageByValue: 0,
    totalAbsoluteValue: 0,
    classifiedAbsoluteValue: 0,
    unclassifiedValueTotal: 0,
    unclassifiedIncomeValue: 0,
    unclassifiedExpenseValue: 0,
    lowCoverage: true,
  };
}

function toQuality(row: UnitAggregateRow | undefined): DataQualitySummary {
  if (!row) return emptyQuality();

  const coverageByCount = percentage(
    row.classifiedTransactions,
    row.totalTransactions
  );
  return {
    totalTransactions: row.totalTransactions,
    classifiedTransactions: row.classifiedTransactions,
    needsReviewTransactions: row.needsReviewTransactions,
    coverageByCount,
    coverageByValue: percentage(
      row.classifiedAbsoluteValue,
      row.totalAbsoluteValue
    ),
    totalAbsoluteValue: row.totalAbsoluteValue,
    classifiedAbsoluteValue: row.classifiedAbsoluteValue,
    unclassifiedValueTotal: row.unclassifiedValueTotal,
    unclassifiedIncomeValue: row.unclassifiedIncomeValue,
    unclassifiedExpenseValue: row.unclassifiedExpenseValue,
    lowCoverage: coverageByCount < 40,
  };
}

function getWarnings(
  slug: string,
  pnl: PnLPreviewTotals,
  quality: DataQualitySummary
): BusinessUnitWarning[] {
  const warnings: BusinessUnitWarning[] = [];

  if (slug === "unknown") warnings.push("unknown_business_unit");
  if (slug === "shared") warnings.push("shared_not_allocated");
  if (quality.classifiedTransactions === 0) {
    warnings.push("no_classified_rows");
  }
  if (quality.totalTransactions > 0 && quality.coverageByCount < 40) {
    warnings.push("low_coverage");
  }
  if (
    Math.abs(pnl.uncertainPnL) >= 1_000 &&
    Math.abs(pnl.uncertainPnL) >
      Math.max(Math.abs(pnl.netPnL) * 0.1, 1_000)
  ) {
    warnings.push("high_uncertain_pnl");
  }
  if (quality.unclassifiedValueTotal >= 10_000) {
    warnings.push("needs_review_high_value");
  }

  return warnings;
}

function asDashboardTransaction(
  row: TopTransactionRow
): BusinessUnitDashboardTransaction {
  return {
    id: row.id,
    date: row.date,
    description: row.description,
    counterparty: row.counterparty,
    amount: row.amount,
    financialNature: row.financialNature,
    categoryName: row.categoryName,
    classificationStatus: row.classificationStatus,
  };
}

export function getBusinessUnitDashboard(
  workspaceId: number
): BusinessUnitDashboard {
  const db = getDb();
  const activeUnits = listBusinessUnits(workspaceId);

  const aggregateRows = db
    .prepare(
      `SELECT
         ${UNIT_KEY} AS unitKey,
         COUNT(*) AS totalTransactions,
         COALESCE(SUM(
           t.classification_status IN ${CLASSIFIED_STATUSES}
         ), 0) AS classifiedTransactions,
         COALESCE(SUM(
           t.classification_status = 'needs_review'
         ), 0) AS needsReviewTransactions,
         COALESCE(SUM(ABS(t.charged_amount)), 0) AS totalAbsoluteValue,
         COALESCE(SUM(CASE
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
           THEN ABS(t.charged_amount) ELSE 0 END
         ), 0) AS classifiedAbsoluteValue,
         COALESCE(SUM(CASE
           WHEN t.classification_status NOT IN ${CLASSIFIED_STATUSES}
           THEN ABS(t.charged_amount) ELSE 0 END
         ), 0) AS unclassifiedValueTotal,
         COALESCE(SUM(CASE
           WHEN t.classification_status = 'needs_review'
            AND t.charged_amount > 0
           THEN t.charged_amount ELSE 0 END
         ), 0) AS unclassifiedIncomeValue,
         COALESCE(SUM(CASE
           WHEN t.classification_status = 'needs_review'
            AND t.charged_amount < 0
           THEN ABS(t.charged_amount) ELSE 0 END
         ), 0) AS unclassifiedExpenseValue,

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
           THEN ABS(t.charged_amount) ELSE 0 END), 0)
           AS operatingExpenses,
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
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.cash_flow_type IN ${INCLUDED_CASH_TYPES}
            AND t.financial_nature IN ${OPERATING_NATURES}
            AND t.cash_flow_type = 'real_cash_in'
           THEN t.charged_amount ELSE 0 END), 0) AS operatingIn,
         COALESCE(SUM(CASE
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.cash_flow_type IN ${INCLUDED_CASH_TYPES}
            AND t.financial_nature IN ${OPERATING_NATURES}
            AND t.cash_flow_type = 'real_cash_out'
           THEN ABS(t.charged_amount) ELSE 0 END), 0) AS operatingOut,
         COALESCE(SUM(CASE
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.cash_flow_type IN ${REAL_CASH_TYPES}
            AND t.financial_nature IN ${OPERATING_NATURES}
           THEN t.charged_amount ELSE 0 END), 0) AS netOperating,
         COALESCE(SUM(CASE
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.cash_flow_type = 'real_cash_in'
            AND t.financial_nature = 'investment'
           THEN t.charged_amount ELSE 0 END), 0) AS investingIn,
         COALESCE(SUM(CASE
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.cash_flow_type = 'real_cash_out'
            AND t.financial_nature = 'investment'
           THEN ABS(t.charged_amount) ELSE 0 END), 0) AS investingOut,
         COALESCE(SUM(CASE
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.cash_flow_type IN ${REAL_CASH_TYPES}
            AND t.financial_nature = 'investment'
           THEN t.charged_amount ELSE 0 END), 0) AS netInvesting,
         COALESCE(SUM(CASE
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.cash_flow_type = 'real_cash_in'
            AND t.financial_nature IN ${FINANCING_NATURES}
           THEN t.charged_amount ELSE 0 END), 0) AS financingIn,
         COALESCE(SUM(CASE
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.cash_flow_type = 'real_cash_out'
            AND t.financial_nature IN ${FINANCING_NATURES}
           THEN ABS(t.charged_amount) ELSE 0 END), 0) AS financingOut,
         COALESCE(SUM(CASE
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.cash_flow_type IN ${REAL_CASH_TYPES}
            AND t.financial_nature IN ${FINANCING_NATURES}
           THEN t.charged_amount ELSE 0 END), 0) AS netFinancing,
         COALESCE(SUM(CASE
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.cash_flow_type IN ${INCLUDED_CASH_TYPES}
            AND (
              t.cash_flow_type = 'internal_transfer'
              OR t.financial_nature IN ${INTERNAL_NATURES}
            )
            AND t.charged_amount > 0
           THEN t.charged_amount ELSE 0 END), 0) AS internalIn,
         COALESCE(SUM(CASE
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.cash_flow_type IN ${INCLUDED_CASH_TYPES}
            AND (
              t.cash_flow_type = 'internal_transfer'
              OR t.financial_nature IN ${INTERNAL_NATURES}
            )
            AND t.charged_amount < 0
           THEN ABS(t.charged_amount) ELSE 0 END), 0) AS internalOut,
         COALESCE(SUM(CASE
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.cash_flow_type IN ${INCLUDED_CASH_TYPES}
            AND (
              t.cash_flow_type = 'internal_transfer'
              OR t.financial_nature IN ${INTERNAL_NATURES}
            )
           THEN t.charged_amount ELSE 0 END), 0) AS internalNet,
         COALESCE(SUM(CASE
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.cash_flow_type IN ${INCLUDED_CASH_TYPES}
            AND (
              t.cash_flow_type = 'internal_transfer'
              OR t.financial_nature IN ${INTERNAL_NATURES}
            )
           THEN ABS(t.charged_amount) ELSE 0 END), 0)
           AS internalMovementTotal,
         COALESCE(SUM(CASE
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.cash_flow_type IN ${INCLUDED_CASH_TYPES}
            AND t.financial_nature IN ${MAPPED_NATURES}
            AND t.cash_flow_type != 'internal_transfer'
            AND t.financial_nature NOT IN ${INTERNAL_NATURES}
           THEN t.charged_amount ELSE 0 END), 0) AS netCashFlow
       FROM transactions t
       WHERE t.workspace_id = ? AND t.is_excluded = 0
       GROUP BY unitKey`
    )
    .all(workspaceId) as UnitAggregateRow[];

  const monthlyRows = db
    .prepare(
      `SELECT
         ${UNIT_KEY} AS unitKey,
         substr(t.date, 1, 7) AS month,
         COUNT(*) AS totalTransactions,
         COALESCE(SUM(
           t.classification_status IN ${CLASSIFIED_STATUSES}
         ), 0) AS classifiedTransactions,
         COALESCE(SUM(
           t.classification_status = 'needs_review'
         ), 0) AS needsReviewTransactions,
         COALESCE(SUM(ABS(t.charged_amount)), 0) AS totalAbsoluteValue,
         COALESCE(SUM(CASE
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
           THEN ABS(t.charged_amount) ELSE 0 END
         ), 0) AS classifiedAbsoluteValue,
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
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.cash_flow_type IN ${INCLUDED_CASH_TYPES}
            AND t.financial_nature IN ${MAPPED_NATURES}
            AND t.cash_flow_type != 'internal_transfer'
            AND t.financial_nature NOT IN ${INTERNAL_NATURES}
           THEN t.charged_amount ELSE 0 END), 0) AS netCashFlow,
         COALESCE(SUM(CASE
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.cash_flow_type IN ${INCLUDED_CASH_TYPES}
            AND (
              t.cash_flow_type = 'internal_transfer'
              OR t.financial_nature IN ${INTERNAL_NATURES}
            )
           THEN ABS(t.charged_amount) ELSE 0 END), 0)
           AS internalMovementTotal
       FROM transactions t
       WHERE t.workspace_id = ? AND t.is_excluded = 0
       GROUP BY unitKey, substr(t.date, 1, 7)
       ORDER BY month DESC`
    )
    .all(workspaceId) as MonthlyAggregateRow[];

  const topRows = db
    .prepare(
      `SELECT
         ${UNIT_KEY} AS unitKey,
         t.id,
         t.date,
         t.description,
         t.counterparty,
         t.charged_amount AS amount,
         t.financial_nature AS financialNature,
         c.name AS categoryName,
         t.classification_status AS classificationStatus,
         CASE
           WHEN t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.pnl_impact = 'yes'
            AND t.cash_flow_type IN ${REAL_CASH_TYPES}
            AND t.financial_nature IN (
              'operating_income', 'operating_expense', 'tax', 'refund'
            )
           THEN 1 ELSE 0
         END AS pnlIncluded
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.workspace_id = ?
        AND t.is_excluded = 0
        AND (
          t.classification_status = 'needs_review'
          OR (
            t.classification_status IN ${CLASSIFIED_STATUSES}
            AND t.pnl_impact = 'yes'
            AND t.cash_flow_type IN ${REAL_CASH_TYPES}
            AND t.financial_nature IN (
              'operating_income', 'operating_expense', 'tax', 'refund'
            )
          )
        )
       ORDER BY ABS(t.charged_amount) DESC, t.id ASC`
    )
    .all(workspaceId) as TopTransactionRow[];

  const aggregates = new Map(
    aggregateRows.map((row) => [row.unitKey, row])
  );
  const months = new Map<string, BusinessUnitMonthlySummary[]>();
  for (const row of monthlyRows) {
    const unitMonths = months.get(row.unitKey) ?? [];
    unitMonths.push({
      month: row.month,
      netPnL: row.netPnL,
      uncertainPnL: row.uncertainPnL,
      netCashFlow: row.netCashFlow,
      internalMovementTotal: row.internalMovementTotal,
      totalTransactions: row.totalTransactions,
      classifiedTransactions: row.classifiedTransactions,
      needsReviewTransactions: row.needsReviewTransactions,
      coverageByCount: percentage(
        row.classifiedTransactions,
        row.totalTransactions
      ),
      coverageByValue: percentage(
        row.classifiedAbsoluteValue,
        row.totalAbsoluteValue
      ),
    });
    months.set(row.unitKey, unitMonths);
  }

  const topIncome = new Map<string, BusinessUnitDashboardTransaction[]>();
  const topExpenses = new Map<string, BusinessUnitDashboardTransaction[]>();
  const topNeedsReview = new Map<
    string,
    BusinessUnitDashboardTransaction[]
  >();
  for (const row of topRows) {
    const destination =
      row.classificationStatus === "needs_review"
        ? topNeedsReview
        : row.pnlIncluded &&
            row.financialNature === "operating_income" &&
            row.amount > 0
          ? topIncome
          : row.pnlIncluded &&
              ["operating_expense", "tax"].includes(
                row.financialNature
              ) &&
              row.amount < 0
            ? topExpenses
            : null;
    if (!destination) continue;

    const items = destination.get(row.unitKey) ?? [];
    if (items.length < 5) items.push(asDashboardTransaction(row));
    destination.set(row.unitKey, items);
  }

  const units: BusinessUnitDashboardRow[] = activeUnits.map((unit) => {
    const aggregate = aggregates.get(unit.slug);
    const pnl = aggregate
      ? {
          operatingRevenue: aggregate.operatingRevenue,
          refunds: aggregate.refunds,
          operatingExpenses: aggregate.operatingExpenses,
          taxes: aggregate.taxes,
          netPnL: aggregate.netPnL,
          uncertainPnL: aggregate.uncertainPnL,
        }
      : emptyPnL();
    const cashFlow = aggregate
      ? {
          operatingIn: aggregate.operatingIn,
          operatingOut: aggregate.operatingOut,
          netOperating: aggregate.netOperating,
          investingIn: aggregate.investingIn,
          investingOut: aggregate.investingOut,
          netInvesting: aggregate.netInvesting,
          financingIn: aggregate.financingIn,
          financingOut: aggregate.financingOut,
          netFinancing: aggregate.netFinancing,
          internalIn: aggregate.internalIn,
          internalOut: aggregate.internalOut,
          internalNet: aggregate.internalNet,
          internalMovementTotal: aggregate.internalMovementTotal,
          netCashFlow: aggregate.netCashFlow,
        }
      : emptyCashFlow();
    const quality = toQuality(aggregate);

    return {
      id: unit.id,
      slug: unit.slug,
      label: unit.label,
      color: unit.color,
      sortOrder: unit.sortOrder,
      pnl,
      cashFlow,
      quality,
      warnings: getWarnings(unit.slug, pnl, quality),
      months: months.get(unit.slug) ?? [],
      topIncome: topIncome.get(unit.slug) ?? [],
      topExpenses: topExpenses.get(unit.slug) ?? [],
      topNeedsReview: topNeedsReview.get(unit.slug) ?? [],
    };
  });

  units.sort((a, b) => {
    const activityRank = (unit: BusinessUnitDashboardRow) =>
      unit.quality.classifiedTransactions > 0
        ? 0
        : unit.quality.needsReviewTransactions > 0
          ? 1
          : 2;
    const rankDifference = activityRank(a) - activityRank(b);
    if (rankDifference !== 0) return rankDifference;
    if (activityRank(a) === 0) {
      const valueDifference =
        b.quality.classifiedAbsoluteValue -
        a.quality.classifiedAbsoluteValue;
      if (valueDifference !== 0) return valueDifference;
    }
    if (activityRank(a) === 1) {
      const reviewDifference =
        b.quality.unclassifiedValueTotal -
        a.quality.unclassifiedValueTotal;
      if (reviewDifference !== 0) return reviewDifference;
    }
    return a.sortOrder - b.sortOrder;
  });

  const globalTotals = aggregateRows.reduce(
    (totals, row) => ({
      totalTransactions:
        totals.totalTransactions + row.totalTransactions,
      classifiedTransactions:
        totals.classifiedTransactions + row.classifiedTransactions,
      needsReviewTransactions:
        totals.needsReviewTransactions + row.needsReviewTransactions,
      totalAbsoluteValue:
        totals.totalAbsoluteValue + row.totalAbsoluteValue,
      classifiedAbsoluteValue:
        totals.classifiedAbsoluteValue + row.classifiedAbsoluteValue,
      unclassifiedValueTotal:
        totals.unclassifiedValueTotal + row.unclassifiedValueTotal,
      unclassifiedIncomeValue:
        totals.unclassifiedIncomeValue + row.unclassifiedIncomeValue,
      unclassifiedExpenseValue:
        totals.unclassifiedExpenseValue + row.unclassifiedExpenseValue,
    }),
    {
      totalTransactions: 0,
      classifiedTransactions: 0,
      needsReviewTransactions: 0,
      totalAbsoluteValue: 0,
      classifiedAbsoluteValue: 0,
      unclassifiedValueTotal: 0,
      unclassifiedIncomeValue: 0,
      unclassifiedExpenseValue: 0,
    }
  );
  const globalCoverageByCount = percentage(
    globalTotals.classifiedTransactions,
    globalTotals.totalTransactions
  );
  const coverage: DataQualitySummary = {
    ...globalTotals,
    coverageByCount: globalCoverageByCount,
    coverageByValue: percentage(
      globalTotals.classifiedAbsoluteValue,
      globalTotals.totalAbsoluteValue
    ),
    lowCoverage: globalCoverageByCount < 40,
  };

  const personalAggregate = aggregates.get("personal");
  const businessAggregates = aggregateRows.filter(
    (row) =>
      !["personal", "unknown", "shared"].includes(row.unitKey)
  );

  return {
    coverage,
    summary: {
      businessNetPnL: businessAggregates.reduce(
        (sum, row) => sum + row.netPnL,
        0
      ),
      businessNetCashFlow: businessAggregates.reduce(
        (sum, row) => sum + row.netCashFlow,
        0
      ),
      personalNetPnL: personalAggregate?.netPnL ?? 0,
      personalNetCashFlow: personalAggregate?.netCashFlow ?? 0,
      allUnitsNetPnL: aggregateRows.reduce(
        (sum, row) => sum + row.netPnL,
        0
      ),
      allUnitsNetCashFlow: aggregateRows.reduce(
        (sum, row) => sum + row.netCashFlow,
        0
      ),
      needsReviewTransactions: coverage.needsReviewTransactions,
    },
    units,
  };
}
