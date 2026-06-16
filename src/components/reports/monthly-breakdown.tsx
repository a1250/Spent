"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getMonthlyBreakdown } from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  FinancialNature,
  MonthlyBreakdown,
  MonthlyBreakdownBusinessUnitLine,
  MonthlyBreakdownCategoryLine,
  MonthlyBreakdownNatureLine,
  MonthlyBreakdownNeedsReviewRow,
} from "@/lib/types";

const currency = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const NATURE_LABELS: Partial<Record<FinancialNature, string>> = {
  operating_income: "Operating Revenue",
  operating_expense: "Operating Expense",
  refund: "Refund / Adjustment",
  tax: "Tax",
  credit_card_payment: "Credit Card Payment",
  internal_transfer: "Internal Transfer",
  owner_deposit: "Owner Deposit",
  owner_draw: "Owner Draw",
  working_capital: "Working Capital",
  investment: "Investment",
  loan_received: "Loan Received",
  loan_repayment: "Loan Repayment",
  receivable_collection: "Receivable Collection",
  payable_payment: "Payable Payment",
  unknown: "Unknown",
};

function formatMonth(month: string): string {
  if (!month) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

export function MonthlyBreakdownPage() {
  const [selectedMonth, setSelectedMonth] = useState("");

  const query = useQuery({
    queryKey: ["monthly-breakdown", selectedMonth],
    queryFn: () => getMonthlyBreakdown(selectedMonth || undefined),
  });

  const report = query.data;

  useEffect(() => {
    if (report?.month && !selectedMonth) {
      setSelectedMonth(report.month);
    }
  }, [report?.month, selectedMonth]);

  const currentIndex = report
    ? report.availableMonths.indexOf(selectedMonth)
    : -1;
  const prevMonth =
    currentIndex >= 0 && currentIndex < report!.availableMonths.length - 1
      ? report!.availableMonths[currentIndex + 1]
      : null;
  const nextMonth =
    currentIndex > 0 ? report!.availableMonths[currentIndex - 1] : null;

  return (
    <>
      <PageHeader
        title="Monthly Breakdown"
        meta="Classified transactions only"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => prevMonth && setSelectedMonth(prevMonth)}
              disabled={!prevMonth}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <Select
              value={selectedMonth}
              onValueChange={(v) => {
                if (v) setSelectedMonth(v);
              }}
            >
              <SelectTrigger className="h-9 w-44">
                <CalendarDays className="me-2 h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue>
                  {(v: string) => (v ? formatMonth(v) : "Loading...")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(report?.availableMonths ?? []).map((m) => (
                  <SelectItem key={m} value={m}>
                    {formatMonth(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => nextMonth && setSelectedMonth(nextMonth)}
              disabled={!nextMonth}
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300"
            >
              Preview
            </Badge>
          </div>
        }
      />

      <main className="space-y-6 p-4 md:p-6 lg:p-8">
        {query.isLoading && (
          <EmptyState>Loading {formatMonth(selectedMonth) || "latest month"}...</EmptyState>
        )}
        {query.isError && (
          <EmptyState error>Monthly breakdown could not be loaded.</EmptyState>
        )}

        {report && (
          <>
            <SummaryCards report={report} />
            {report.coverage.needsReviewTransactions > 0 && (
              <CoverageWarning report={report} />
            )}
            <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
              <div className="space-y-6">
                <ExpenseCategorySection rows={report.categoryExpenseBreakdown} />
                <IncomeBreakdownSection rows={report.incomeBreakdown} />
                <NonPnlMovementsSection rows={report.nonPnlMovements} />
              </div>
              <div className="space-y-6">
                <BusinessUnitSection rows={report.businessUnitBreakdown} />
                <NeedsReviewSection
                  rows={report.needsReviewTop10}
                />
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}

function SummaryCards({ report }: { report: MonthlyBreakdown }) {
  const { pnl, coverage } = report;
  const nonPnlTotal = report.nonPnlMovements.reduce(
    (sum, r) => sum + r.amount,
    0
  );

  const cards: Array<{
    label: string;
    value: number;
    format: "signed" | "positive" | "plain";
    featured?: boolean;
  }> = [
    {
      label: "Net P&L Preview",
      value: pnl.netPnL,
      format: "signed",
      featured: true,
    },
    {
      label: "Operating Revenue",
      value: pnl.operatingRevenue,
      format: "positive",
    },
    {
      label: "Operating Expenses",
      value: pnl.operatingExpenses,
      format: "plain",
    },
    {
      label: "Non-P&L Cash Movement",
      value: nonPnlTotal,
      format: "plain",
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={cn(
            "rounded-2xl border bg-card p-4",
            card.featured && "border-foreground/25 bg-foreground/[0.025]"
          )}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {card.label}
          </div>
          <div
            className={cn(
              "mt-3 font-serif text-2xl tabular-nums",
              card.format === "signed" &&
                (card.value >= 0
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-red-700 dark:text-red-300"),
              card.format === "positive" &&
                card.value > 0 &&
                "text-emerald-700 dark:text-emerald-300"
            )}
          >
            {currency.format(card.value)}
          </div>
          {card.featured && (
            <p className="mt-1 text-xs text-muted-foreground">
              {coverage.coverageByValue.toFixed(1)}% value coverage
            </p>
          )}
        </div>
      ))}
      <div className="rounded-2xl border bg-card p-4 sm:col-span-2 xl:col-span-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Needs Review
        </div>
        <div
          className={cn(
            "mt-3 font-serif text-2xl tabular-nums",
            coverage.needsReviewTransactions > 0 &&
              "text-amber-700 dark:text-amber-300"
          )}
        >
          {coverage.needsReviewTransactions.toLocaleString("en-US")}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {currency.format(coverage.unclassifiedValueTotal)} unclassified value
        </p>
      </div>
    </section>
  );
}

function CoverageWarning({ report }: { report: MonthlyBreakdown }) {
  const { coverage } = report;
  return (
    <section className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/[0.05] p-4">
      <div className="rounded-lg bg-amber-500/15 p-2">
        <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
          {coverage.needsReviewTransactions.toLocaleString("en-US")} transactions
          still need review this month.
        </p>
        <p className="mt-1 text-xs text-amber-800/70 dark:text-amber-200/70">
          Their {currency.format(coverage.unclassifiedValueTotal)} of absolute
          value is excluded from all P&L and cash-flow totals.{" "}
          {coverage.coverageByCount.toFixed(1)}% count /{" "}
          {coverage.coverageByValue.toFixed(1)}% value classified.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        nativeButton={false}
        className="shrink-0 border-amber-600/30"
        render={
          <Link href="/review">
            Review
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        }
      />
    </section>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div>
      <h2 className="font-serif text-xl">{title}</h2>
      {subtitle && (
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}

function EmptyTable({ message }: { message: string }) {
  return (
    <div className="py-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function ExpenseCategorySection({
  rows,
}: {
  rows: MonthlyBreakdownCategoryLine[];
}) {
  if (rows.length === 0) {
    return (
      <section className="space-y-3">
        <SectionHeader
          title="Expenses by Category"
          subtitle="P&L operating expenses, classified and approved."
        />
        <div className="rounded-2xl border bg-card">
          <EmptyTable message="No classified operating expenses this month." />
        </div>
      </section>
    );
  }

  const max = Math.max(...rows.map((r) => r.amount), 1);

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Expenses by Category"
        subtitle="P&L operating expenses, classified and approved."
      />
      <div className="overflow-hidden rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/35 text-xs text-muted-foreground">
              <th className="px-4 py-3 text-start font-medium">Category</th>
              <th className="px-4 py-3 text-center font-medium">Txns</th>
              <th className="px-4 py-3 text-end font-medium">Amount</th>
              <th className="w-28 px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.categoryId}-${row.categoryName}`}
                className="border-b last:border-0 hover:bg-muted/20"
              >
                <td className="px-4 py-2.5">
                  {row.parentName && (
                    <span className="text-xs text-muted-foreground">
                      {row.parentName} /
                    </span>
                  )}{" "}
                  <span className="font-medium">{row.categoryName}</span>
                </td>
                <td className="px-4 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                  {row.transactionCount}
                </td>
                <td className="px-4 py-2.5 text-end font-mono tabular-nums">
                  {currency.format(row.amount)}
                </td>
                <td className="px-4 py-2.5">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-rose-500/60"
                      style={{
                        width: `${Math.round((row.amount / max) * 100)}%`,
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function IncomeBreakdownSection({
  rows,
}: {
  rows: MonthlyBreakdownNatureLine[];
}) {
  return (
    <section className="space-y-3">
      <SectionHeader
        title="Income Breakdown"
        subtitle="All classified cash-in by financial nature. Refunds and owner deposits shown separately."
      />
      <div className="overflow-hidden rounded-2xl border bg-card">
        {rows.length === 0 ? (
          <EmptyTable message="No classified cash inflows this month." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/35 text-xs text-muted-foreground">
                <th className="px-4 py-3 text-start font-medium">Nature</th>
                <th className="px-4 py-3 text-center font-medium">Txns</th>
                <th className="px-4 py-3 text-end font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.financialNature}
                  className="border-b last:border-0 hover:bg-muted/20"
                >
                  <td className="px-4 py-2.5 font-medium">
                    {NATURE_LABELS[row.financialNature] ?? row.financialNature}
                  </td>
                  <td className="px-4 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                    {row.transactionCount}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-end font-mono tabular-nums",
                      row.financialNature === "operating_income" &&
                        "text-emerald-700 dark:text-emerald-300"
                    )}
                  >
                    {currency.format(row.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function NonPnlMovementsSection({
  rows,
}: {
  rows: MonthlyBreakdownNatureLine[];
}) {
  return (
    <section className="space-y-3">
      <SectionHeader
        title="Non-P&L Movements"
        subtitle="Balance-sheet items excluded from operating P&L. Credit card payments, transfers, and financing shown for transparency."
      />
      <div className="overflow-hidden rounded-2xl border bg-card">
        {rows.length === 0 ? (
          <EmptyTable message="No non-P&L movements this month." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/35 text-xs text-muted-foreground">
                <th className="px-4 py-3 text-start font-medium">Nature</th>
                <th className="px-4 py-3 text-center font-medium">Txns</th>
                <th className="px-4 py-3 text-end font-medium">
                  Abs. Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.financialNature}
                  className="border-b last:border-0 hover:bg-muted/20"
                >
                  <td className="px-4 py-2.5 font-medium">
                    {NATURE_LABELS[row.financialNature] ?? row.financialNature}
                  </td>
                  <td className="px-4 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                    {row.transactionCount}
                  </td>
                  <td className="px-4 py-2.5 text-end font-mono tabular-nums text-muted-foreground">
                    {currency.format(row.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function BusinessUnitSection({
  rows,
}: {
  rows: MonthlyBreakdownBusinessUnitLine[];
}) {
  const visibleRows = rows.filter(
    (r) => r.netPnL !== 0 || r.uncertainPnL !== 0 || r.transactionCount > 0
  );

  return (
    <section className="space-y-3">
      <SectionHeader title="Business Unit P&L" />
      <div className="overflow-hidden rounded-2xl border bg-card">
        {visibleRows.length === 0 ? (
          <EmptyTable message="No classified rows." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/35 text-xs text-muted-foreground">
                <th className="px-4 py-3 text-start font-medium">Unit</th>
                <th className="px-4 py-3 text-end font-medium">Net P&L</th>
                <th className="px-4 py-3 text-end font-medium">Uncertain</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr
                  key={row.businessUnit}
                  className="border-b last:border-0 hover:bg-muted/20"
                >
                  <td className="px-4 py-2.5">
                    <span className="font-medium capitalize">
                      {row.businessUnit}
                    </span>
                    <span className="ms-2 text-xs text-muted-foreground">
                      {row.transactionCount} txns
                    </span>
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-end font-mono tabular-nums",
                      row.netPnL > 0
                        ? "text-emerald-700 dark:text-emerald-300"
                        : row.netPnL < 0
                          ? "text-red-700 dark:text-red-300"
                          : "text-muted-foreground"
                    )}
                  >
                    {currency.format(row.netPnL)}
                  </td>
                  <td className="px-4 py-2.5 text-end font-mono tabular-nums text-amber-700 dark:text-amber-300">
                    {row.uncertainPnL !== 0
                      ? currency.format(row.uncertainPnL)
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function NeedsReviewSection({
  rows,
}: {
  rows: MonthlyBreakdownNeedsReviewRow[];
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <SectionHeader
          title="Needs Review"
          subtitle="Largest unclassified transactions."
        />
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          className="shrink-0"
          render={
            <Link href="/review">
              Review all
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          }
        />
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card">
        {rows.length === 0 ? (
          <EmptyTable message="No needs-review transactions this month." />
        ) : (
          <div className="divide-y">
            {rows.map((row) => (
              <div key={row.id} className="px-4 py-3 hover:bg-muted/20">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {row.description}
                    </div>
                    {row.counterparty && row.counterparty !== row.description && (
                      <div className="truncate text-xs text-muted-foreground">
                        {row.counterparty}
                      </div>
                    )}
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {row.date}
                      </span>
                      {row.categoryName && (
                        <Badge variant="outline" className="text-[10px]">
                          {row.categoryName}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "shrink-0 font-mono text-sm tabular-nums",
                      row.chargedAmount > 0
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-foreground"
                    )}
                  >
                    {currency.format(row.chargedAmount)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function EmptyState({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card py-20 text-center text-sm text-muted-foreground",
        error && "text-destructive"
      )}
    >
      {children}
    </div>
  );
}
