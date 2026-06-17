"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/app-shell";
import { TransactionsTable } from "@/components/dashboard/transactions-table";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { AINotConnectedBanner } from "@/components/ai-not-connected-banner";
import { Button } from "@/components/ui/button";
import { KpiCards } from "./kpi-cards";
import { WidgetsRow } from "./widgets-row";
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

const CLASSIFICATION_STATUS_OPTIONS = [
  { value: "manually_approved", label: "Approved" },
  { value: "auto_classified", label: "Auto-classified" },
  { value: "needs_review", label: "Needs Review" },
];

export function TransactionsPage() {
  const t = useTranslations("transactions");
  const locale = useLocale() as Locale;
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<number[]>([]);
  const [accountFilter, setAccountFilter] = useState<number[]>([]);
  const [page, setPage] = useState(0);
  const [kind, setKind] = useState<TransactionKindFilter>("all");
  const [sortField, setSortField] = useState<TransactionSortField>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Phase 2Z: additional filters
  const [buFilter, setBuFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Phase 2Z: selection and dialogs
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editingTxn, setEditingTxn] = useState<TransactionWithCategory | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

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
    queryFn: () => listBusinessUnits(),
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
        businessUnit: buFilter || undefined,
        classificationStatus: statusFilter || undefined,
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

  const businessUnits = businessUnitsQuery.data ?? [];

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

        {/* Kind filter row */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-full border border-border bg-card p-1 w-fit">
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

          {/* BU filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">BU</span>
            <select
              value={buFilter}
              onChange={(e) => { setBuFilter(e.target.value); setPage(0); }}
              className="h-8 rounded-full border border-border bg-card px-3 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
            >
              <option value="">All</option>
              <option value="none">Unassigned</option>
              {businessUnits.map((bu) => (
                <option key={bu.slug} value={bu.slug}>{bu.label}</option>
              ))}
            </select>
          </div>

          {/* Classification status filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
              className="h-8 rounded-full border border-border bg-card px-3 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
            >
              <option value="">All</option>
              {CLASSIFICATION_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Bulk select toggle */}
          <button
            type="button"
            onClick={() => {
              if (selectedIds.size > 0) {
                setSelectedIds(new Set());
              } else {
                setSelectedIds(new Set());
              }
            }}
            className={
              selectedIds.size > 0
                ? "rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-foreground transition-colors"
                : "rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/50 hover:text-foreground"
            }
          >
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select rows"}
          </button>
        </div>

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
