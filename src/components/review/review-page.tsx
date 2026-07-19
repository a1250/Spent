"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowUpDown,
  ArrowUpRight,
  Ban,
  BarChart3,
  CheckSquare,
  Clock,
  Copy,
  Edit3,
  ListChecks,
  PlusCircle,
  Search,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/layout/app-shell";
import { TransactionLearningDialog } from "@/components/transactions/transaction-learning-dialog";
import { CoverageBanner } from "./coverage-banner";
import { CardPaymentWarningSection } from "./card-payment-warning-section";
import { ReviewFilterBar, EMPTY_FILTERS } from "./review-filter-bar";
import {
  ReviewCounterpartyGroups,
  buildCounterpartyGroups,
} from "./review-counterparty-groups";
import type { ReviewFilters } from "./review-filter-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  CashFlowTypeBadge,
  ClassificationStatusBadge,
  ImportRowStatusBadge,
  PnlImpactBadge,
  RuleProvenanceBadge,
  TransactionStatusBadge,
} from "@/components/import/import-intelligence-badges";
import {
  getCategories,
  getDataQualitySummary,
  getImportRowsNeedingAction,
  getNeedsReviewTransactions,
  listBusinessUnits,
  patchImportRow,
  type ImportRowPatch,
} from "@/lib/api";
import type {
  BusinessUnit,
  CashFlowType,
  Category,
  FinancialNature,
  ImportRowActionItem,
  NeedsReviewTransaction,
  PnlImpact,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const HIGH_VALUE_THRESHOLD = 5000;

const moneyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
});

const FINANCIAL_NATURE_LABELS: Record<FinancialNature, string> = {
  operating_income: "הכנסה תפעולית",
  operating_expense: "הוצאה תפעולית",
  credit_card_payment: "תשלום כרטיס אשראי",
  refund: "זיכוי / החזר",
  working_capital: "הון חוזר",
  internal_transfer: "העברה פנימית",
  owner_deposit: "הפקדת בעלים",
  owner_draw: "משיכת בעלים",
  investment: "השקעה",
  receivable_collection: "גביית חוב",
  payable_payment: "תשלום חוב",
  loan_received: "קבלת הלוואה",
  loan_repayment: "פירעון הלוואה",
  tax: "מס",
  unknown: "לא ידוע",
};

const CASH_FLOW_LABELS: Record<CashFlowType, string> = {
  real_cash_in: "תזרים נכנס",
  real_cash_out: "תזרים יוצא",
  internal_transfer: "העברה פנימית",
  non_cash: "ללא תנועת מזומן",
  pending: "ממתין",
  unknown: "לא ידוע",
};

const PNL_IMPACT_LABELS: Record<PnlImpact, string> = {
  yes: "כן",
  no: "לא",
  maybe: "אולי",
};

type SortField = "amount" | "date" | "counterparty" | "pending";
type ViewMode = "list" | "groups";

function applyFiltersAndSort(
  rows: NeedsReviewTransaction[],
  filters: ReviewFilters,
  sortField: SortField,
  sortOrder: "asc" | "desc"
): NeedsReviewTransaction[] {
  // Compute repeated counterparties for the toggle (from the full unfiltered set)
  const repeatedKeys = new Set<string>();
  if (filters.repeatedOnly) {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const k = (r.counterparty ?? r.cleanDescription ?? r.description ?? "")
        .toLowerCase()
        .trim();
      if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    for (const [k, n] of counts) {
      if (n > 1) repeatedKeys.add(k);
    }
  }

  let result = rows.filter((r) => {
    if (filters.search) {
      const term = filters.search.toLowerCase();
      if (
        !r.description?.toLowerCase().includes(term) &&
        !r.cleanDescription?.toLowerCase().includes(term) &&
        !r.counterparty?.toLowerCase().includes(term)
      )
        return false;
    }

    if (filters.auditSearch) {
      const term = filters.auditSearch.toLowerCase();
      if (
        !r.sourceCategory?.toLowerCase().includes(term) &&
        !r.legacyCategory?.toLowerCase().includes(term)
      )
        return false;
    }

    if (filters.batchId && r.importBatchId !== Number(filters.batchId))
      return false;
    if (filters.adapterKey && r.adapterKey !== filters.adapterKey) return false;
    if (filters.businessUnit && r.businessUnit !== filters.businessUnit)
      return false;
    if (
      filters.financialNature &&
      r.financialNature !== filters.financialNature
    )
      return false;
    if (filters.cashFlowType && r.cashFlowType !== filters.cashFlowType)
      return false;

    const absAmt = Math.abs(r.chargedAmount);
    if (filters.amountMin && absAmt < Number(filters.amountMin)) return false;
    if (filters.amountMax && absAmt > Number(filters.amountMax)) return false;
    if (filters.dateFrom && r.date < filters.dateFrom) return false;
    if (filters.dateTo && r.date > filters.dateTo) return false;
    if (filters.highValueOnly && absAmt < HIGH_VALUE_THRESHOLD) return false;

    if (filters.repeatedOnly) {
      const k = (r.counterparty ?? r.cleanDescription ?? r.description ?? "")
        .toLowerCase()
        .trim();
      if (!repeatedKeys.has(k)) return false;
    }

    return true;
  });

  // Sort
  result = [...result].sort((a, b) => {
    let cmp = 0;
    if (sortField === "amount")
      cmp = Math.abs(b.chargedAmount) - Math.abs(a.chargedAmount);
    else if (sortField === "date") cmp = a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    else if (sortField === "counterparty")
      cmp = (a.counterparty ?? a.description ?? "").localeCompare(
        b.counterparty ?? b.description ?? "",
        "he"
      );
    else if (sortField === "pending") cmp = b.daysPending - a.daysPending;

    return sortOrder === "asc" ? -cmp : cmp;
  });

  return result;
}

