import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import {
  updateImportRowNotes,
  getImportRow,
} from "@/server/db/queries/import-rows";
import {
  importPendingRow,
  reviewDuplicateRow,
  type DuplicateReviewAction,
} from "@/server/import/core/orchestrator";
import { applyImportRowLearning } from "@/server/classification/learning-rules";
import { LearningPolicyError } from "@/lib/classification-learning-policy";
import type {
  FinancialNature,
  CashFlowType,
  PnlImpact,
  ClassificationStatus,
  BusinessUnit,
  LearningApplyScope,
  LearningDecision,
  LearningRuleMatchType,
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
      cashFlowType?: CashFlowType;
      pnlImpact?: PnlImpact;
      classificationStatus?: ClassificationStatus;
      businessUnit?: BusinessUnit | null;
      notes?: string | null;
      categoryId?: number | null;
      duplicateAction?: DuplicateReviewAction;
      pendingAction?: "import_pending";
      saveAsRule?: boolean;
      decision?: LearningDecision;
      applyScope?: LearningApplyScope;
      ruleMatchType?: LearningRuleMatchType;
      ruleMatchValue?: string;
      riskyRuleAcknowledged?: boolean;
      otherBusinessConfirmed?: boolean;
    };

    if (body.duplicateAction) {
      if (
        !["skip_duplicate", "import_anyway", "keep_pending"].includes(
          body.duplicateAction
        )
      ) {
        return NextResponse.json(
          { error: "Invalid duplicate action" },
          { status: 400 }
        );
      }
      const result = reviewDuplicateRow(
        batchId,
        rowId,
        workspaceId,
        body.duplicateAction
      );
      return NextResponse.json({ success: true, ...result });
    }

    if (body.pendingAction) {
      if (body.pendingAction !== "import_pending") {
        return NextResponse.json(
          { error: "Invalid pending action" },
          { status: 400 }
        );
      }
      const result = importPendingRow(batchId, rowId, workspaceId);
      return NextResponse.json({ success: true, ...result });
    }

    if ("notes" in body) {
      updateImportRowNotes(workspaceId, rowId, body.notes ?? null);
    }

    const isClassificationEdit =
      body.financialNature !== undefined ||
      body.cashFlowType !== undefined ||
      body.pnlImpact !== undefined ||
      body.classificationStatus !== undefined ||
      body.businessUnit !== undefined ||
      body.categoryId !== undefined ||
      body.saveAsRule === true ||
      body.applyScope !== undefined;
    if (isClassificationEdit) {
      if (
        body.decision !== undefined &&
        body.decision !== "approve" &&
        body.decision !== "keep_review"
      ) {
        return NextResponse.json(
          { error: "Invalid learning decision" },
          { status: 400 }
        );
      }
      if (
        body.applyScope !== undefined &&
        body.applyScope !== "row" &&
        body.applyScope !== "batch_similar"
      ) {
        return NextResponse.json(
          { error: "Invalid apply scope" },
          { status: 400 }
        );
      }
      const result = applyImportRowLearning(
        workspaceId,
        batchId,
        rowId,
        {
          categoryId:
            body.categoryId !== undefined ? body.categoryId : row.categoryId,
          financialNature: body.financialNature ?? row.financialNature,
          cashFlowType: body.cashFlowType ?? row.cashFlowType,
          pnlImpact: body.pnlImpact ?? row.pnlImpact,
          businessUnit:
            body.businessUnit !== undefined
              ? body.businessUnit
              : row.businessUnit,
        },
        {
          decision: body.decision ?? "approve",
          scope: body.applyScope ?? "row",
          saveAsRule: body.saveAsRule === true,
          matchType: body.ruleMatchType,
          matchValue: body.ruleMatchValue,
          riskyRuleAcknowledged: body.riskyRuleAcknowledged,
          otherBusinessConfirmed: body.otherBusinessConfirmed,
        }
      );
      return NextResponse.json({ success: true, ...result });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update row";
    return NextResponse.json(
      { error: message },
      { status: err instanceof LearningPolicyError ? 400 : 500 }
    );
  }
}
