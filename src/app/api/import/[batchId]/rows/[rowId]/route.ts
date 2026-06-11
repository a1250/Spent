import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import {
  updateImportRowNormalized,
  updateImportRowClassification,
  updateImportRowNotes,
  getImportRow,
} from "@/server/db/queries/import-rows";
import type {
  FinancialNature,
  PnlImpact,
  ClassificationStatus,
  BusinessUnit,
} from "@/lib/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ batchId: string; rowId: string }> }
) {
  try {
    const workspaceId = getWorkspaceIdFromRequest(request);
    const { batchId: batchIdStr, rowId: rowIdStr } = await params;
    const batchId = Number(batchIdStr);
    const rowId = Number(rowIdStr);

    if (!Number.isFinite(batchId) || !Number.isFinite(rowId)) {
      return NextResponse.json({ error: "Invalid IDs" }, { status: 400 });
    }

    const row = getImportRow(workspaceId, rowId);
    if (!row || row.batchId !== batchId) {
      return NextResponse.json({ error: "Row not found" }, { status: 404 });
    }
    if (row.importStatus === "imported") {
      return NextResponse.json(
        { error: "Row is already committed and cannot be edited" },
        { status: 409 }
      );
    }

    const body = (await request.json()) as {
      financialNature?: FinancialNature;
      pnlImpact?: PnlImpact;
      classificationStatus?: ClassificationStatus;
      businessUnit?: BusinessUnit | null;
      notes?: string | null;
      categoryId?: number | null;
    };

    // Classification fields
    if (body.financialNature || body.pnlImpact || body.classificationStatus) {
      updateImportRowClassification(workspaceId, rowId, {
        ...(body.financialNature && { financialNature: body.financialNature }),
        ...(body.pnlImpact && { pnlImpact: body.pnlImpact }),
        ...(body.classificationStatus && {
          classificationStatus: body.classificationStatus,
        }),
      });
    }

    // Normalised fields
    if ("businessUnit" in body || "categoryId" in body) {
      updateImportRowNormalized(workspaceId, rowId, {
        ...(body.businessUnit !== undefined && { businessUnit: body.businessUnit }),
        ...(body.categoryId !== undefined && { categoryId: body.categoryId }),
      });
    }

    // Notes
    if ("notes" in body) {
      updateImportRowNotes(workspaceId, rowId, body.notes ?? null);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update row";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
