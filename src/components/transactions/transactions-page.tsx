"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { AlertCircle, Building2, Download, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/app-shell";
import { TransactionsTable } from "@/components/dashboard/transactions-table";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { AINotConnectedBanner } from "@/components/ai-not-connected-banner";
import { Button } from "@/components/ui/button";
import { KpiCards } from "./kpi-cards";
import { WidgetsRow } from "./widgets-row";
import {
  TransactionMultiFilter,
  MultiFilterOption,
} from "@/components/transactions/transaction-multi-filter";
import {
  getCategories,
  getTransactions,
  getTransactionsSummary,
  listIntegrations,
  listBusinessUnits,
} from "@/lib/api";
import type { TransactionKindFilter } from "@/lib/api";
import { expandCategoryFilterIds } from "@/lib/transaction-filters";
import {
  nextSortState,
  type SortOrder,
  type TransactionSortField,
} from "@/lib/transaction-sort";
import {
  addMonths,
  formatMonthLabel,
  getMonthRange,
} from "@/lib/formatters";
import type { Locale } from "@/i18n/routing";
import type { TransactionWithCategory } from "@/lib/types";
import { TransactionDetailSheet } from "@/components/transactions/transaction-detail-sheet";
import { TransactionCreateDialog } from "@/components/transactions/transaction-create-dialog";

function parseMonthParam(month: string | null): Date {
  if (!month) return new Date();
  const parts = month.split("-");
  const year = Number(parts[0]);
  const m = Number(parts[1]);
  if (!year || !m || m < 1 || m > 12 || isNaN(year) || isNaN(m)) return new Date();
  return new Date(year, m - 1, 1);
}

const CLASSIFICATION_STATUS_OPTIONS = [
  { value: "manually_approved", label: "Approved" },
  { value: "auto_classified", label: "Auto-classified" },
  { value: "needs_review", label: "Needs Review" },
];

const FINANCIAL_NATURE_OPTIONS = [
  { value: "operating_income", label: "Operating Income" },
  { value: "operating_expense", label: "Operating Expense" },
  { value: "credit_card_payment", label: "Card Payment" },
  { value: "refund", label: "Refund" },
  { value: "working_capital", label: "Working Capital" },
  { value: "internal_transfer", label: "Internal Transfer" },
  { value: "owner_deposit", label: "Owner Deposit" },
  { value: "owner_draw", label: "Owner Draw" },
  { value: "investment", label: "Investment" },
  { value: "receivable_collection", label: "Receivable" },
  { value: "payable_payment", label: "Payable" },
  { value: "loan_received", label: "Loan Received" },
  { value: "loan_repayment", label: "Loan Repayment" },
  { value: "tax", label: "Tax" },
  { value: "unknown", label: "Unknown" },
];

