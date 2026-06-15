import { NextResponse } from "next/server";
import { getDataQualityDashboard } from "@/server/db/queries/data-quality-dashboard";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  return NextResponse.json(getDataQualityDashboard(workspaceId));
}
