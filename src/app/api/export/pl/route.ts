import { NextResponse } from "next/server";
import {
  getMonthlyPnLPreview,
  type PnLPreviewFilters,
} from "@/server/db/queries/pnl-preview";
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

  const filters: PnLPreviewFilters = {
    fromMonth: fromMonth ?? undefined,
    toMonth: toMonth ?? undefined,
    businessUnit:
      mode !== "personal" && businessUnit && businessUnit !== "all"
        ? businessUnit
        : undefined,
    mode,
  };
  const report = getMonthlyPnLPreview(workspaceId, filters);
  const rows: CsvValue[][] = [
    ...report.months.map((row) => [
      row.month,
      "Month",
      "",
      "",
      row.operatingRevenue,
      row.refunds,
      row.operatingExpenses,
      row.taxes,
      row.netPnL,
      row.uncertainPnL,
      row.needsReviewCount,
      row.classifiedValueCoverage,
    ]),
    ...report.months.flatMap((month) =>
      month.details.map((detail) => [
        month.month,
        "Detail",
        detail.section,
        `${detail.groupName} / ${detail.categoryName}`,
        detail.amount,
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
      "Operating Revenue",
      "Refunds",
      "Operating Expenses",
      "Taxes",
      "Net P&L",
      "Uncertain P&L",
      "Count / Needs Review",
      "Classified Value Coverage %",
    ],
    rows
  );

  return csvDownloadResponse(
    csv,
    `p-l-${fromMonth ?? "all"}-to-${toMonth ?? "all"}-${mode}.csv`
  );
}
