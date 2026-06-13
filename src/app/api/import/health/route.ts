import { NextResponse } from "next/server";
import { getImportHealth } from "@/server/db/queries/data-quality";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  return NextResponse.json(getImportHealth(workspaceId));
}
