import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { getImportBatch } from "@/server/db/queries/import-batches";
import { listImportRows } from "@/server/db/queries/import-rows";
import { commitBatch } from "@/server/import/core/orchestrator";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const workspaceId = getWorkspaceIdFromRequest(request);
    const { batchId: batchIdStr } = await params;
    const batchId = Number(batchIdStr);
    if (!Number.isFinite(batchId)) {
      return NextResponse.json({ error: "Invalid batch ID" }, { status: 400 });
    }

    const batch = getImportBatch(workspaceId, batchId);
    if (!batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    const rows = listImportRows(workspaceId, batchId);

    return NextResponse.json({ batch, rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get batch";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const workspaceId = getWorkspaceIdFromRequest(request);
    const { batchId: batchIdStr } = await params;
    const batchId = Number(batchIdStr);
    if (!Number.isFinite(batchId)) {
      return NextResponse.json({ error: "Invalid batch ID" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as { action?: string };
    if (body.action !== "commit") {
      return NextResponse.json({ error: 'Expected { action: "commit" }' }, { status: 400 });
    }

    const result = await commitBatch(batchId, workspaceId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Commit failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
