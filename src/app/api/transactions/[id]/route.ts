import { NextResponse } from "next/server";
import {
  setTransactionKind,
  getTransaction,
  updateTransaction,
} from "@/server/db/queries/transactions";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { applyTransactionLearning } from "@/server/classification/learning-rules";
import { LearningPolicyError } from "@/lib/classification-learning-policy";
import type {
  BusinessUnit,
  CashFlowType,
  FinancialNature,
  LearningApplyScope,
  LearningDecision,
  LearningRuleMatchType,
  PnlImpact,
} from "@/lib/types";
import type { TransactionEditPatch } from "@/server/db/queries/transactions";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const tx = getTransaction(workspaceId, numericId);
  if (!tx) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ transaction: tx });
}

export async function PUT() {
  return NextResponse.json(
    {
      error:
        "Direct category approval is disabled. Use the classification dialog.",
    },
    { status: 400 }
  );
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
    edit?: TransactionEditPatch;
    learning?: {
      categoryId: number | null;
      financialNature: FinancialNature;
      cashFlowType: CashFlowType;
      pnlImpact: PnlImpact;
      businessUnit: BusinessUnit | null;
      decision: LearningDecision;
      applyScope: LearningApplyScope;
      saveAsRule: boolean;
      ruleMatchType?: LearningRuleMatchType;
      ruleMatchValue?: string;
      riskyRuleAcknowledged?: boolean;
      otherBusinessConfirmed?: boolean;
    };
  };

  const numericId = Number(id);

  // General-purpose field edit — no rules created, no learning policy
  if (body.edit) {
    const patch = body.edit;
    const allowed: (keyof TransactionEditPatch)[] = [
      "date", "description", "counterparty", "cleanDescription",
      "categoryId", "kind", "financialNature", "cashFlowType",
      "pnlImpact", "classificationStatus", "businessUnit", "note",
    ];
    const sanitized: TransactionEditPatch = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sanitized as any)[key] = (patch as any)[key];
      }
    }
    const result = updateTransaction(workspaceId, numericId, sanitized);
    if (!result.updated) {
      return NextResponse.json({ error: "Not found or no changes" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  }

  if (body.learning) {
    if (
      body.learning.decision !== "approve" &&
      body.learning.decision !== "keep_review"
    ) {
      return NextResponse.json(
        { error: "Invalid learning decision" },
        { status: 400 }
      );
    }
    if (
      body.learning.applyScope !== "row" &&
      body.learning.applyScope !== "batch_similar"
    ) {
      return NextResponse.json(
        { error: "Invalid apply scope" },
        { status: 400 }
      );
    }
    try {
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
          decision: body.learning.decision,
          scope: body.learning.applyScope,
          saveAsRule: body.learning.saveAsRule,
          matchType: body.learning.ruleMatchType,
          matchValue: body.learning.ruleMatchValue,
          riskyRuleAcknowledged: body.learning.riskyRuleAcknowledged,
          otherBusinessConfirmed: body.learning.otherBusinessConfirmed,
        }
      );
      return NextResponse.json({ success: true, ...result });
    } catch (error) {
      if (error instanceof LearningPolicyError) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
      throw error;
    }
  }

  if (body.approve === true) {
    return NextResponse.json(
      {
        error:
          "Direct approval is disabled. Use the classification dialog so classification_status and learning policy stay consistent.",
      },
      { status: 400 }
    );
  }

  if (
    body.kind !== "expense" &&
    body.kind !== "income" &&
    body.kind !== "transfer"
  ) {
    return NextResponse.json(
      { error: "kind must be 'expense', 'income', or 'transfer'" },
      { status: 400 }
    );
  }

  setTransactionKind(workspaceId, numericId, body.kind);

  return NextResponse.json({ success: true });
}