export function ReviewPage() {
  const queryClient = useQueryClient();
  const [editingTransaction, setEditingTransaction] =
    useState<NeedsReviewTransaction | null>(null);

  const [filters, setFilters] = useState<ReviewFilters>(() => {
    if (typeof window === "undefined") return EMPTY_FILTERS;
    const p = new URLSearchParams(window.location.search);
    const updates: Partial<ReviewFilters> = {};
    const batch = p.get("batch");
    if (batch) updates.batchId = batch;
    const counterparty = p.get("counterparty");
    if (counterparty) updates.search = counterparty;
    const sourceType = p.get("source_type");
    if (sourceType) updates.adapterKey = sourceType.replace(/_/g, "-");
    return { ...EMPTY_FILTERS, ...updates };
  });
  const [sortField, setSortField] = useState<SortField>("amount");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const summaryQuery = useQuery({
    queryKey: ["review-summary"],
    queryFn: getDataQualitySummary,
  });
  const transactionsQuery = useQuery({
    queryKey: ["review-transactions", { limit: 1000 }],
    queryFn: () => getNeedsReviewTransactions({ limit: 1000 }),
  });
  const importRowsQuery = useQuery({
    queryKey: ["review-import-rows", { limit: 2000 }],
    queryFn: () => getImportRowsNeedingAction({ limit: 2000 }),
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategories(),
  });

  const allRows = useMemo(
    () => transactionsQuery.data ?? [],
    [transactionsQuery.data]
  );

  const filteredRows = useMemo(
    () => applyFiltersAndSort(allRows, filters, sortField, sortOrder),
    [allRows, filters, sortField, sortOrder]
  );

  const counterpartyGroups = useMemo(
    () => buildCounterpartyGroups(allRows),
    [allRows]
  );

  const highlightedKey = editingTransaction
    ? (
        editingTransaction.counterparty ??
        editingTransaction.cleanDescription ??
        editingTransaction.description ??
        ""
      )
        .toLowerCase()
        .trim()
    : null;

  const refreshQualityData = () => {
    void queryClient.invalidateQueries({ queryKey: ["review-summary"] });
    void queryClient.invalidateQueries({ queryKey: ["review-transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["review-import-rows"] });
    void queryClient.invalidateQueries({ queryKey: ["import-health"] });
    void queryClient.invalidateQueries({ queryKey: ["import-batches"] });
    void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["home"] });
  };

  function handleFilterByCounterparty(name: string) {
    setFilters((f) => ({ ...f, search: name }));
    setViewMode("list");
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  }

  return (
    <>
      <PageHeader
        title="Needs Review"
        meta={
          summaryQuery.data
            ? `${summaryQuery.data.needsReviewTransactions.toLocaleString(
                "he-IL"
              )} תנועות`
            : undefined
        }
      />

      <main className="space-y-6 p-4 md:p-6 lg:p-8" dir="rtl">
        {summaryQuery.data && (
          <CoverageBanner summary={summaryQuery.data} />
        )}

        {/* Credit card payment / double-count risk warning */}
        <CardPaymentWarningSection allRows={allRows} />

        {/* Data quality quick links */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">קישורים מהירים:</span>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 px-3 text-xs" render={<Link href="/reports/data-quality" />}>
            <BarChart3 className="h-3.5 w-3.5" />
            Data Quality
          </Button>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 px-3 text-xs" render={<Link href="/reports/rules" />}>
            <ShieldCheck className="h-3.5 w-3.5" />
            Rules Report
          </Button>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 px-3 text-xs" render={<Link href="/import" />}>
            <ArrowUpRight className="h-3.5 w-3.5" />
            Import
          </Button>
        </div>

        {/* Transactions section */}
        <section className="space-y-3">
          <SectionHeading
            icon={ListChecks}
            title="תנועות הדורשות סיווג"
            description="ממוינות לפי הערך המוחלט הגבוה ביותר. שמירת כלל עתידי נשארת בחירה מפורשת בדיאלוג."
            count={transactionsQuery.data?.length}
          />

          {/* Filter bar */}
          <ReviewFilterBar
            filters={filters}
            onChange={setFilters}
            allRows={allRows}
            totalCount={allRows.length}
            filteredCount={filteredRows.length}
          />

          {/* View / sort controls */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
              <ViewTab
                active={viewMode === "list"}
                onClick={() => setViewMode("list")}
              >
                רשימה
              </ViewTab>
              <ViewTab
                active={viewMode === "groups"}
                onClick={() => setViewMode("groups")}
              >
                קיבוץ לפי צד נגדי
                {counterpartyGroups.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="ms-1.5 h-4 px-1 text-[10px]"
                  >
                    {counterpartyGroups.length}
                  </Badge>
                )}
              </ViewTab>
            </div>

            {viewMode === "list" && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>מיון:</span>
                <SortButton
                  active={sortField === "amount"}
                  order={sortOrder}
                  onClick={() => toggleSort("amount")}
                >
                  סכום
                </SortButton>
                <SortButton
                  active={sortField === "date"}
                  order={sortOrder}
                  onClick={() => toggleSort("date")}
                >
                  תאריך
                </SortButton>
                <SortButton
                  active={sortField === "counterparty"}
                  order={sortOrder}
                  onClick={() => toggleSort("counterparty")}
                >
                  צד נגדי
                </SortButton>
                <SortButton
                  active={sortField === "pending"}
                  order={sortOrder}
                  onClick={() => toggleSort("pending")}
                >
                  ימי המתנה
                </SortButton>
              </div>
            )}
          </div>

          {viewMode === "list" ? (
            <TransactionsReviewTable
              rows={filteredRows}
              loading={transactionsQuery.isLoading}
              onClassify={setEditingTransaction}
              highlightedKey={highlightedKey}
            />
          ) : (
            <ReviewCounterpartyGroups
              groups={counterpartyGroups}
              onFilterByCounterparty={handleFilterByCounterparty}
            />
          )}
        </section>

        {/* Import rows needing action */}
        <section className="space-y-3">
          <SectionHeading
            icon={AlertCircle}
            title="שורות ייבוא הדורשות פעולה"
            description="שורות staging ו-audit נשארות ב-import_rows ואינן הופכות לתנועות ללא פעולה מפורשת."
            count={importRowsQuery.data?.length}
          />
          <ImportRowsActionTable
            rows={importRowsQuery.data ?? []}
            loading={importRowsQuery.isLoading}
            categories={categoriesQuery.data ?? []}
            onChanged={refreshQualityData}
          />
        </section>
      </main>

      {editingTransaction && (
        <TransactionLearningDialog
          transaction={editingTransaction}
          categories={categoriesQuery.data ?? []}
          initialCategoryId={editingTransaction.categoryId}
          onClose={() => setEditingTransaction(null)}
          onSaved={refreshQualityData}
        />
      )}
    </>
  );
}

// ── Small shared UI primitives ────────────────────────────────────────────────

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function SortButton({
  active,
  order,
  onClick,
  children,
}: {
  active: boolean;
  order: "asc" | "desc";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-muted",
        active ? "bg-muted font-semibold text-foreground" : "text-muted-foreground"
      )}
    >
      {children}
      {active && (
        <ArrowUpDown
          className={cn(
            "h-3 w-3 transition-transform",
            order === "asc" && "rotate-180"
          )}
        />
      )}
    </button>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  description,
  count,
}: {
  icon: typeof ListChecks;
  title: string;
  description: string;
  count?: number;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 rounded-lg border bg-card p-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-serif text-xl">{title}</h2>
          {count != null && <Badge variant="secondary">{count}</Badge>}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

// ── Transactions review table ─────────────────────────────────────────────────

function TransactionsReviewTable({
  rows,
  loading,
  onClassify,
  highlightedKey,
}: {
  rows: NeedsReviewTransaction[];
  loading: boolean;
  onClassify: (row: NeedsReviewTransaction) => void;
  highlightedKey: string | null;
}) {
  if (loading) {
    return <TableState>טוען תנועות לבדיקה...</TableState>;
  }
  if (rows.length === 0) {
    return <TableState>אין תנועות שמתאימות לסינון הנוכחי.</TableState>;
  }

  return (
    <div className="max-h-[620px] overflow-auto rounded-xl border bg-card">
      <table className="w-full min-w-[1540px] text-sm">
        <thead className="sticky top-0 z-[1] bg-muted/95 text-xs text-muted-foreground backdrop-blur">
          <tr className="border-b">
            <th className="px-3 py-2 text-start font-medium">ID</th>
            <th className="px-3 py-2 text-start font-medium">תאריך</th>
            <th className="px-3 py-2 text-start font-medium">תיאור / צד נגדי</th>
            <th className="px-3 py-2 text-end font-medium">סכום</th>
            <th className="px-3 py-2 text-start font-medium">סטטוס</th>
            <th className="px-3 py-2 text-start font-medium">סיווג נוכחי</th>
            <th className="px-3 py-2 text-start font-medium">מקור ייבוא</th>
            <th className="px-3 py-2 text-start font-medium">Audit בלבד</th>
            <th className="px-3 py-2 text-start font-medium">Rule intelligence</th>
            <th className="px-3 py-2 text-center font-medium">ממתינה</th>
            <th className="px-3 py-2 text-start font-medium">פעולה</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rowKey = (
              row.counterparty ??
              row.cleanDescription ??
              row.description ??
              ""
            )
              .toLowerCase()
              .trim();
            const isSimilar =
              highlightedKey != null &&
              highlightedKey !== "" &&
              rowKey === highlightedKey;

            return (
              <tr
                key={row.id}
                className={cn(
                  "border-b last:border-0 hover:bg-muted/20",
                  isSimilar && "bg-primary/5 ring-1 ring-inset ring-primary/20"
                )}
              >
                <td className="px-3 py-2 font-mono text-xs">
                  <div>tx #{row.id}</div>
                  {row.importRowId != null && (
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      import row #{row.importRowId}
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                  {row.date}
                </td>
                <td className="max-w-[300px] px-3 py-2">
                  <div className="truncate font-medium" title={row.description}>
                    {row.cleanDescription ?? row.description}
                  </div>
                  {row.counterparty && (
                    <div className="truncate text-xs text-muted-foreground">
                      {row.counterparty}
                    </div>
                  )}
                  {isSimilar && (
                    <div className="mt-0.5 text-[10px] font-medium text-primary">
                      תנועה דומה
                    </div>
                  )}
                </td>
                <td
                  className={cn(
                    "whitespace-nowrap px-3 py-2 text-end font-mono font-medium tabular-nums",
                    row.chargedAmount > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : ""
                  )}
                >
                  {moneyFormatter.format(row.chargedAmount)}
                </td>
                <td className="px-3 py-2">
                  <ClassificationStatusBadge status={row.classificationStatus} />
                </td>
                <td className="max-w-[220px] px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    {row.categoryName && (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor: row.categoryColor ?? "#94a3b8",
                        }}
                      />
                    )}
                    <span className="truncate font-medium">
                      {row.categoryName ?? "ללא קטגוריה"}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    יחידה: {row.businessUnit ?? "unknown"}
                  </div>
                </td>
                <td className="max-w-[240px] px-3 py-2">
                  <SourceContext
                    batchId={row.importBatchId}
                    sourceFilename={row.sourceFilename}
                    adapterKey={row.adapterKey}
                    sourceType={row.sourceType}
                    sourceSection={row.sourceSection}
                    sourceSheetName={row.sourceSheetName}
                    importStatus={row.importStatus}
                  />
                </td>
                <td className="max-w-[220px] px-3 py-2">
                  <AuditCategoryContext
                    sourceCategory={row.sourceCategory}
                    legacyCategory={row.legacyCategory}
                  />
                </td>
                <td className="px-3 py-2">
                  <RuleProvenanceBadge
                    ruleId={row.appliedRuleId}
                    source={row.appliedRuleSource}
                    confidence={row.appliedRuleConfidence}
                    legacyRuleCategory={row.legacyRuleCategory}
                  />
                </td>
                <td className="px-3 py-2 text-center text-xs tabular-nums text-muted-foreground">
                  {row.daysPending} ימים
                </td>
                <td className="px-3 py-2">
                  <Button size="sm" onClick={() => onClassify(row)}>
                    סיווג
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Import rows action table ───────────────────────────────────────────────────

function ImportRowsActionTable({
  rows,
  loading,
  categories,
  onChanged,
}: {
  rows: ImportRowActionItem[];
  loading: boolean;
  categories: Category[];
  onChanged: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [editingRows, setEditingRows] = useState<ImportRowActionItem[] | null>(
    null
  );
  const mutation = useMutation({
    mutationFn: ({
      row,
      patch,
    }: {
      row: ImportRowActionItem;
      patch: ImportRowPatch;
    }) => patchImportRow(row.batchId, row.id, patch),
    onSuccess: (_result, { patch }) => {
      if (patch.duplicateAction === "skip_duplicate") {
        toast.success("השורה נשמרה ב-audit וסומנה ככפולה שדולגה");
      } else if (patch.duplicateAction === "import_anyway") {
        toast.success("הכפולה יובאה עם dedup sequence חדש");
      } else if (patch.pendingAction === "import_pending") {
        toast.success("עסקת pending יובאה במפורש");
      }
      onChanged();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "הפעולה נכשלה");
    },
  });
  const classifyMutation = useMutation({
    mutationFn: async ({
      targetRows,
      patch,
    }: {
      targetRows: ImportRowActionItem[];
      patch: ImportRowPatch;
    }) => {
      const results = [];
      for (const row of targetRows) {
        results.push(await patchImportRow(row.batchId, row.id, patch));
      }
      return results;
    },
    onSuccess: (_result, { targetRows, patch }) => {
      const count = targetRows.length;
      toast.success(
        patch.decision === "keep_review"
          ? `הסיווג נשמר ונשאר לבדיקה (${count})`
          : `הסיווג נשמר (${count})`
      );
      setEditingRows(null);
      setSelectedIds((current) => {
        const next = new Set(current);
        for (const row of targetRows) next.delete(row.id);
        return next;
      });
      onChanged();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "שמירת הסיווג נכשלה");
    },
  });

  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.has(row.id)),
    [rows, selectedIds]
  );
  const allVisibleSelected =
    rows.length > 0 && rows.every((row) => selectedIds.has(row.id));

  function toggleRow(rowId: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        for (const row of rows) next.delete(row.id);
      } else {
        for (const row of rows) next.add(row.id);
      }
      return next;
    });
  }

  if (loading) {
    return <TableState>טוען שורות ייבוא...</TableState>;
  }
  if (rows.length === 0) {
    return <TableState>אין שורות ייבוא שממתינות לפעולה.</TableState>;
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2">
        <div className="text-sm text-muted-foreground">
          {selectedRows.length > 0
            ? `${selectedRows.length} שורות נבחרו`
            : "בחר שורות כדי לבצע סיווג מרובה"}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={toggleAllVisible}
            className="min-h-9 gap-1.5"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            {allVisibleSelected ? "בטל בחירה" : "בחר את כל המוצגות"}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={selectedRows.length === 0}
            onClick={() => setEditingRows(selectedRows)}
            className="min-h-9 gap-1.5"
          >
            <Edit3 className="h-3.5 w-3.5" />
            Bulk Edit / Classify
          </Button>
        </div>
      </div>

      <div
        className="max-h-[620px] overflow-auto rounded-xl border bg-card"
        data-import-review-table
      >
      <table className="w-full min-w-[1500px] text-sm">
        <thead className="sticky top-0 z-[1] bg-muted/95 text-xs text-muted-foreground backdrop-blur">
          <tr className="border-b">
            <th className="sticky start-0 z-[3] w-12 bg-muted/95 px-3 py-2 text-center font-medium">
              <input
                type="checkbox"
                aria-label="בחר את כל שורות הייבוא המוצגות"
                checked={allVisibleSelected}
                onChange={toggleAllVisible}
                className="h-4 w-4 rounded border-input"
              />
            </th>
            <th className="sticky start-12 z-[3] bg-muted/95 px-3 py-2 text-start font-medium">
              פעולה
            </th>
            <th className="px-3 py-2 text-start font-medium">שורה</th>
            <th className="px-3 py-2 text-start font-medium">מקור</th>
            <th className="px-3 py-2 text-start font-medium">תאריכים</th>
            <th className="px-3 py-2 text-start font-medium">תיאור</th>
            <th className="px-3 py-2 text-end font-medium">סכום</th>
            <th className="px-3 py-2 text-start font-medium">סטטוס / סיבה</th>
            <th className="px-3 py-2 text-start font-medium">Audit בלבד</th>
            <th className="px-3 py-2 text-start font-medium">סיווג</th>
            <th className="px-3 py-2 text-start font-medium">Rule intelligence</th>
            <th className="px-3 py-2 text-start font-medium">פעולות נוספות</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const busy =
              mutation.isPending && mutation.variables?.row.id === row.id;
            return (
              <tr
                key={row.id}
                className="border-b last:border-0 hover:bg-muted/20"
              >
                <td className="sticky start-0 z-[2] bg-card px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    aria-label={`בחר שורת ייבוא ${row.id}`}
                    checked={selectedIds.has(row.id)}
                    onChange={() => toggleRow(row.id)}
                    className="h-4 w-4 rounded border-input"
                  />
                </td>
                <td className="sticky start-12 z-[2] bg-card px-3 py-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setEditingRows([row])}
                    className="min-h-9 whitespace-nowrap gap-1.5"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Edit / Classify
                  </Button>
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  #{row.id}
                  <div className="text-[10px] text-muted-foreground">
                    מקור {row.rawRowNumber}
                  </div>
                </td>
                <td className="max-w-[260px] px-3 py-2">
                  <SourceContext
                    batchId={row.batchId}
                    sourceFilename={row.sourceFilename}
                    adapterKey={row.adapterKey}
                    sourceType={row.sourceType}
                    sourceSection={row.sourceSection}
                    sourceSheetName={row.sourceSheetName}
                    importStatus={row.importStatus}
                  />
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                  <div>{row.date ?? "—"}</div>
                  {row.billingDate && (
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      billing {row.billingDate}
                    </div>
                  )}
                  {row.valueDate && row.valueDate !== row.date && (
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      value {row.valueDate}
                    </div>
                  )}
                </td>
                <td className="max-w-[260px] px-3 py-2">
                  <div
                    className="truncate"
                    title={row.description ?? undefined}
                  >
                    {row.counterparty ?? row.description ?? "—"}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-end font-mono tabular-nums">
                  {row.amount == null
                    ? "—"
                    : moneyFormatter.format(row.amount)}
                </td>
                <td className="max-w-[260px] px-3 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    <ImportRowStatusBadge status={row.importStatus} />
                    <TransactionStatusBadge status={row.transactionStatus} />
                    <ClassificationStatusBadge
                      status={row.classificationStatus}
                    />
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {getImportRowReason(row)}
                  </p>
                </td>
                <td className="max-w-[220px] px-3 py-2">
                  <AuditCategoryContext
                    sourceCategory={row.sourceCategory}
                    legacyCategory={row.legacyCategory}
                  />
                </td>
                <td className="max-w-[250px] px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setEditingRows([row])}
                    className={cn(
                      "inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-start text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      row.categoryName
                        ? "bg-background"
                        : "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-200"
                    )}
                    aria-label={`Edit category for import row ${row.id}`}
                  >
                    {row.categoryColor && (
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: row.categoryColor }}
                      />
                    )}
                    <span className="truncate">
                      {row.categoryName ?? "No category / ללא קטגוריה"}
                    </span>
                  </button>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {row.financialNature.replaceAll("_", " ")} ·{" "}
                    {row.businessUnit ?? "unknown"}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <CashFlowTypeBadge type={row.cashFlowType} />
                    <PnlImpactBadge impact={row.pnlImpact} />
                  </div>
                </td>
                <td className="px-3 py-2">
                  <RuleProvenanceBadge
                    ruleId={row.appliedRuleId}
                    source={row.appliedRuleSource}
                    confidence={row.appliedRuleConfidence}
                    legacyRuleCategory={row.legacyRuleCategory}
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="flex min-w-max items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      render={
                        <Link href={`/import?batchId=${row.batchId}`}>
                          {row.importStatus === "pending_duplicate" ? (
                            <Copy className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          )}
                          {row.importStatus === "pending_duplicate"
                            ? "בדיקת כפילות"
                            : "סקירת batch"}
                        </Link>
                      }
                    />
                    {row.importStatus === "pending_duplicate" && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            mutation.mutate({
                              row,
                              patch: { duplicateAction: "skip_duplicate" },
                            })
                          }
                        >
                          <Ban className="h-3.5 w-3.5" />
                          דלג
                        </Button>
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            mutation.mutate({
                              row,
                              patch: { duplicateAction: "import_anyway" },
                            })
                          }
                        >
                          <PlusCircle className="h-3.5 w-3.5" />
                          ייבא בכל זאת
                        </Button>
                      </>
                    )}
                    {row.transactionStatus === "pending" &&
                      row.importStatus === "pending" && (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            mutation.mutate({
                              row,
                              patch: { pendingAction: "import_pending" },
                            })
                          }
                        >
                          <Clock className="h-3.5 w-3.5" />
                          Import pending
                        </Button>
                      )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      {editingRows && (
        <ImportRowClassificationDialog
          rows={editingRows}
          categories={categories}
          saving={classifyMutation.isPending}
          onCancel={() => setEditingRows(null)}
          onSave={(patch) =>
            classifyMutation.mutate({
              targetRows: editingRows,
              patch,
            })
          }
        />
      )}
    </>
  );
}

