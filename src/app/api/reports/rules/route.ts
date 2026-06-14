import { NextResponse } from "next/server";
import { getRuleEffectivenessReport } from "@/server/db/queries/classification-rules";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  return NextResponse.json(getRuleEffectivenessReport(workspaceId));
}
