import { NextResponse } from "next/server";
import { getMonthlyBreakdown } from "@/server/db/queries/monthly-breakdown";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

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

  return NextResponse.json(getMonthlyBreakdown(workspaceId, month));
}
