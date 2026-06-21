import { NextResponse } from "next/server";
import {
  getMonthlyCashFlowPreview,
  type CashFlowPreviewFilters,
} from "@/server/db/queries/cash-flow-preview";
import { buildCsv, csvDownloadResponse } from "@/server/export/csv";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import type { CsvValue } from "@/server/export/csv";
import type { PnLReportMode } from "@/lib/types";

export const dynamic = "force-dynamic";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const REPORT_MODES = new Set<PnLReportMode>(["business", "personal", "all"]);
const NON_BUSINESS_UNITS = new Set(["personal", "unknown", "shared", "unassigned"]);

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const fromMonth = searchParams.get("fromMonth");
  const toMonth = searchParams.get("toMonth");
  const businessUnit = searchParams.get("businessUnit");
  const mode = (searchParams.get("mode") ?? "business") as PnLReportMode;

  if (
    (fromMonth && !MONTH_PATTERN.test(fromMonth)) ||
    (toMonth && !MONTH_PATTERN.test(toMonth))
  ) {
    return NextResponse.json({ error: "Month filters must use YYYY-MM" }, { status: 400 });
  }
  if (fromMonth && toMonth && fromMonth > toMonth) {
    return NextResponse.json({ error: "fromMonth must not be after toMonth" }, { status: 400 });
  }
  if (!REPORT_MODES.has(mode)) {
    return NextResponse.json({ error: "mode must be business, personal, or all" }, { status: 400 });
  }
  if (mode === "business" && businessUnit && NON_BUSINESS_UNITS.has(businessUnit)) {
    return NextResponse.json(
      { error: "Selected business unit is not available in Business Only" },
      { status: 400 }
    );
  }

  const filters: CashFlowPreviewFilters = {
    fromMonth: fromMonth ?? undefined,
    toMonth: toMonth ?? undefined,
    businessUnit:
      mode !== "personal" && businessUnit && businessUnit !== "all"
        ? businessUnit
        : undefined,
    mode,
  };
  const report = getMonthlyCashFlowPreview(workspaceId, filters);
  const rows: CsvValue[][] = [
    ...report.months.map((row) => [
      row.month,
      "Month",
      "",
      "",
      row.operatingIn,
      row.operatingOut,
      row.netOperating,
      row.investingIn,
      row.investingOut,
      row.netInvesting,
      row.financingIn,
      row.financingOut,
      row.netFinancing,
      row.internalMovementTotal,
      row.netCashFlow,
      row.needsReviewCount,
      row.coverageByCount,
    ]),
    ...report.months.flatMap((month) =>
      month.details.map((detail) => [
        month.month,
        "Detail",
        detail.section,
        `${detail.financialNature} / ${detail.categoryName} / ${detail.businessUnit}`,
        detail.amount,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        detail.transactionCount,
        "",
      ])
    ),
  ];

  const csv = buildCsv(
    [
      "Month",
      "Row Type",
      "Section",
      "Name",
      "Operating In",
      "Operating Out",
      "Net Operating",
      "Investing In",
      "Investing Out",
      "Net Investing",
      "Financing In",
      "Financing Out",
      "Net Financing",
      "Internal Movement Total",
      "Net Cash Flow",
      "Count / Needs Review",
      "Coverage By Count %",
    ],
    rows
  );

  return csvDownloadResponse(
    csv,
    `cash-flow-${fromMonth ?? "all"}-to-${toMonth ?? "all"}-${mode}.csv`
  );
}
