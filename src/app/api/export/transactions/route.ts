import { NextResponse } from "next/server";
import {
  queryTransactions,
  type TransactionKindFilter,
} from "@/server/db/queries/transactions";
import { buildCsv, csvDownloadResponse } from "@/server/export/csv";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import type { CsvValue } from "@/server/export/csv";

export const dynamic = "force-dynamic";

function parseKind(raw: string | null): TransactionKindFilter | undefined {
  if (raw === "expense" || raw === "income" || raw === "all") return raw;
  return undefined;
}

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);

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

  const baseParams = {
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    category: searchParams.has("category")
      ? Number(searchParams.get("category"))
      : undefined,
    categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
    sort: searchParams.get("sort") ?? undefined,
    order: (searchParams.get("order") as "asc" | "desc") ?? undefined,
    kind: parseKind(searchParams.get("kind")),
    provider: searchParams.get("provider") ?? undefined,
    credentialIds: credentialIds.length > 0 ? credentialIds : undefined,
    businessUnit:
      searchParams.getAll("businessUnit").length > 0
        ? searchParams.getAll("businessUnit")
        : undefined,
    classificationStatus:
      searchParams.getAll("classificationStatus").length > 0
        ? searchParams.getAll("classificationStatus")
        : undefined,
    financialNature:
      searchParams.getAll("financialNature").length > 0
        ? searchParams.getAll("financialNature")
        : undefined,
    cashFlowType: searchParams.get("cashFlowType") ?? undefined,
    pnlImpact: searchParams.get("pnlImpact") ?? undefined,
    minAmount: minAmountRaw ? Number(minAmountRaw) : undefined,
    maxAmount: maxAmountRaw ? Number(maxAmountRaw) : undefined,
  };

  if (
    (baseParams.category !== undefined && !Number.isFinite(baseParams.category)) ||
    (baseParams.minAmount !== undefined && !Number.isFinite(baseParams.minAmount)) ||
    (baseParams.maxAmount !== undefined && !Number.isFinite(baseParams.maxAmount))
  ) {
    return NextResponse.json({ error: "Invalid numeric filter" }, { status: 400 });
  }

  const firstPage = queryTransactions(workspaceId, {
    ...baseParams,
    limit: 200,
    offset: 0,
  });
  const transactions = [...firstPage.transactions];

  for (let offset = 200; offset < firstPage.total; offset += 200) {
    const page = queryTransactions(workspaceId, {
      ...baseParams,
      limit: 200,
      offset,
    });
    transactions.push(...page.transactions);
  }

  const rows: CsvValue[][] = transactions.map((tx) => [
    tx.date,
    tx.processedDate,
    tx.description,
    tx.counterparty,
    tx.chargedAmount,
    tx.chargedCurrency,
    tx.kind,
    tx.categoryName,
    tx.businessUnit,
    tx.classificationStatus,
    tx.financialNature,
    tx.cashFlowType,
    tx.pnlImpact,
    tx.accountLabel ?? tx.accountNumber,
    tx.provider,
    tx.status,
    tx.type,
    tx.note,
    tx.voidReason,
  ]);

  const csv = buildCsv(
    [
      "Date",
      "Processed Date",
      "Description",
      "Counterparty",
      "Amount",
      "Currency",
      "Kind",
      "Category",
      "Business Unit",
      "Classification Status",
      "Financial Nature",
      "Cash Flow Type",
      "P&L Impact",
      "Account",
      "Provider",
      "Status",
      "Type",
      "Note",
      "Void Reason",
    ],
    rows
  );

  const from = baseParams.from ?? "all";
  const to = baseParams.to ?? "all";
  return csvDownloadResponse(csv, `transactions-${from}-to-${to}.csv`);
}
