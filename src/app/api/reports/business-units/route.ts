import { NextResponse } from "next/server";
import { getBusinessUnitDashboard } from "@/server/db/queries/business-unit-dashboard";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  return NextResponse.json(getBusinessUnitDashboard(workspaceId));
}