function ImportRowClassificationDialog({
  rows,
  categories,
  saving,
  onCancel,
  onSave,
}: {
  rows: ImportRowActionItem[];
  categories: Category[];
  saving: boolean;
  onCancel: () => void;
  onSave: (patch: ImportRowPatch) => void;
}) {
  const first = rows[0];
  const activeLeafCategories = useMemo(
    () =>
      categories
        .filter((category) => category.parentId !== null && !category.isArchived)
        .sort((a, b) => a.name.localeCompare(b.name, "he")),
    [categories]
  );
  const parentById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );
  const initialCategoryId =
    first.categoryId != null &&
    activeLeafCategories.some((category) => category.id === first.categoryId)
      ? String(first.categoryId)
      : "none";
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [categorySearch, setCategorySearch] = useState("");
  const [financialNature, setFinancialNature] = useState<FinancialNature>(
    first.financialNature
  );
  const [cashFlowType, setCashFlowType] = useState<CashFlowType>(
    first.cashFlowType
  );
  const [pnlImpact, setPnlImpact] = useState<PnlImpact>(first.pnlImpact);
  const [businessUnit, setBusinessUnit] = useState<BusinessUnit | "none">(
    first.businessUnit ?? "none"
  );
  const [decision, setDecision] = useState<"approve" | "keep_review">(
    first.classificationStatus === "needs_review" ? "keep_review" : "approve"
  );
  const [otherBusinessConfirmed, setOtherBusinessConfirmed] = useState(false);
  const { data: businessUnits = [] } = useQuery({
    queryKey: ["business-units"],
    queryFn: () => listBusinessUnits(),
  });
  const filteredCategories = useMemo(() => {
    const term = categorySearch.trim().toLowerCase();
    if (!term) return activeLeafCategories;
    return activeLeafCategories.filter((category) => {
      const parent = category.parentId
        ? parentById.get(category.parentId)
        : null;
      return `${parent?.name ?? ""} ${category.name}`
        .toLowerCase()
        .includes(term);
    });
  }, [activeLeafCategories, categorySearch, parentById]);
  const selectedCategory =
    categoryId === "none"
      ? null
      : activeLeafCategories.find((category) => category.id === Number(categoryId)) ??
        null;
  const currentCategoryLabel =
    rows.length === 1
      ? first.categoryName ?? "No category / ללא קטגוריה"
      : `${rows.length} selected rows`;

  function save() {
    onSave({
      categoryId: categoryId === "none" ? null : Number(categoryId),
      financialNature,
      cashFlowType,
      pnlImpact,
      businessUnit: businessUnit === "none" ? null : businessUnit,
      decision,
      applyScope: "row",
      saveAsRule: false,
      otherBusinessConfirmed:
        decision === "approve" && businessUnit === "other"
          ? otherBusinessConfirmed
          : false,
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent
        className="max-h-[92vh] max-w-[min(760px,calc(100vw-2rem))] overflow-hidden p-0"
        dir="rtl"
      >
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="font-serif text-xl font-normal">
            Edit / Classify import row
          </DialogTitle>
          <DialogDescription>
            {rows.length === 1
              ? `Import row #${first.id} · ${first.counterparty ?? first.description ?? "No description"}`
              : `Bulk classification for ${rows.length} selected import rows`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[calc(92vh-9rem)] gap-4 overflow-y-auto px-5 py-4 md:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.9fr)]">
          <section className="space-y-3">
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <div className="text-xs text-muted-foreground">Current category</div>
              <div className="mt-1 font-medium">{currentCategoryLabel}</div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-row-category-search">
                Search category
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="import-row-category-search"
                  value={categorySearch}
                  onChange={(event) => setCategorySearch(event.target.value)}
                  placeholder="Search active categories..."
                  className="min-h-10 ps-9"
                />
              </div>
            </div>

            <div
              className="max-h-72 space-y-1 overflow-y-auto rounded-lg border p-2"
              role="listbox"
              aria-label="Category options"
            >
              <CategoryOptionButton
                selected={categoryId === "none"}
                onClick={() => setCategoryId("none")}
                label="No category / ללא קטגוריה"
              />
              {filteredCategories.map((category) => {
                const parent = category.parentId
                  ? parentById.get(category.parentId)
                  : null;
                return (
                  <CategoryOptionButton
                    key={category.id}
                    selected={categoryId === String(category.id)}
                    onClick={() => setCategoryId(String(category.id))}
                    label={category.name}
                    meta={parent?.name}
                    color={category.color}
                  />
                );
              })}
              {filteredCategories.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No active categories match this search.
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Archived categories are excluded from this picker by default.
            </p>
          </section>

          <section className="space-y-3">
            <div className="space-y-1.5">
              <Label>Selected category</Label>
              <div className="flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm">
                {selectedCategory?.color && (
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: selectedCategory.color }}
                  />
                )}
                <span className="truncate">
                  {selectedCategory?.name ?? "No category / ללא קטגוריה"}
                </span>
              </div>
            </div>

            <SelectField
              label="Classification status"
              value={decision}
              onValueChange={(value) =>
                setDecision(value as "approve" | "keep_review")
              }
              options={[
                ["approve", "Manually approved"],
                ["keep_review", "Keep in review"],
              ]}
            />
            <SelectField
              label="Financial nature"
              value={financialNature}
              onValueChange={(value) =>
                setFinancialNature(value as FinancialNature)
              }
              options={Object.entries(FINANCIAL_NATURE_LABELS)}
            />
            <SelectField
              label="Cash flow type"
              value={cashFlowType}
              onValueChange={(value) => setCashFlowType(value as CashFlowType)}
              options={Object.entries(CASH_FLOW_LABELS)}
            />
            <SelectField
              label="P&L impact"
              value={pnlImpact}
              onValueChange={(value) => setPnlImpact(value as PnlImpact)}
              options={Object.entries(PNL_IMPACT_LABELS)}
            />
            <SelectField
              label="Business unit"
              value={businessUnit}
              onValueChange={(value) =>
                setBusinessUnit(value as BusinessUnit | "none")
              }
              options={[
                ["none", "Not assigned"],
                ...businessUnits.map((unit) => [unit.slug, unit.label] as const),
              ]}
            />
            {businessUnit === "other" && decision === "approve" && (
              <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <Label htmlFor="import-row-other-business-confirm">
                  Confirm this is general business activity
                </Label>
                <Switch
                  id="import-row-other-business-confirm"
                  checked={otherBusinessConfirmed}
                  onCheckedChange={setOtherBusinessConfirmed}
                />
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="px-5 py-4">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save / Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryOptionButton({
  selected,
  onClick,
  label,
  meta,
  color,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  meta?: string;
  color?: string;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        "flex min-h-10 w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        selected && "bg-primary/10 text-primary"
      )}
    >
      {color && (
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label}</span>
        {meta && (
          <span className="block truncate text-xs text-muted-foreground">
            {meta}
          </span>
        )}
      </span>
    </button>
  );
}

function SelectField({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select
        value={value}
        onValueChange={(nextValue) => {
          if (nextValue) onValueChange(nextValue);
        }}
      >
        <SelectTrigger className="h-10 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start" className="max-h-72">
          {options.map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ── Shared sub-components ────────────────────────────────────────────────────

function SourceContext({
  batchId,
  sourceFilename,
  adapterKey,
  sourceType,
  sourceSection,
  sourceSheetName,
  importStatus,
}: {
  batchId: number | null;
  sourceFilename: string | null;
  adapterKey: string | null;
  sourceType: string | null;
  sourceSection: string | null;
  sourceSheetName: string | null;
  importStatus: ImportRowActionItem["importStatus"] | null;
}) {
  if (batchId == null) {
    return <span className="text-xs text-muted-foreground">לא מייבוא</span>;
  }

  return (
    <div className="space-y-1">
      <Link
        href={`/import?batchId=${batchId}`}
        className="group inline-flex max-w-full items-center gap-1 text-xs font-medium text-primary"
      >
        <span className="truncate">
          #{batchId} · {sourceFilename ?? "ייבוא"}
        </span>
        <ArrowUpRight className="h-3 w-3 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </Link>
      <div className="text-[10px] leading-4 text-muted-foreground">
        {[adapterKey, sourceType, sourceSection].filter(Boolean).join(" · ") ||
          "source metadata unavailable"}
      </div>
      {sourceSheetName && (
        <div className="text-[10px] text-muted-foreground">
          sheet: {sourceSheetName}
        </div>
      )}
      {importStatus && <ImportRowStatusBadge status={importStatus} />}
    </div>
  );
}

function AuditCategoryContext({
  sourceCategory,
  legacyCategory,
}: {
  sourceCategory: string | null;
  legacyCategory: string | null;
}) {
  if (!sourceCategory && !legacyCategory) {
    return <span className="text-xs text-muted-foreground">אין metadata</span>;
  }

  return (
    <div className="space-y-1 text-xs">
      {sourceCategory && (
        <div className="truncate" title={sourceCategory}>
          <span className="text-muted-foreground">source:</span> {sourceCategory}
        </div>
      )}
      {legacyCategory && legacyCategory !== sourceCategory && (
        <div className="truncate" title={legacyCategory}>
          <span className="text-muted-foreground">legacy:</span> {legacyCategory}
        </div>
      )}
      <div className="text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
        Audit only · not final category
      </div>
    </div>
  );
}

function getImportRowReason(row: ImportRowActionItem): string {
  if (row.importStatus === "pending_duplicate") {
    return row.duplicateOfTransactionId == null
      ? "Potential duplicate retained for explicit review."
      : `Potential duplicate of transaction #${row.duplicateOfTransactionId}.`;
  }
  if (row.importStatus === "skipped_duplicate") {
    return "Skipped as duplicate and retained in import_rows for audit.";
  }
  if (row.transactionStatus === "pending") {
    return "Pending/future transaction; normal commit keeps it out of transactions.";
  }
  if (row.importStatus === "imported") {
    return row.transactionId == null
      ? "Imported row."
      : `Imported and linked to transaction #${row.transactionId}.`;
  }
  if (row.legacyRuleCategory?.trim()) {
    return "Legacy/seed suggestion was retained for audit and blocked from auto-classification.";
  }
  if (row.classificationStatus === "needs_review") {
    return "Manual classification is still required.";
  }
  return "Staged import row retained for audit.";
}

function TableState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card py-16 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
