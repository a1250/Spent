import "server-only";
import { NextResponse } from "next/server";
import { getAuditLog } from "@/server/db/queries/transactions";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 200);
  const offset = Number(searchParams.get("offset") ?? "0");
  const result = getAuditLog(workspaceId, isFinite(limit) ? limit : 50, isFinite(offset) ? offset : 0);
  return NextResponse.json(result);
}
