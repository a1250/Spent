"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowUpRight,
  Ban,
  Clock,
  Copy,
  ListChecks,
  PlusCircle,
} from "lucide-react";
import { PageHeader } from "@/components/layout/app-shell";
import { TransactionLearningDialog } from "@/components/transactions/transaction-learning-dialog";
import { CoverageBanner } from "./coverage-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getCategories,
  getDataQualitySummary,
  getImportRowsNeedingAction,
  getNeedsReviewTransactions,
  patchImportRow,
  type ImportRowPatch,
} from "@/lib/api";
import type {
  ImportRowActionItem,
  NeedsReviewTransaction,
} from "@/lib/types";

const moneyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
});

export function ReviewPage() {
  const queryClient = useQueryClient();
  const [editingTransaction, setEditingTransaction] =
    useState<NeedsReviewTransaction | null>(null);

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

  const refreshQualityData = () => {
    void queryClient.invalidateQueries({ queryKey: ["review-summary"] });
    void queryClient.invalidateQueries({ queryKey: ["review-transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["review-import-rows"] });
    void queryClient.invalidateQueries({ queryKey: ["import-health"] });
    void queryClient.invalidateQueries({ queryKey: ["import-batches"] });
    void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["home"] });
  };

  return (
    <>
      <PageHeader
        title="Needs Review"
        meta={
          summaryQuery.data
            ? `${summaryQuery.data.needsReviewTransactions.toLocaleString("he-IL")} תנועות`
            : undefined
        }
      />

      <main className="space-y-6 p-4 md:p-6 lg:p-8" dir="rtl">
        {summaryQuery.data && (
          <CoverageBanner summary={summaryQuery.data} />
        )}

        <section className="space-y-3">
          <SectionHeading
            icon={ListChecks}
            title="תנועות הדורשות סיווג"
            description="ממוינות לפי הערך המוחלט הגבוה ביותר. שמירת כלל עתידי נשארת בחירה מפורשת בדיאלוג."
            count={transactionsQuery.data?.length}
          />
          <TransactionsReviewTable
            rows={transactionsQuery.data ?? []}
            loading={transactionsQuery.isLoading}
            onClassify={setEditingTransaction}
          />
        </section>

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

function TransactionsReviewTable({
  rows,
  loading,
  onClassify,
}: {
  rows: NeedsReviewTransaction[];
  loading: boolean;
  onClassify: (row: NeedsReviewTransaction) => void;
}) {
  if (loading) {
    return <TableState>טוען תנועות לבדיקה...</TableState>;
  }
  if (rows.length === 0) {
    return <TableState>אין תנועות שממתינות לסיווג.</TableState>;
  }

  return (
    <div className="max-h-[620px] overflow-auto rounded-xl border bg-card">
      <table className="w-full min-w-[1180px] text-sm">
        <thead className="sticky top-0 z-[1] bg-muted/95 text-xs text-muted-foreground backdrop-blur">
          <tr className="border-b">
            <th className="px-3 py-2 text-start font-medium">ID</th>
            <th className="px-3 py-2 text-start font-medium">תאריך</th>
            <th className="px-3 py-2 text-start font-medium">תיאור / צד נגדי</th>
            <th className="px-3 py-2 text-end font-medium">סכום</th>
            <th className="px-3 py-2 text-start font-medium">יחידה עסקית</th>
            <th className="px-3 py-2 text-start font-medium">קטגוריה</th>
            <th className="px-3 py-2 text-start font-medium">ייבוא</th>
            <th className="px-3 py-2 text-start font-medium">קטגוריה ישנה</th>
            <th className="px-3 py-2 text-center font-medium">ממתינה</th>
            <th className="px-3 py-2 text-start font-medium">פעולה</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b last:border-0 hover:bg-muted/20">
              <td className="px-3 py-2 font-mono text-xs">#{row.id}</td>
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
              </td>
              <td
                className={`whitespace-nowrap px-3 py-2 text-end font-mono font-medium tabular-nums ${
                  row.chargedAmount > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : ""
                }`}
              >
                {moneyFormatter.format(row.chargedAmount)}
              </td>
              <td className="px-3 py-2">{row.businessUnit ?? "—"}</td>
              <td className="px-3 py-2">
                {row.categoryName ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: row.categoryColor ?? "#94a3b8" }}
                    />
                    {row.categoryName}
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td className="max-w-[210px] px-3 py-2">
                {row.importBatchId != null ? (
                  <Link
                    href={`/import?batchId=${row.importBatchId}`}
                    className="group inline-flex max-w-full items-center gap-1 text-xs text-primary"
                  >
                    <span className="truncate">
                      #{row.importBatchId} · {row.sourceFilename ?? "ייבוא"}
                    </span>
                    <ArrowUpRight className="h-3 w-3 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </Link>
                ) : (
                  <span className="text-xs text-muted-foreground">לא מייבוא</span>
                )}
              </td>
              <td className="max-w-[180px] px-3 py-2">
                <span className="block truncate text-xs">
                  {row.legacyCategory ?? "—"}
                </span>
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
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImportRowsActionTable({
  rows,
  loading,
  onChanged,
}: {
  rows: ImportRowActionItem[];
  loading: boolean;
  onChanged: () => void;
}) {
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

  if (loading) {
    return <TableState>טוען שורות ייבוא...</TableState>;
  }
  if (rows.length === 0) {
    return <TableState>אין שורות ייבוא שממתינות לפעולה.</TableState>;
  }

  return (
    <div className="max-h-[620px] overflow-auto rounded-xl border bg-card">
      <table className="w-full min-w-[1260px] text-sm">
        <thead className="sticky top-0 z-[1] bg-muted/95 text-xs text-muted-foreground backdrop-blur">
          <tr className="border-b">
            <th className="px-3 py-2 text-start font-medium">שורה</th>
            <th className="px-3 py-2 text-start font-medium">Batch / קובץ</th>
            <th className="px-3 py-2 text-start font-medium">תאריך</th>
            <th className="px-3 py-2 text-start font-medium">תיאור</th>
            <th className="px-3 py-2 text-end font-medium">סכום</th>
            <th className="px-3 py-2 text-start font-medium">Import status</th>
            <th className="px-3 py-2 text-start font-medium">Transaction status</th>
            <th className="px-3 py-2 text-start font-medium">Classification</th>
            <th className="px-3 py-2 text-start font-medium">קטגוריית מקור</th>
            <th className="px-3 py-2 text-start font-medium">פעולות</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const busy =
              mutation.isPending && mutation.variables?.row.id === row.id;
            return (
              <tr key={row.id} className="border-b last:border-0 hover:bg-muted/20">
                <td className="px-3 py-2 font-mono text-xs">
                  #{row.id}
                  <div className="text-[10px] text-muted-foreground">
                    מקור {row.rawRowNumber}
                  </div>
                </td>
                <td className="max-w-[230px] px-3 py-2">
                  <Link
                    href={`/import?batchId=${row.batchId}`}
                    className="block truncate text-xs font-medium text-primary hover:underline"
                  >
                    #{row.batchId} · {row.sourceFilename}
                  </Link>
                  <div className="text-[10px] text-muted-foreground">
                    {row.adapterKey}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                  {row.date ?? "—"}
                </td>
                <td className="max-w-[260px] px-3 py-2">
                  <div className="truncate" title={row.description ?? undefined}>
                    {row.counterparty ?? row.description ?? "—"}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-end font-mono tabular-nums">
                  {row.amount == null ? "—" : moneyFormatter.format(row.amount)}
                </td>
                <td className="px-3 py-2">
                  <ImportStatusBadge status={row.importStatus} />
                </td>
                <td className="px-3 py-2">
                  <Badge
                    variant="outline"
                    className={
                      row.transactionStatus === "pending"
                        ? "border-violet-500/40 text-violet-700 dark:text-violet-300"
                        : ""
                    }
                  >
                    {row.transactionStatus}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <Badge variant="secondary">{row.classificationStatus}</Badge>
                </td>
                <td className="max-w-[180px] px-3 py-2">
                  <span className="block truncate text-xs">
                    {row.sourceCategory ?? row.legacyCategory ?? "—"}
                  </span>
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
  );
}

function ImportStatusBadge({
  status,
}: {
  status: ImportRowActionItem["importStatus"];
}) {
  if (status === "pending_duplicate") {
    return (
      <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300">
        pending duplicate
      </Badge>
    );
  }
  if (status === "skipped_duplicate") {
    return <Badge variant="secondary">skipped duplicate</Badge>;
  }
  if (status === "pending") {
    return (
      <Badge className="border-violet-500/40 bg-violet-500/10 text-violet-800 dark:text-violet-300">
        pending
      </Badge>
    );
  }
  return <Badge variant="outline">{status}</Badge>;
}

function TableState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card py-16 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
