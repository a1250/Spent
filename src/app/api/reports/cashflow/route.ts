import { NextResponse } from "next/server";
import {
  getMonthlyCashFlowPreview,
  type CashFlowPreviewFilters,
} from "@/server/db/queries/cash-flow-preview";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import type { PnLReportMode } from "@/lib/types";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const REPORT_MODES = new Set<PnLReportMode>([
  "business",
  "personal",
  "all",
]);
const NON_BUSINESS_UNITS = new Set([
  "personal",
  "unknown",
  "shared",
  "unassigned",
]);

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const fromMonth = searchParams.get("fromMonth");
  const toMonth = searchParams.get("toMonth");
  const businessUnit = searchParams.get("businessUnit");
  const requestedMode = searchParams.get("mode");
  const mode = (requestedMode ?? "business") as PnLReportMode;

  if (
    (fromMonth && !MONTH_PATTERN.test(fromMonth)) ||
    (toMonth && !MONTH_PATTERN.test(toMonth))
  ) {
    return NextResponse.json(
      { error: "Month filters must use YYYY-MM" },
      { status: 400 }
    );
  }
  if (fromMonth && toMonth && fromMonth > toMonth) {
    return NextResponse.json(
      { error: "fromMonth must not be after toMonth" },
      { status: 400 }
    );
  }
  if (!REPORT_MODES.has(mode)) {
    return NextResponse.json(
      { error: "mode must be business, personal, or all" },
      { status: 400 }
    );
  }
  if (
    mode === "business" &&
    businessUnit &&
    NON_BUSINESS_UNITS.has(businessUnit)
  ) {
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

  return NextResponse.json(
    getMonthlyCashFlowPreview(workspaceId, filters)
  );
}
