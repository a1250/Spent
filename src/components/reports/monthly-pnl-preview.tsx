"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
  FileWarning,
  Landmark,
  RefreshCcw,
  SlidersHorizontal,
} from "lucide-react";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getMonthlyPnLPreview, listBusinessUnits } from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  MonthlyPnLDetail,
  MonthlyPnLPreview,
  MonthlyPnLRow,
  PnLDetailSection,
} from "@/lib/types";

const currency = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const SECTION_LABELS: Record<PnLDetailSection, string> = {
  operating_revenue: "Operating Revenue",
  refunds: "Adjustments / Refunds",
  operating_expenses: "Operating Expenses",
  taxes: "Taxes included in P&L",
  uncertain: "Uncertain P&L",
};

export function MonthlyPnLPreviewPage() {
  const [fromMonth, setFromMonth] = useState("");
  const [toMonth, setToMonth] = useState("");
  const [businessUnit, setBusinessUnit] = useState("all");
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());

  const queryParams = useMemo(
    () => ({
      fromMonth: fromMonth || undefined,
      toMonth: toMonth || undefined,
      businessUnit: businessUnit === "all" ? undefined : businessUnit,
    }),
    [businessUnit, fromMonth, toMonth]
  );
  const reportQuery = useQuery({
    queryKey: ["monthly-pnl-preview", queryParams],
    queryFn: () => getMonthlyPnLPreview(queryParams),
  });
  const businessUnitsQuery = useQuery({
    queryKey: ["business-units"],
    queryFn: listBusinessUnits,
  });

  const report = reportQuery.data;
  const resetFilters = () => {
    setFromMonth("");
    setToMonth("");
    setBusinessUnit("all");
  };
  const toggleMonth = (month: string) => {
    setOpenMonths((current) => {
      const next = new Set(current);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      return next;
    });
  };

  return (
    <>
      <PageHeader
        title="Monthly P&L Preview"
        meta="Classified transactions only"
        actions={
          <Badge
            variant="outline"
            className="border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300"
          >
            Preview
          </Badge>
        }
      />

      <main className="space-y-6 p-4 md:p-6 lg:p-8">
        {report && <PreviewWarning report={report} />}

        <section className="rounded-2xl border bg-card p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            <div className="flex items-center gap-2 lg:me-2">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              <div>
                <h2 className="text-sm font-medium">Report filters</h2>
                <p className="text-xs text-muted-foreground">
                  Status is fixed to manually approved + auto classified.
                </p>
              </div>
            </div>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>From month</span>
              <Input
                type="month"
                value={fromMonth}
                min={report?.availableRange.fromMonth ?? undefined}
                max={
                  toMonth || (report?.availableRange.toMonth ?? undefined)
                }
                onChange={(event) => setFromMonth(event.target.value)}
                className="w-44 text-foreground"
              />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>To month</span>
              <Input
                type="month"
                value={toMonth}
                min={
                  fromMonth || (report?.availableRange.fromMonth ?? undefined)
                }
                max={report?.availableRange.toMonth ?? undefined}
                onChange={(event) => setToMonth(event.target.value)}
                className="w-44 text-foreground"
              />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Business unit</span>
              <Select
                value={businessUnit}
                onValueChange={(value) => {
                  if (value) setBusinessUnit(value);
                }}
              >
                <SelectTrigger className="h-9 w-48 text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All business units</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {(businessUnitsQuery.data ?? []).map((unit) => (
                    <SelectItem key={unit.slug} value={unit.slug}>
                      {unit.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <Button
              variant="ghost"
              size="sm"
              className="lg:ms-auto"
              onClick={resetFilters}
              disabled={
                !fromMonth && !toMonth && businessUnit === "all"
              }
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          </div>
        </section>

        {reportQuery.isLoading && (
          <ReportState>Calculating the classified preview…</ReportState>
        )}
        {reportQuery.isError && (
          <ReportState error>
            The P&L preview could not be loaded.
          </ReportState>
        )}

        {report && (
          <>
            <SummaryCards report={report} />
            <MonthlyTable
              months={report.months}
              openMonths={openMonths}
              onToggle={toggleMonth}
            />
            <ExcludedSummary report={report} />
          </>
        )}
      </main>
    </>
  );
}

