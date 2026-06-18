import { NextResponse } from "next/server";
import {
  getRecurringPattern,
  updateRecurringPattern,
} from "@/server/db/queries/forecast";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import type {
  FinancialNature,
  CashFlowType,
  PnlImpact,
  RecurringFrequency,
} from "@/lib/types";

const VALID_NATURES = new Set<string>([
  "operating_income", "operating_expense", "credit_card_payment", "refund",
  "working_capital", "internal_transfer", "owner_deposit", "owner_draw",
  "investment", "receivable_collection", "payable_payment", "loan_received",
  "loan_repayment", "tax", "unknown",
]);
const VALID_CASH_FLOW_TYPES = new Set<string>([
  "real_cash_in", "real_cash_out", "internal_transfer", "non_cash", "pending", "unknown",
]);
const VALID_PNL_IMPACTS = new Set<string>(["yes", "no", "maybe"]);
const VALID_FREQUENCIES = new Set<string>([
  "monthly", "bimonthly", "quarterly", "annual", "irregular",
]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const patternId = Number(id);
  if (!Number.isInteger(patternId) || patternId <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const workspaceId = getWorkspaceIdFromRequest(request);
  const pattern = getRecurringPattern(workspaceId, patternId);
  if (!pattern) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ pattern });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const patternId = Number(id);
  if (!Number.isInteger(patternId) || patternId <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const workspaceId = getWorkspaceIdFromRequest(request);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const existing = getRecurringPattern(workspaceId, patternId);
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Validate provided fields
  if ("financialNature" in body && !VALID_NATURES.has(body.financialNature as string)) {
    return NextResponse.json({ error: "invalid financial_nature" }, { status: 400 });
  }
  if ("cashFlowType" in body && !VALID_CASH_FLOW_TYPES.has(body.cashFlowType as string)) {
    return NextResponse.json({ error: "invalid cash_flow_type" }, { status: 400 });
  }
  if ("pnlImpact" in body && !VALID_PNL_IMPACTS.has(body.pnlImpact as string)) {
    return NextResponse.json({ error: "invalid pnl_impact" }, { status: 400 });
  }
  if ("frequency" in body && !VALID_FREQUENCIES.has(body.frequency as string)) {
    return NextResponse.json({ error: "invalid frequency" }, { status: 400 });
  }
  if ("expectedDayOfMonth" in body && body.expectedDayOfMonth !== null) {
    const d = Number(body.expectedDayOfMonth);
    if (!Number.isInteger(d) || d < 1 || d > 31) {
      return NextResponse.json({ error: "expected_day_of_month must be 1-31" }, { status: 400 });
    }
  }

  const updated = updateRecurringPattern(workspaceId, patternId, {
    ...(typeof body.displayLabel === "string" ? { displayLabel: body.displayLabel } : {}),
    ...("counterpartyPattern" in body ? { counterpartyPattern: body.counterpartyPattern as string | null } : {}),
    ...("businessUnit" in body ? { businessUnit: body.businessUnit as string | null } : {}),
    ...("categoryId" in body ? { categoryId: body.categoryId as number | null } : {}),
    ...("financialNature" in body ? { financialNature: body.financialNature as FinancialNature } : {}),
    ...("cashFlowType" in body ? { cashFlowType: body.cashFlowType as CashFlowType } : {}),
    ...("pnlImpact" in body ? { pnlImpact: body.pnlImpact as PnlImpact } : {}),
    ...("expectedAmount" in body ? { expectedAmount: body.expectedAmount as number | null } : {}),
    ...("amountMin" in body ? { amountMin: body.amountMin as number | null } : {}),
    ...("amountMax" in body ? { amountMax: body.amountMax as number | null } : {}),
    ...("amountVariance" in body ? { amountVariance: body.amountVariance as number | null } : {}),
    ...("frequency" in body ? { frequency: body.frequency as RecurringFrequency } : {}),
    ...("expectedIntervalMonths" in body ? { expectedIntervalMonths: body.expectedIntervalMonths as number | null } : {}),
    ...("expectedDayOfMonth" in body ? { expectedDayOfMonth: body.expectedDayOfMonth as number | null } : {}),
    ...("startDate" in body ? { startDate: body.startDate as string | null } : {}),
    ...("endDate" in body ? { endDate: body.endDate as string | null } : {}),
    ...(typeof body.isActive === "boolean" ? { isActive: body.isActive } : {}),
    ...(typeof body.isUserConfirmed === "boolean" ? { isUserConfirmed: body.isUserConfirmed } : {}),
  });

  return NextResponse.json({ pattern: updated });
}
