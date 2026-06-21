import { NextResponse } from "next/server";
import { getMonthlyBreakdown } from "@/server/db/queries/monthly-breakdown";
import { buildCsv, csvDownloadResponse } from "@/server/export/csv";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import type { CsvValue } from "@/server/export/csv";

export const dynamic = "force-dynamic";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") ?? undefined;

  if (month && !MONTH_PATTERN.test(month)) {
    return NextResponse.json(
      { error: "month must use YYYY-MM format" },
      { status: 400 }
    );
  }

  const report = getMonthlyBreakdown(workspaceId, month);
  const rows: CsvValue[][] = [
    ["Summary", "Operating Revenue", report.pnl.operatingRevenue, ""],
    ["Summary", "Refunds", report.pnl.refunds, ""],
    ["Summary", "Operating Expenses", report.pnl.operatingExpenses, ""],
    ["Summary", "Taxes", report.pnl.taxes, ""],
    ["Summary", "Net P&L", report.pnl.netPnL, ""],
    ["Summary", "Uncertain P&L", report.pnl.uncertainPnL, ""],
    ["Coverage", "Total Transactions", report.coverage.totalTransactions, ""],
    ["Coverage", "Classified Transactions", report.coverage.classifiedTransactions, ""],
    ["Coverage", "Needs Review", report.coverage.needsReviewTransactions, ""],
    ["Coverage", "Coverage By Count", `${report.coverage.coverageByCount}%`, ""],
    ["Coverage", "Coverage By Value", `${report.coverage.coverageByValue}%`, ""],
    ...report.categoryExpenseBreakdown.map((row) => [
      "Operating Expenses By Category",
      row.categoryName,
      row.amount,
      row.transactionCount,
    ]),
    ...report.incomeBreakdown.map((row) => [
      "Income By Nature",
      row.financialNature,
      row.amount,
      row.transactionCount,
    ]),
    ...report.nonPnlMovements.map((row) => [
      "Non-P&L Movements",
      row.financialNature,
      row.amount,
      row.transactionCount,
    ]),
    ...report.businessUnitBreakdown.map((row) => [
      "Business Units",
      row.businessUnit,
      row.netPnL,
      row.transactionCount,
    ]),
    ...report.needsReviewTop10.map((row) => [
      "Needs Review Top 10",
      row.description,
      row.chargedAmount,
      row.date,
    ]),
  ];

  const csv = buildCsv(["Section", "Name", "Amount / Value", "Count / Detail"], rows);
  return csvDownloadResponse(csv, `monthly-breakdown-${report.month || "empty"}.csv`);
}
