import { NextResponse } from "next/server";
import { listBusinessUnits } from "@/server/db/queries/business-units";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  return NextResponse.json(listBusinessUnits(workspaceId));
}
