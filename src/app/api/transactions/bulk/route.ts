import { NextResponse } from "next/server";
import { bulkUpdateTransactions } from "@/server/db/queries/transactions";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import type { TransactionBulkPatch } from "@/server/db/queries/transactions";

export async function PATCH(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);

  let body: { ids?: unknown; patch?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: "ids must be a non-empty array" }, { status: 400 });
  }

  const ids = (body.ids as unknown[])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);

  if (ids.length === 0) {
    return NextResponse.json({ error: "No valid ids provided" }, { status: 400 });
  }

  if (!body.patch || typeof body.patch !== "object" || Array.isArray(body.patch)) {
    return NextResponse.json({ error: "patch must be an object" }, { status: 400 });
  }

  const rawPatch = body.patch as Record<string, unknown>;
  const allowedKeys: (keyof TransactionBulkPatch)[] = [
    "categoryId", "businessUnit", "financialNature",
    "cashFlowType", "pnlImpact", "classificationStatus",
  ];

  const patch: TransactionBulkPatch = {};
  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(rawPatch, key)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (patch as any)[key] = rawPatch[key];
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "patch contains no valid fields" }, { status: 400 });
  }

  const result = bulkUpdateTransactions(workspaceId, ids, patch);
  return NextResponse.json({ updated: result.updated });
}
