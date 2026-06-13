import { NextResponse } from "next/server";
import { getImportRowsNeedingAction } from "@/server/db/queries/data-quality";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

const VALID_STATUSES = new Set([
  "pending",
  "pending_duplicate",
  "skipped_duplicate",
]);

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? 500);
  const batchId = searchParams.has("batchId")
    ? Number(searchParams.get("batchId"))
    : undefined;
  const rawStatus = searchParams.get("status");
  const status =
    rawStatus && VALID_STATUSES.has(rawStatus)
      ? (rawStatus as "pending" | "pending_duplicate" | "skipped_duplicate")
      : undefined;

  return NextResponse.json(
    getImportRowsNeedingAction(
      workspaceId,
      Number.isFinite(limit) ? limit : 500,
      {
        batchId:
          batchId != null && Number.isFinite(batchId) ? batchId : undefined,
        status,
      }
    )
  );
}
