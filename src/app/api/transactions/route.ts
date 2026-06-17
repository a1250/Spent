import { NextResponse } from "next/server";
import {
  queryTransactions,
  createManualTransaction,
  type TransactionKindFilter,
} from "@/server/db/queries/transactions";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import type { ManualTransactionInput } from "@/server/db/queries/transactions";

function parseKind(raw: string | null): TransactionKindFilter | undefined {
  if (raw === "expense" || raw === "income" || raw === "all") {
    return raw;
  }
  return undefined;
}

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);

  // Support multi-id filter ("?categoryIds=1&categoryIds=2") for parent
  // category drilldowns (parent expands to its children client-side).
  const categoryIds = searchParams
    .getAll("categoryIds")
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n));

  const credentialIds = searchParams
    .getAll("credentialIds")
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);

  const minAmountRaw = searchParams.get("minAmount");
  const maxAmountRaw = searchParams.get("maxAmount");

  const result = queryTransactions(workspaceId, {
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    category: searchParams.has("category")
      ? Number(searchParams.get("category"))
      : undefined,
    categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
    sort: searchParams.get("sort") ?? undefined,
    order: (searchParams.get("order") as "asc" | "desc") ?? undefined,
    limit: searchParams.has("limit")
      ? Number(searchParams.get("limit"))
      : undefined,
    offset: searchParams.has("offset")
      ? Number(searchParams.get("offset"))
      : undefined,
    kind: parseKind(searchParams.get("kind")),
    provider: searchParams.get("provider") ?? undefined,
    credentialIds: credentialIds.length > 0 ? credentialIds : undefined,
    businessUnit: searchParams.get("businessUnit") ?? undefined,
    classificationStatus: searchParams.get("classificationStatus") ?? undefined,
    financialNature: searchParams.get("financialNature") ?? undefined,
    cashFlowType: searchParams.get("cashFlowType") ?? undefined,
    pnlImpact: searchParams.get("pnlImpact") ?? undefined,
    minAmount: minAmountRaw ? Number(minAmountRaw) : undefined,
    maxAmount: maxAmountRaw ? Number(maxAmountRaw) : undefined,
  });

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);

  let body: Partial<ManualTransactionInput>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.date || typeof body.date !== "string") {
    return NextResponse.json({ error: "date is required" }, { status: 400 });
  }
  if (!body.description || typeof body.description !== "string") {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }
  if (typeof body.amount !== "number" || isNaN(body.amount) || body.amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }
  if (body.direction !== "income" && body.direction !== "expense") {
    return NextResponse.json(
      { error: "direction must be 'income' or 'expense'" },
      { status: 400 }
    );
  }

  const tx = createManualTransaction(workspaceId, body as ManualTransactionInput);
  return NextResponse.json({ transaction: tx }, { status: 201 });
}
