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
          {rows.map((row) => (
            <tr key={row.id} className="border-b last:border-0 hover:bg-muted/20">
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
              <td className="px-3 py-2">
                <ClassificationStatusBadge status={row.classificationStatus} />
              </td>
              <td className="max-w-[220px] px-3 py-2">
                <div className="flex items-center gap-1.5">
                  {row.categoryName && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: row.categoryColor ?? "#94a3b8" }}
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
      <table className="w-full min-w-[1780px] text-sm">
        <thead className="sticky top-0 z-[1] bg-muted/95 text-xs text-muted-foreground backdrop-blur">
          <tr className="border-b">
            <th className="px-3 py-2 text-start font-medium">שורה</th>
            <th className="px-3 py-2 text-start font-medium">מקור</th>
            <th className="px-3 py-2 text-start font-medium">תאריכים</th>
            <th className="px-3 py-2 text-start font-medium">תיאור</th>
            <th className="px-3 py-2 text-end font-medium">סכום</th>
            <th className="px-3 py-2 text-start font-medium">סטטוס / סיבה</th>
            <th className="px-3 py-2 text-start font-medium">Audit בלבד</th>
            <th className="px-3 py-2 text-start font-medium">סיווג</th>
            <th className="px-3 py-2 text-start font-medium">Rule intelligence</th>
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
                  <div className="truncate" title={row.description ?? undefined}>
                    {row.counterparty ?? row.description ?? "—"}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-end font-mono tabular-nums">
                  {row.amount == null ? "—" : moneyFormatter.format(row.amount)}
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
                  <div className="font-medium">
                    {row.categoryName ?? "ללא קטגוריה"}
                  </div>
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
  );
}

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
          <span className="text-muted-foreground">source:</span>{" "}
          {sourceCategory}
        </div>
      )}
      {legacyCategory && legacyCategory !== sourceCategory && (
        <div className="truncate" title={legacyCategory}>
          <span className="text-muted-foreground">legacy:</span>{" "}
          {legacyCategory}
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
