import { NextResponse } from "next/server";
import {
  setTransactionKind,
  setTransactionNeedsReview,
  getTransactionContext,
} from "@/server/db/queries/transactions";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { applyTransactionLearning } from "@/server/classification/learning-rules";
import type {
  BusinessUnit,
  CashFlowType,
  FinancialNature,
  LearningApplyScope,
  LearningRuleMatchType,
  PnlImpact,
} from "@/lib/types";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const body = (await request.json()) as { categoryId: number };

  if (!body.categoryId) {
    return NextResponse.json(
      { error: "categoryId is required" },
      { status: 400 }
    );
  }

  const numericId = Number(id);

  const before = getTransactionContext(workspaceId, numericId);
  if (!before) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  applyTransactionLearning(
    workspaceId,
    numericId,
    {
      categoryId: body.categoryId,
      financialNature: before.financialNature,
      cashFlowType: before.cashFlowType,
      pnlImpact: before.pnlImpact,
      businessUnit: before.businessUnit,
    },
    { scope: "row", saveAsRule: false }
  );

  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    kind?: unknown;
    approve?: unknown;
    learning?: {
      categoryId: number | null;
      financialNature: FinancialNature;
      cashFlowType: CashFlowType;
      pnlImpact: PnlImpact;
      businessUnit: BusinessUnit | null;
      applyScope: LearningApplyScope;
      saveAsRule: boolean;
      ruleMatchType?: LearningRuleMatchType;
    };
  };

  const numericId = Number(id);

  if (body.learning) {
    if (
      body.learning.applyScope !== "row" &&
      body.learning.applyScope !== "batch_similar"
    ) {
      return NextResponse.json(
        { error: "Invalid apply scope" },
        { status: 400 }
      );
    }
    const result = applyTransactionLearning(
      workspaceId,
      numericId,
      {
        categoryId: body.learning.categoryId,
        financialNature: body.learning.financialNature,
        cashFlowType: body.learning.cashFlowType,
        pnlImpact: body.learning.pnlImpact,
        businessUnit: body.learning.businessUnit,
      },
      {
        scope: body.learning.applyScope,
        saveAsRule: body.learning.saveAsRule,
        matchType: body.learning.ruleMatchType,
      }
    );
    return NextResponse.json({ success: true, ...result });
  }

  if (body.approve === true) {
    const ctx = getTransactionContext(workspaceId, numericId);
    if (!ctx) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    setTransactionNeedsReview(workspaceId, numericId, false);
    // Approval confirms this transaction only. Future learning requires the
    // explicit "Save as rule" choice in the edit dialog.
    return NextResponse.json({ success: true });
  }

  if (
    body.kind !== "expense" &&
    body.kind !== "income" &&
    body.kind !== "transfer"
  ) {
    return NextResponse.json(
      { error: "kind must be 'expense', 'income', or 'transfer', or set approve:true" },
      { status: 400 }
    );
  }

  setTransactionKind(workspaceId, numericId, body.kind);

  return NextResponse.json({ success: true });
}