function PreviewWarning({ report }: { report: MonthlyPnLPreview }) {
  const summary = report.coverage;
  const metrics = [
    ["Total transactions", summary.totalTransactions],
    ["Classified", summary.classifiedTransactions],
    ["Needs review", summary.needsReviewTransactions],
    ["Coverage by count", `${summary.coverageByCount.toFixed(2)}%`],
    ["Coverage by value", `${summary.coverageByValue.toFixed(2)}%`],
    ["Unclassified value", currency.format(summary.unclassifiedValueTotal)],
    ["Unclassified income", currency.format(summary.unclassifiedIncomeValue)],
    ["Unclassified expense", currency.format(summary.unclassifiedExpenseValue)],
  ] as const;

  return (
    <section className="overflow-hidden rounded-2xl border border-amber-500/50 bg-amber-500/[0.06]">
      <div className="flex flex-col gap-4 border-b border-amber-500/20 p-5 lg:flex-row lg:items-start">
        <div className="flex min-w-0 gap-3">
          <div className="rounded-xl bg-amber-500/15 p-2.5">
            <AlertTriangle className="h-5 w-5 text-amber-700 dark:text-amber-300" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-800/70 dark:text-amber-200/70">
              Low-confidence financial preview
            </p>
            <h2 className="mt-1 max-w-4xl font-serif text-xl leading-snug text-amber-950 dark:text-amber-100">
              Preview only: this report is based on classified transactions.
              There are still{" "}
              {summary.needsReviewTransactions.toLocaleString("en-US")}{" "}
              transactions needing review.
            </h2>
            <p className="mt-2 text-sm text-amber-900/75 dark:text-amber-100/70">
              Headline P&L excludes every needs-review, uncertain, transfer,
              investment, financing, and working-capital row.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          className="border-amber-600/30 bg-background/70 lg:ms-auto"
          render={
            <Link href="/review">
              Continue classification
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          }
        />
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-amber-500/15 sm:grid-cols-4 lg:grid-cols-8 lg:divide-y-0">
        {metrics.map(([label, value]) => (
          <div key={label} className="px-4 py-3">
            <div className="font-mono text-base font-semibold tabular-nums">
              {typeof value === "number"
                ? value.toLocaleString("en-US")
                : value}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SummaryCards({ report }: { report: MonthlyPnLPreview }) {
  const items = [
    {
      label: "Operating Revenue",
      value: report.totals.operatingRevenue,
      tone: "text-emerald-700 dark:text-emerald-300",
    },
    {
      label: "Adjustments / Refunds",
      value: report.totals.refunds,
      tone: "text-sky-700 dark:text-sky-300",
    },
    {
      label: "Operating Expenses",
      value: report.totals.operatingExpenses,
      tone: "",
    },
    {
      label: "Taxes in P&L",
      value: report.totals.taxes,
      tone: "",
    },
    {
      label: "Net P&L Preview",
      value: report.totals.netPnL,
      tone:
        report.totals.netPnL >= 0
          ? "text-emerald-700 dark:text-emerald-300"
          : "text-red-700 dark:text-red-300",
      featured: true,
    },
    {
      label: "Uncertain P&L",
      value: report.totals.uncertainPnL,
      tone: "text-amber-700 dark:text-amber-300",
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            "rounded-2xl border bg-card p-4",
            item.featured && "border-foreground/25 bg-foreground/[0.025]"
          )}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {item.label}
          </div>
          <div
            className={cn(
              "mt-3 font-serif text-2xl tabular-nums",
              item.tone
            )}
          >
            {currency.format(item.value)}
          </div>
        </div>
      ))}
    </section>
  );
}

function MonthlyTable({
  months,
  openMonths,
  onToggle,
}: {
  months: MonthlyPnLRow[];
  openMonths: Set<string>;
  onToggle: (month: string) => void;
}) {
  if (months.length === 0) {
    return <ReportState>No transactions match these filters.</ReportState>;
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-serif text-xl">Monthly preview</h2>
        <p className="text-sm text-muted-foreground">
          Expand a month to inspect server-aggregated category groups.
        </p>
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[1240px] text-sm">
          <thead>
            <tr className="border-b bg-muted/35 text-xs text-muted-foreground">
              <th className="w-10 px-3 py-3" />
              <th className="px-3 py-3 text-start font-medium">Month</th>
              <th className="px-3 py-3 text-end font-medium">Revenue</th>
              <th className="px-3 py-3 text-end font-medium">
                Refunds / Adjustments
              </th>
              <th className="px-3 py-3 text-end font-medium">
                Operating Expenses
              </th>
              <th className="px-3 py-3 text-end font-medium">Taxes</th>
              <th className="px-3 py-3 text-end font-medium">
                Net P&L Preview
              </th>
              <th className="px-3 py-3 text-end font-medium">
                Uncertain P&L
              </th>
              <th className="px-3 py-3 text-center font-medium">
                Value coverage
              </th>
              <th className="px-3 py-3 text-center font-medium">
                Needs review
              </th>
            </tr>
          </thead>
          <tbody>
            {months.map((month) => {
              const isOpen = openMonths.has(month.month);
              return (
                <MonthRows
                  key={month.month}
                  month={month}
                  isOpen={isOpen}
                  onToggle={() => onToggle(month.month)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MonthRows({
  month,
  isOpen,
  onToggle,
}: {
  month: MonthlyPnLRow;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-b hover:bg-muted/20">
        <td colSpan={2} className="p-0">
          <button
            type="button"
            aria-expanded={isOpen}
            className="flex w-full items-center gap-3 px-3 py-3 text-start font-medium"
            onClick={onToggle}
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                isOpen && "rotate-180"
              )}
            />
            {formatMonth(month.month)}
          </button>
        </td>
        <MoneyCell value={month.operatingRevenue} positive />
        <MoneyCell value={month.refunds} />
        <MoneyCell value={month.operatingExpenses} />
        <MoneyCell value={month.taxes} />
        <MoneyCell value={month.netPnL} net />
        <MoneyCell value={month.uncertainPnL} uncertain />
        <td className="px-3 py-3 text-center">
          <Badge
            variant="outline"
            className={
              month.classifiedValueCoverage >= 70
                ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                : "border-amber-500/30 text-amber-700 dark:text-amber-300"
            }
          >
            {month.classifiedValueCoverage.toFixed(1)}%
          </Badge>
        </td>
        <td className="px-3 py-3 text-center font-mono tabular-nums">
          {month.needsReviewCount.toLocaleString("en-US")}
        </td>
      </tr>
      {isOpen && (
        <tr className="border-b bg-muted/[0.12]">
          <td colSpan={10} className="p-0">
            <MonthDetails month={month} />
          </td>
        </tr>
      )}
    </>
  );
}

function MonthDetails({ month }: { month: MonthlyPnLRow }) {
  const sections = Object.keys(SECTION_LABELS) as PnLDetailSection[];

  return (
    <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-5">
        {sections.map((section) => {
          const details = month.details.filter(
            (detail) => detail.section === section
          );
          if (details.length === 0) return null;
          return (
            <DetailSection key={section} section={section} details={details} />
          );
        })}
        {month.details.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No classified P&L details in this month.
          </p>
        )}
      </div>
      <div>
        <div className="rounded-xl border bg-background/70 p-4">
          <div className="flex items-center gap-2">
            <FileWarning className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Excluded / Not P&L</h3>
          </div>
          <div className="mt-4 space-y-3">
            <ExcludedLine
              label="Internal transfers"
              value={month.excluded.internalTransfers}
            />
            <ExcludedLine
              label="Investments"
              value={month.excluded.investments}
            />
            <ExcludedLine
              label="Working capital"
              value={month.excluded.workingCapital}
            />
            <ExcludedLine
              label="Owner deposits / draws"
              value={month.excluded.ownerMovements}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailSection({
  section,
  details,
}: {
  section: PnLDetailSection;
  details: MonthlyPnLDetail[];
}) {
  return (
    <div>
      <h3
        className={cn(
          "mb-2 text-xs font-semibold uppercase tracking-[0.08em]",
          section === "uncertain"
            ? "text-amber-700 dark:text-amber-300"
            : "text-muted-foreground"
        )}
      >
        {SECTION_LABELS[section]}
      </h3>
      <div className="overflow-hidden rounded-xl border bg-background/70">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="px-3 py-2 text-start font-medium">Group</th>
              <th className="px-3 py-2 text-start font-medium">Category</th>
              <th className="px-3 py-2 text-center font-medium">Count</th>
              <th className="px-3 py-2 text-end font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {details.map((detail) => (
              <tr
                key={`${section}-${detail.groupName}-${detail.categoryName}`}
                className="border-b last:border-0"
              >
                <td className="px-3 py-2 text-muted-foreground">
                  {detail.groupName}
                </td>
                <td className="px-3 py-2 font-medium">
                  {detail.categoryName}
                </td>
                <td className="px-3 py-2 text-center font-mono tabular-nums">
                  {detail.transactionCount}
                </td>
                <td className="px-3 py-2 text-end font-mono tabular-nums">
                  {currency.format(detail.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExcludedSummary({ report }: { report: MonthlyPnLPreview }) {
  const items = [
    ["Internal transfers", report.excluded.internalTransfers],
    ["Investments", report.excluded.investments],
    ["Working capital", report.excluded.workingCapital],
    ["Owner deposits / draws", report.excluded.ownerMovements],
  ] as const;

  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-muted p-2.5">
          <Landmark className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="font-serif text-xl">Excluded / Not P&L summary</h2>
          <p className="text-sm text-muted-foreground">
            Classified balance-sheet movements shown for transparency. None are
            included in headline Net P&L.
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-muted/15 p-4">
            <div className="font-mono text-xl font-semibold tabular-nums">
              {currency.format(value)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MoneyCell({
  value,
  positive = false,
  net = false,
  uncertain = false,
}: {
  value: number;
  positive?: boolean;
  net?: boolean;
  uncertain?: boolean;
}) {
  return (
    <td
      className={cn(
        "px-3 py-3 text-end font-mono tabular-nums",
        positive && value > 0 && "text-emerald-700 dark:text-emerald-300",
        net &&
          (value >= 0
            ? "font-semibold text-emerald-700 dark:text-emerald-300"
            : "font-semibold text-red-700 dark:text-red-300"),
        uncertain && value !== 0 && "text-amber-700 dark:text-amber-300"
      )}
    >
      {currency.format(value)}
    </td>
  );
}

function ExcludedLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-sm font-medium tabular-nums">
        {currency.format(value)}
      </span>
    </div>
  );
}

function ReportState({
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

function formatMonth(month: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}
