import { NextResponse } from "next/server";
import {
  listRecurringPatterns,
  createRecurringPattern,
} from "@/server/db/queries/forecast";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import type {
  FinancialNature,
  CashFlowType,
  PnlImpact,
  RecurringFrequency,
} from "@/lib/types";

const VALID_NATURES = new Set<string>([
  "operating_income",
  "operating_expense",
  "credit_card_payment",
  "refund",
  "working_capital",
  "internal_transfer",
  "owner_deposit",
  "owner_draw",
  "investment",
  "receivable_collection",
  "payable_payment",
  "loan_received",
  "loan_repayment",
  "tax",
  "unknown",
]);

const VALID_CASH_FLOW_TYPES = new Set<string>([
  "real_cash_in",
  "real_cash_out",
  "internal_transfer",
  "non_cash",
  "pending",
  "unknown",
]);

const VALID_PNL_IMPACTS = new Set<string>(["yes", "no", "maybe"]);
const VALID_DIRECTIONS = new Set<string>(["income", "expense"]);
const VALID_FREQUENCIES = new Set<string>([
  "monthly",
  "bimonthly",
  "quarterly",
  "annual",
  "irregular",
]);

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const confirmedOnly = searchParams.get("confirmedOnly") === "true";
  const activeOnly = searchParams.get("activeOnly") !== "false";
  const patterns = listRecurringPatterns(workspaceId, { confirmedOnly, activeOnly });
  return NextResponse.json({ patterns });
}

export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Required fields
  const { displayLabel, descriptionPattern, direction, financialNature, cashFlowType, pnlImpact, frequency } = body;

  if (!displayLabel || typeof displayLabel !== "string" || displayLabel.trim() === "") {
    return NextResponse.json({ error: "display_label required" }, { status: 400 });
  }
  if (!descriptionPattern || typeof descriptionPattern !== "string" || descriptionPattern.trim() === "") {
    return NextResponse.json({ error: "description_pattern required" }, { status: 400 });
  }
  if (!VALID_DIRECTIONS.has(direction as string)) {
    return NextResponse.json({ error: "direction must be 'income' or 'expense'" }, { status: 400 });
  }
  if (!VALID_NATURES.has(financialNature as string)) {
    return NextResponse.json({ error: "invalid financial_nature" }, { status: 400 });
  }
  if (!VALID_CASH_FLOW_TYPES.has(cashFlowType as string)) {
    return NextResponse.json({ error: "invalid cash_flow_type" }, { status: 400 });
  }
  if (!VALID_PNL_IMPACTS.has(pnlImpact as string)) {
    return NextResponse.json({ error: "invalid pnl_impact" }, { status: 400 });
  }
  if (!VALID_FREQUENCIES.has(frequency as string)) {
    return NextResponse.json({ error: "invalid frequency" }, { status: 400 });
  }

  // Optional numeric fields
  const expectedAmount = typeof body.expectedAmount === "number" ? body.expectedAmount : null;
  const amountMin = typeof body.amountMin === "number" ? body.amountMin : null;
  const amountMax = typeof body.amountMax === "number" ? body.amountMax : null;
  const amountVariance = typeof body.amountVariance === "number" ? body.amountVariance : null;
  const expectedDayOfMonth = typeof body.expectedDayOfMonth === "number"
    ? Math.round(body.expectedDayOfMonth)
    : null;
  if (expectedDayOfMonth !== null && (expectedDayOfMonth < 1 || expectedDayOfMonth > 31)) {
    return NextResponse.json({ error: "expected_day_of_month must be 1-31" }, { status: 400 });
  }
  const expectedIntervalMonths = typeof body.expectedIntervalMonths === "number" ? body.expectedIntervalMonths : null;
  const confidenceScore = typeof body.confidenceScore === "number" ? body.confidenceScore : null;

  const pattern = createRecurringPattern(workspaceId, {
    displayLabel: displayLabel.trim(),
    descriptionPattern: descriptionPattern.trim(),
    counterpartyPattern: typeof body.counterpartyPattern === "string" ? body.counterpartyPattern : null,
    direction: direction as "income" | "expense",
    businessUnit: typeof body.businessUnit === "string" ? body.businessUnit : null,
    categoryId: typeof body.categoryId === "number" ? body.categoryId : null,
    financialNature: financialNature as FinancialNature,
    cashFlowType: cashFlowType as CashFlowType,
    pnlImpact: pnlImpact as PnlImpact,
    expectedAmount,
    amountMin,
    amountMax,
    amountVariance,
    frequency: frequency as RecurringFrequency,
    expectedIntervalMonths,
    expectedDayOfMonth,
    startDate: typeof body.startDate === "string" ? body.startDate : null,
    endDate: typeof body.endDate === "string" ? body.endDate : null,
    lastSeenDate: typeof body.lastSeenDate === "string" ? body.lastSeenDate : null,
    sourceType: body.sourceType === "manual" || body.sourceType === "installment" || body.sourceType === "rule_derived"
      ? body.sourceType
      : "manual",
    confidenceScore,
    isUserConfirmed: body.isUserConfirmed === true,
  });

  return NextResponse.json({ pattern }, { status: 201 });
}
