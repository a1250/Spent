import "server-only";

import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { listImportBatches } from "@/server/db/queries/import-batches";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 200);
  const offset = Number(searchParams.get("offset") ?? "0");

  const safeLimit = isFinite(limit) && limit > 0 ? limit : 50;
  const safeOffset = isFinite(offset) && offset >= 0 ? offset : 0;

  const all = listImportBatches(workspaceId);
  const total = all.length;
  const batches = all.slice(safeOffset, safeOffset + safeLimit);

  return NextResponse.json({ batches, total, offset: safeOffset, limit: safeLimit });
}