export function TransactionsPage() {
  const t = useTranslations("transactions");
  const locale = useLocale() as Locale;
  const searchParams = useSearchParams();
  const router = useRouter();

  // Initialize filter state from URL params (lazy initializers run only once on mount)
  const [selectedDate, setSelectedDate] = useState(() =>
    parseMonthParam(searchParams.get("month"))
  );
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [categoryFilter, setCategoryFilter] = useState<number[]>(() =>
    searchParams.getAll("categoryId").map(Number).filter((n) => !isNaN(n) && n > 0)
  );
  const [accountFilter, setAccountFilter] = useState<number[]>(() =>
    searchParams.getAll("accountId").map(Number).filter((n) => !isNaN(n) && n > 0)
  );
  const [page, setPage] = useState(0);
  const [kind, setKind] = useState<TransactionKindFilter>(() => {
    const k = searchParams.get("kind");
    if (k === "income" || k === "expense") return k;
    return "all";
  });
  const [sortField, setSortField] = useState<TransactionSortField>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Multi-select filters (hydrated from URL)
  const [buFilter, setBuFilter] = useState<string[]>(() =>
    searchParams.getAll("businessUnit")
  );
  const [statusFilter, setStatusFilter] = useState<string[]>(() =>
    searchParams.getAll("classificationStatus")
  );
  const [natureFilter, setNatureFilter] = useState<string[]>(() =>
    searchParams.getAll("financialNature")
  );

  // Phase 2Z: selection and dialogs
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editingTxn, setEditingTxn] = useState<TransactionWithCategory | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Sync filter state back to URL so links are bookmarkable and back/forward works
  useEffect(() => {
    const params = new URLSearchParams();
    const { from } = getMonthRange(selectedDate);
    params.set("month", from.slice(0, 7));
    if (search) params.set("search", search);
    if (kind !== "all") params.set("kind", kind);
    for (const id of categoryFilter) params.append("categoryId", String(id));
    for (const id of accountFilter) params.append("accountId", String(id));
    for (const bu of buFilter) params.append("businessUnit", bu);
    for (const s of statusFilter) params.append("classificationStatus", s);
    for (const n of natureFilter) params.append("financialNature", n);
    router.replace(`/transactions?${params.toString()}`, { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, search, kind, categoryFilter, accountFilter, buFilter, statusFilter, natureFilter]);

  const filterOptions: { value: TransactionKindFilter; label: string }[] = [
    { value: "all", label: t("filterAll") },
    { value: "income", label: t("filterIncome") },
    { value: "expense", label: t("filterExpenses") },
  ];

  const { from, to } = getMonthRange(selectedDate);

  const allCategoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategories(),
  });
  const integrationsQuery = useQuery({
    queryKey: ["integrations"],
    queryFn: () => listIntegrations(),
  });
  const businessUnitsQuery = useQuery({
    queryKey: ["business-units"],
    queryFn: () => listBusinessUnits({ includeInactive: false }),
  });

  const expandedCategoryIds = expandCategoryFilterIds(
    categoryFilter,
    allCategoriesQuery.data ?? []
  );

  const transactionsQuery = useQuery({
    queryKey: [
      "transactions",
      from,
      to,
      search,
      categoryFilter,
      accountFilter,
      page,
      kind,
      sortField,
      sortOrder,
      buFilter,
      statusFilter,
      natureFilter,
    ],
    queryFn: () =>
      getTransactions({
        from,
        to,
        search: search || undefined,
        categoryIds: expandedCategoryIds,
        credentialIds:
          accountFilter.length > 0 ? accountFilter : undefined,
        limit: 50,
        offset: page * 50,
        kind,
        sort: sortField,
        order: sortOrder,
        businessUnit: buFilter.length > 0 ? buFilter : undefined,
        classificationStatus: statusFilter.length > 0 ? statusFilter : undefined,
        financialNature: natureFilter.length > 0 ? natureFilter : undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const summaryQuery = useQuery({
    queryKey: ["transactions-summary", from, to],
    queryFn: () => getTransactionsSummary({ from, to }),
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories", kind === "income" ? "income" : "expense"],
    queryFn: () =>
      kind === "income" ? getCategories("income") : getCategories("expense"),
  });

  const monthLabel = formatMonthLabel(selectedDate, locale);

  const summaryInitialLoading =
    summaryQuery.isPending && summaryQuery.data === undefined;
  const tableInitialLoading =
    transactionsQuery.isPending && transactionsQuery.data === undefined;

  const businessUnits = (businessUnitsQuery.data ?? []).filter((bu) => bu.isActive !== false);

  // Display labels for multi-filters
  const buDisplayValue =
    buFilter.length === 0
      ? "All"
      : buFilter.length === 1
        ? buFilter[0] === "none"
          ? "Unassigned"
          : (businessUnits.find((b) => b.slug === buFilter[0])?.label ?? buFilter[0])
        : `${buFilter.length} selected`;

  const statusDisplayValue =
    statusFilter.length === 0
      ? "All"
      : statusFilter.length === 1
        ? (CLASSIFICATION_STATUS_OPTIONS.find((o) => o.value === statusFilter[0])?.label ?? statusFilter[0])
        : `${statusFilter.length} selected`;

  const natureDisplayValue =
    natureFilter.length === 0
      ? "All"
      : natureFilter.length === 1
        ? (FINANCIAL_NATURE_OPTIONS.find((o) => o.value === natureFilter[0])?.label ?? natureFilter[0])
        : `${natureFilter.length} selected`;

  const hasActiveFilters =
    buFilter.length > 0 || statusFilter.length > 0 || natureFilter.length > 0;

  const exportParams = new URLSearchParams();
  exportParams.set("from", from);
  exportParams.set("to", to);
  if (search) exportParams.set("search", search);
  if (kind !== "all") exportParams.set("kind", kind);
  for (const id of expandedCategoryIds ?? []) exportParams.append("categoryIds", String(id));
  for (const id of accountFilter) exportParams.append("credentialIds", String(id));
  for (const bu of buFilter) exportParams.append("businessUnit", bu);
  for (const s of statusFilter) exportParams.append("classificationStatus", s);
  for (const n of natureFilter) exportParams.append("financialNature", n);
  exportParams.set("sort", sortField);
  exportParams.set("order", sortOrder);
  const exportHref = `/api/export/transactions?${exportParams.toString()}`;

  function toggleFilter<T>(arr: T[], val: T): T[] {
    return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
  }

  return (
    <>
      <PageHeader
        title={t("pageTitle")}
        meta={monthLabel}
        actions={
          <div className="flex items-center gap-2">
            <PeriodSelector
              label={monthLabel}
              onPrev={() => setSelectedDate((d) => addMonths(d, -1))}
              onNext={() => setSelectedDate((d) => addMonths(d, 1))}
            />
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>
        }
      />

      <div className="space-y-6 p-4 md:p-6 lg:p-8">
        <AINotConnectedBanner />
        <KpiCards summary={summaryQuery.data} loading={summaryInitialLoading} />

        <WidgetsRow
          summary={summaryQuery.data}
          loading={summaryInitialLoading}
        />

        {/* Kind filter + dimension filters row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Kind pills */}
          <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1 w-fit">
            {filterOptions.map((opt) => {
              const active = kind === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setKind(opt.value);
                    setPage(0);
                    setCategoryFilter([]);
                  }}
                  className={
                    active
                      ? "rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background transition-colors"
                      : "rounded-full px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Business unit multi-filter */}
          <TransactionMultiFilter
            label="Unit"
            icon={Building2}
            displayValue={buDisplayValue}
            selectAllLabel="All units"
            clearLabel="Clear"
            onSelectAll={() => { setBuFilter([]); setPage(0); }}
            onClear={() => { setBuFilter([]); setPage(0); }}
            showBulkActions={false}
          >
            <MultiFilterOption
              selected={buFilter.includes("none")}
              onToggle={() => { setBuFilter((f) => toggleFilter(f, "none")); setPage(0); }}
            >
              Unassigned
            </MultiFilterOption>
            {businessUnits.map((bu) => (
              <MultiFilterOption
                key={bu.slug}
                selected={buFilter.includes(bu.slug)}
                onToggle={() => { setBuFilter((f) => toggleFilter(f, bu.slug)); setPage(0); }}
              >
                {bu.label}
              </MultiFilterOption>
            ))}
          </TransactionMultiFilter>

          {/* Classification status multi-filter */}
          <TransactionMultiFilter
            label="Status"
            icon={ShieldCheck}
            displayValue={statusDisplayValue}
            selectAllLabel="All statuses"
            clearLabel="Clear"
            onSelectAll={() => { setStatusFilter([]); setPage(0); }}
            onClear={() => { setStatusFilter([]); setPage(0); }}
            showBulkActions={false}
          >
            {CLASSIFICATION_STATUS_OPTIONS.map((o) => (
              <MultiFilterOption
                key={o.value}
                selected={statusFilter.includes(o.value)}
                onToggle={() => { setStatusFilter((f) => toggleFilter(f, o.value)); setPage(0); }}
              >
                {o.label}
              </MultiFilterOption>
            ))}
          </TransactionMultiFilter>

          {/* Financial nature multi-filter */}
          <TransactionMultiFilter
            label="Nature"
            icon={Sparkles}
            displayValue={natureDisplayValue}
            selectAllLabel="All natures"
            clearLabel="Clear"
            onSelectAll={() => { setNatureFilter([]); setPage(0); }}
            onClear={() => { setNatureFilter([]); setPage(0); }}
            showBulkActions={false}
          >
            {FINANCIAL_NATURE_OPTIONS.map((o) => (
              <MultiFilterOption
                key={o.value}
                selected={natureFilter.includes(o.value)}
                onToggle={() => { setNatureFilter((f) => toggleFilter(f, o.value)); setPage(0); }}
              >
                {o.label}
              </MultiFilterOption>
            ))}
          </TransactionMultiFilter>

          {/* Clear all dimension filters */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setBuFilter([]);
                setStatusFilter([]);
                setNatureFilter([]);
                setPage(0);
              }}
              className="rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Clear filters
            </button>
          )}

          {/* Classification coverage indicator */}
          {summaryQuery.data && summaryQuery.data.pendingReviewCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setStatusFilter(["needs_review"]);
                setPage(0);
              }}
              className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/8 px-3 py-1.5 text-xs text-amber-700 transition-colors hover:bg-amber-500/15 dark:text-amber-300"
            >
              <AlertCircle className="h-3 w-3" />
              {summaryQuery.data.pendingReviewCount} needs review
            </button>
          )}

          {/* Bulk select toggle */}
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            className="ms-auto gap-1.5"
            render={
              <a href={exportHref}>
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </a>
            }
          />
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className={
              selectedIds.size > 0
                ? "rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-foreground transition-colors"
                : "rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/50 hover:text-foreground"
            }
          >
            {selectedIds.size > 0 ? `${selectedIds.size} selected — click to clear` : "Select rows"}
          </button>
        </div>

        {/* Empty state */}
        {!tableInitialLoading &&
          transactionsQuery.data?.total === 0 &&
          !search &&
          categoryFilter.length === 0 &&
          accountFilter.length === 0 &&
          buFilter.length === 0 &&
          statusFilter.length === 0 &&
          natureFilter.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 px-8 py-16 text-center">
            <p className="text-sm font-medium text-muted-foreground">No transactions this month</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Import a bank statement or add a manual transaction to get started.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-4 gap-1.5"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Add transaction
            </Button>
          </div>
        ) : (
          <TransactionsTable
            transactions={transactionsQuery.data?.transactions ?? []}
            total={transactionsQuery.data?.total ?? 0}
            categories={categoriesQuery.data ?? []}
            integrations={integrationsQuery.data ?? []}
            loading={tableInitialLoading}
            isFetching={transactionsQuery.isFetching}
            sortField={sortField}
            sortOrder={sortOrder}
            onSortChange={(field) => {
              const next = nextSortState(sortField, sortOrder, field);
              setSortField(next.field);
              setSortOrder(next.order);
              setPage(0);
            }}
            search={search}
            onSearchChange={setSearch}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={(ids) => {
              setCategoryFilter(ids);
              setPage(0);
            }}
            accountFilter={accountFilter}
            onAccountFilterChange={(ids) => {
              setAccountFilter(ids);
              setPage(0);
            }}
            page={page}
            onPageChange={setPage}
            onRowClick={selectedIds.size === 0 ? (txn) => setEditingTxn(txn) : undefined}
            selectedIds={selectedIds.size > 0 ? selectedIds : undefined}
            onSelectionChange={selectedIds.size > 0 ? setSelectedIds : undefined}
          />
        )}
      </div>

      {editingTxn && (
        <TransactionDetailSheet
          key={editingTxn.id}
          transaction={editingTxn}
          categories={allCategoriesQuery.data ?? []}
          open={editingTxn != null}
          onClose={() => setEditingTxn(null)}
          onSaved={() => setEditingTxn(null)}
        />
      )}

      <TransactionCreateDialog
        categories={allCategoriesQuery.data ?? []}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => setCreateOpen(false)}
      />
    </>
  );
}
