import { NextResponse } from "next/server";
import { getNeedsReviewTransactions } from "@/server/db/queries/data-quality";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? 200);
  const importBatchId = searchParams.has("importBatchId")
    ? Number(searchParams.get("importBatchId"))
    : undefined;

  return NextResponse.json(
    getNeedsReviewTransactions(
      workspaceId,
      Number.isFinite(limit) ? limit : 200,
      {
        importBatchId:
          importBatchId != null && Number.isFinite(importBatchId)
            ? importBatchId
            : undefined,
        search: searchParams.get("search") ?? undefined,
      }
    )
  );
}
