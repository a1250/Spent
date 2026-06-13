import { NextResponse } from "next/server";
import {
  getMonthlyPnLPreview,
  type PnLPreviewFilters,
} from "@/server/db/queries/pnl-preview";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const fromMonth = searchParams.get("fromMonth");
  const toMonth = searchParams.get("toMonth");
  const businessUnit = searchParams.get("businessUnit");

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

  const filters: PnLPreviewFilters = {
    fromMonth: fromMonth ?? undefined,
    toMonth: toMonth ?? undefined,
    businessUnit:
      businessUnit && businessUnit !== "all" ? businessUnit : undefined,
  };

  return NextResponse.json(getMonthlyPnLPreview(workspaceId, filters));
}
