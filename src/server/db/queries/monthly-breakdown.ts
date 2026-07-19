import "server-only";

import { getDb } from "../index";
import { getPnLCoverageSummary } from "./pnl-preview";
import type {
  MonthlyBreakdown,
  MonthlyBreakdownCategoryLine,
  MonthlyBreakdownNatureLine,
  MonthlyBreakdownBusinessUnitLine,
  MonthlyBreakdownNeedsReviewRow,
} from "@/lib/types";

const CLASSIFIED = "('manually_approved', 'auto_classified')";
const REAL_CASH = "('real_cash_in', 'real_cash_out')";
const PNL_NATURES =
  "('operating_income', 'operating_expense', 'tax', 'refund')";

export function getMonthlyBreakdown(
  workspaceId: number,
  month?: string
): MonthlyBreakdown {
  const db = getDb();

  const availableMonthRows = db
    .prepare(
      `SELECT DISTINCT substr(date, 1, 7) AS month
       FROM transactions
       WHERE workspace_id = ?
       ORDER BY month DESC`
    )
    .all(workspaceId) as { month: string }[];
  const availableMonths = availableMonthRows.map((r) => r.month);

  const resolvedMonth = month ?? availableMonths[0] ?? "";

  if (!resolvedMonth) {
    return {
      month: "",
      availableMonths,
      pnl: {
        operatingRevenue: 0,
        refunds: 0,
        operatingExpenses: 0,
        taxes: 0,
        netPnL: 0,
        uncertainPnL: 0,
      },
      coverage: {
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
        lowCoverage: false,
      },
      categoryExpenseBreakdown: [],
      incomeBreakdown: [],
      nonPnlMovements: [],
      businessUnitBreakdown: [],
      needsReviewTop10: [],
    };
  }

  const pnlRow = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE
           WHEN classification_status IN ${CLASSIFIED}
            AND pnl_impact = 'yes'
            AND cash_flow_type IN ${REAL_CASH}
            AND financial_nature = 'operating_income'
           THEN charged_amount ELSE 0 END), 0) AS operatingRevenue,
         COALESCE(SUM(CASE
           WHEN classification_status IN ${CLASSIFIED}
            AND pnl_impact = 'yes'
            AND cash_flow_type IN ${REAL_CASH}
            AND financial_nature = 'refund'
           THEN charged_amount ELSE 0 END), 0) AS refunds,
         COALESCE(SUM(CASE
           WHEN classification_status IN ${CLASSIFIED}
            AND pnl_impact = 'yes'
            AND cash_flow_type IN ${REAL_CASH}
            AND financial_nature = 'operating_expense'
           THEN ABS(charged_amount) ELSE 0 END), 0) AS operatingExpenses,
         COALESCE(SUM(CASE
           WHEN classification_status IN ${CLASSIFIED}
            AND pnl_impact = 'yes'
            AND cash_flow_type IN ${REAL_CASH}
            AND financial_nature = 'tax'
           THEN ABS(charged_amount) ELSE 0 END), 0) AS taxes,
         COALESCE(SUM(CASE
           WHEN classification_status IN ${CLASSIFIED}
            AND pnl_impact = 'yes'
            AND cash_flow_type IN ${REAL_CASH}
            AND financial_nature IN ${PNL_NATURES}
           THEN charged_amount ELSE 0 END), 0) AS netPnL,
         COALESCE(SUM(CASE
           WHEN classification_status IN ${CLASSIFIED}
            AND pnl_impact = 'maybe'
            AND cash_flow_type IN ${REAL_CASH}
           THEN charged_amount ELSE 0 END), 0) AS uncertainPnL
       FROM transactions
       WHERE workspace_id = ? AND substr(date, 1, 7) = ? AND is_excluded = 0`
    )
    .get(workspaceId, resolvedMonth) as {
    operatingRevenue: number;
    refunds: number;
    operatingExpenses: number;
    taxes: number;
    netPnL: number;
    uncertainPnL: number;
  };

  const categoryRows = db
    .prepare(
      `SELECT
         cat.id AS categoryId,
         parent.name AS parentName,
         COALESCE(cat.name, 'Uncategorized') AS categoryName,
         SUM(ABS(t.charged_amount)) AS amount,
         COUNT(*) AS transactionCount
       FROM transactions t
       LEFT JOIN categories cat ON cat.id = t.category_id
       LEFT JOIN categories parent ON parent.id = cat.parent_id
       WHERE t.workspace_id = ?
         AND substr(t.date, 1, 7) = ?
         AND t.is_excluded = 0
         AND t.classification_status IN ${CLASSIFIED}
         AND t.pnl_impact = 'yes'
         AND t.cash_flow_type IN ${REAL_CASH}
         AND t.financial_nature = 'operating_expense'
       GROUP BY cat.id, cat.name, parent.name
       ORDER BY amount DESC`
    )
    .all(workspaceId, resolvedMonth) as MonthlyBreakdownCategoryLine[];

  const incomeRows = db
    .prepare(
      `SELECT
         financial_nature AS financialNature,
         SUM(charged_amount) AS amount,
         COUNT(*) AS transactionCount
       FROM transactions
       WHERE workspace_id = ?
         AND substr(date, 1, 7) = ?
         AND is_excluded = 0
         AND classification_status IN ${CLASSIFIED}
         AND cash_flow_type = 'real_cash_in'
       GROUP BY financial_nature
       ORDER BY amount DESC`
    )
    .all(workspaceId, resolvedMonth) as MonthlyBreakdownNatureLine[];

  const nonPnlRows = db
    .prepare(
      `SELECT
         financial_nature AS financialNature,
         SUM(ABS(charged_amount)) AS amount,
         COUNT(*) AS transactionCount
       FROM transactions
       WHERE workspace_id = ?
         AND substr(date, 1, 7) = ?
         AND is_excluded = 0
         AND classification_status IN ${CLASSIFIED}
         AND financial_nature NOT IN ${PNL_NATURES}
         AND financial_nature != 'unknown'
       GROUP BY financial_nature
       ORDER BY amount DESC`
    )
    .all(workspaceId, resolvedMonth) as MonthlyBreakdownNatureLine[];

  const businessUnitRows = db
    .prepare(
      `SELECT
         COALESCE(NULLIF(business_unit, ''), 'unknown') AS businessUnit,
         COALESCE(SUM(CASE
           WHEN classification_status IN ${CLASSIFIED}
            AND pnl_impact = 'yes'
            AND cash_flow_type IN ${REAL_CASH}
            AND financial_nature IN ${PNL_NATURES}
           THEN charged_amount ELSE 0 END), 0) AS netPnL,
         COALESCE(SUM(CASE
           WHEN classification_status IN ${CLASSIFIED}
            AND pnl_impact = 'maybe'
            AND cash_flow_type IN ${REAL_CASH}
           THEN charged_amount ELSE 0 END), 0) AS uncertainPnL,
         SUM(CASE
           WHEN classification_status IN ${CLASSIFIED}
           THEN 1 ELSE 0 END) AS transactionCount
       FROM transactions
       WHERE workspace_id = ?
         AND substr(date, 1, 7) = ?
         AND is_excluded = 0
       GROUP BY COALESCE(NULLIF(business_unit, ''), 'unknown')
       ORDER BY ABS(netPnL) DESC`
    )
    .all(workspaceId, resolvedMonth) as MonthlyBreakdownBusinessUnitLine[];

  const needsReviewRows = db
    .prepare(
      `SELECT
         t.id,
         t.date,
         t.description,
         t.counterparty,
         t.charged_amount AS chargedAmount,
         t.financial_nature AS financialNature,
         cat.name AS categoryName,
         t.business_unit AS businessUnit
       FROM transactions t
       LEFT JOIN categories cat ON cat.id = t.category_id
       WHERE t.workspace_id = ?
         AND substr(t.date, 1, 7) = ?
         AND t.is_excluded = 0
         AND t.classification_status = 'needs_review'
       ORDER BY ABS(t.charged_amount) DESC
       LIMIT 10`
    )
    .all(workspaceId, resolvedMonth) as MonthlyBreakdownNeedsReviewRow[];

  const coverage = getPnLCoverageSummary(workspaceId, {
    fromMonth: resolvedMonth,
    toMonth: resolvedMonth,
  });

  return {
    month: resolvedMonth,
    availableMonths,
    pnl: pnlRow,
    coverage,
    categoryExpenseBreakdown: categoryRows,
    incomeBreakdown: incomeRows,
    nonPnlMovements: nonPnlRows,
    businessUnitBreakdown: businessUnitRows,
    needsReviewTop10: needsReviewRows,
  };
}
