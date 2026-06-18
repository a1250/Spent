import { NextResponse } from "next/server";
import { getForecastMonth } from "@/server/db/queries/forecast";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const monthParam = searchParams.get("month");

  let month: string;
  if (monthParam && MONTH_RE.test(monthParam)) {
    month = monthParam;
  } else {
    const now = new Date();
    month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  const workspaceId = getWorkspaceIdFromRequest(request);
  const data = getForecastMonth(workspaceId, month);
  return NextResponse.json(data);
}
