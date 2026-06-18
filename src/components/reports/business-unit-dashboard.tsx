"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  ChevronDown,
  CircleDollarSign,
  FileWarning,
  Landmark,
  RefreshCcw,
  Repeat2,
  UserRound,
} from "lucide-react";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getBusinessUnitDashboard } from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  BusinessUnitDashboard,
  BusinessUnitDashboardRow,
  BusinessUnitDashboardTransaction,
  BusinessUnitWarning,
} from "@/lib/types";

const currency = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const integer = new Intl.NumberFormat("en-US");

const WARNING_LABELS: Record<BusinessUnitWarning, string> = {
  low_coverage: "Low coverage",
  unknown_business_unit: "Unknown business unit",
  shared_not_allocated: "Shared not allocated",
  high_uncertain_pnl: "High uncertain P&L",
  no_classified_rows: "No classified rows",
  needs_review_high_value: "Needs review: high value",
};

const WARNING_STYLES: Record<BusinessUnitWarning, string> = {
  low_coverage:
    "border-amber-500/35 bg-amber-500/8 text-amber-800 dark:text-amber-300",
  unknown_business_unit:
    "border-rose-500/35 bg-rose-500/8 text-rose-800 dark:text-rose-300",
  shared_not_allocated:
    "border-violet-500/35 bg-violet-500/8 text-violet-800 dark:text-violet-300",
  high_uncertain_pnl:
    "border-orange-500/35 bg-orange-500/8 text-orange-800 dark:text-orange-300",
  no_classified_rows:
    "border-border bg-muted/50 text-muted-foreground",
  needs_review_high_value:
    "border-red-500/35 bg-red-500/8 text-red-800 dark:text-red-300",
};

export function BusinessUnitDashboardPage() {
  const [openUnits, setOpenUnits] = useState<Set<string>>(new Set());
  const reportQuery = useQuery({
    queryKey: ["business-unit-dashboard"],
    queryFn: getBusinessUnitDashboard,
  });

  const toggleUnit = (slug: string) => {
    setOpenUnits((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  return (
    <>
      <PageHeader
        title="Business Unit Dashboard"
        meta="Classified performance, cash movement, and review exposure"
        actions={
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href="/reports/pl">P&L Preview</Link>}
            />
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href="/reports/cashflow">Cash Flow</Link>}
            />
            <Badge
              variant="outline"
              className="ms-1 border-teal-500/40 bg-teal-500/5 text-teal-700 dark:text-teal-300"
            >
              Preview
            </Badge>
          </div>
        }
      />

      <main className="space-y-6 p-4 md:p-6 lg:p-8">
        {reportQuery.isLoading && <DashboardSkeleton />}

        {reportQuery.isError && (
          <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
              <div>
                <h2 className="font-medium">Could not load the dashboard</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {reportQuery.error instanceof Error
                    ? reportQuery.error.message
                    : "The report request failed."}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => reportQuery.refetch()}
                >
                  <RefreshCcw className="h-4 w-4" />
                  Try again
                </Button>
              </div>
            </div>
          </section>
        )}

        {reportQuery.data && (
          <>
            <CoverageBanner report={reportQuery.data} />
            <SummaryCards report={reportQuery.data} />

            <section className="overflow-hidden rounded-2xl border bg-card">
              <div className="flex flex-col gap-2 border-b px-5 py-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <h2 className="font-serif text-xl">
                      Unit performance ledger
                    </h2>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Expand a unit to inspect its report bridge, monthly
                    movement, and highest-priority rows.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {reportQuery.data.units.length} active units
                </p>
              </div>

              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/25 hover:bg-muted/25">
                    <TableHead className="min-w-52 ps-5">
                      Business Unit
                    </TableHead>
                    <TableHead className="text-end">Net P&L</TableHead>
                    <TableHead className="text-end">Net Cash Flow</TableHead>
                    <TableHead className="text-end">
                      Internal Movement
                    </TableHead>
                    <TableHead className="text-end">Needs Review</TableHead>
                    <TableHead className="text-end">Value Coverage</TableHead>
                    <TableHead className="text-end">Count Coverage</TableHead>
                    <TableHead className="min-w-52 pe-5">Top Issue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportQuery.data.units.map((unit) => {
                    const isOpen = openUnits.has(unit.slug);
                    return (
                      <UnitRows
                        key={unit.slug}
                        unit={unit}
                        isOpen={isOpen}
                        onToggle={() => toggleUnit(unit.slug)}
                      />
                    );
                  })}
                </TableBody>
              </Table>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function CoverageBanner({ report }: { report: BusinessUnitDashboard }) {
  const coverage = report.coverage;
  return (
    <section className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-amber-500/5">
      <div className="absolute inset-y-0 start-0 w-1 bg-amber-500" />
      <div className="grid gap-5 p-5 ps-6 lg:grid-cols-[1.5fr_1fr] lg:items-center">
        <div>
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <FileWarning className="h-5 w-5" />
            <h2 className="font-medium">
              Preview only: unit results are incomplete
            </h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Preview only. Based on classified transactions.{" "}
            {integer.format(coverage.needsReviewTransactions)} transactions
            still need review.
          </p>
          <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
            Needs-review rows are excluded from financial totals. Coverage by
            value/count is shown to indicate reliability.
          </p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-amber-950/10 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-amber-500"
              style={{ width: `${Math.min(coverage.coverageByValue, 100)}%` }}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <CoverageMetric
            value={integer.format(coverage.totalTransactions)}
            label="Total"
          />
          <CoverageMetric
            value={`${coverage.coverageByCount.toFixed(2)}%`}
            label="Count"
          />
          <CoverageMetric
            value={`${coverage.coverageByValue.toFixed(2)}%`}
            label="Value"
          />
        </div>
      </div>
    </section>
  );
}

function CoverageMetric({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-xl border bg-background/70 px-3 py-3">
      <div className="font-serif text-lg font-semibold tabular-nums">
        {value}
      </div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function SummaryCards({ report }: { report: BusinessUnitDashboard }) {
  const cards = [
    {
      label: "Business Net P&L",
      value: report.summary.businessNetPnL,
      icon: Landmark,
      tone: "text-emerald-700 dark:text-emerald-300",
    },
    {
      label: "Business Cash Flow",
      value: report.summary.businessNetCashFlow,
      icon: CircleDollarSign,
      tone: "text-sky-700 dark:text-sky-300",
    },
    {
      label: "Personal P&L / Cash",
      value: report.summary.personalNetPnL,
      secondary: report.summary.personalNetCashFlow,
      icon: UserRound,
      tone: "text-slate-700 dark:text-slate-300",
    },
    {
      label: "Needs Review",
      count: report.summary.needsReviewTransactions,
      icon: AlertTriangle,
      tone: "text-amber-700 dark:text-amber-300",
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className="relative">
          <CardHeader className="flex-row items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {card.label}
            </span>
            <card.icon className={cn("h-4 w-4", card.tone)} />
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                "font-serif text-2xl font-semibold tabular-nums",
                card.value != null && amountTone(card.value)
              )}
            >
              {card.count != null
                ? integer.format(card.count)
                : currency.format(card.value ?? 0)}
            </div>
            {card.secondary != null && (
              <p className="mt-1 text-xs text-muted-foreground">
                Cash flow{" "}
                <span className={cn("font-medium", amountTone(card.secondary))}>
                  {currency.format(card.secondary)}
                </span>
              </p>
            )}
            {card.count != null && (
              <p className="mt-1 text-xs text-muted-foreground">
                {currency.format(report.coverage.unclassifiedValueTotal)}{" "}
                unclassified value
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function UnitRows({
  unit,
  isOpen,
  onToggle,
}: {
  unit: BusinessUnitDashboardRow;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const primaryWarning = unit.warnings[0];
  return (
    <>
      <TableRow className="group">
        <TableCell className="ps-5">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            className="flex w-full items-center gap-3 rounded-md text-start outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              className="h-8 w-1 shrink-0 rounded-full"
              style={{ backgroundColor: unit.color ?? "#a1a1aa" }}
            />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{unit.label}</span>
              <span className="block text-xs text-muted-foreground">
                {unit.slug}
              </span>
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                isOpen && "rotate-180"
              )}
            />
          </button>
        </TableCell>
        <MoneyCell value={unit.pnl.netPnL} />
        <MoneyCell value={unit.cashFlow.netCashFlow} />
        <TableCell className="text-end tabular-nums text-muted-foreground">
          {currency.format(unit.cashFlow.internalMovementTotal)}
        </TableCell>
        <TableCell className="text-end">
          <span
            className={cn(
              "font-medium tabular-nums",
              unit.quality.needsReviewTransactions > 0 &&
                "text-amber-700 dark:text-amber-300"
            )}
          >
            {integer.format(unit.quality.needsReviewTransactions)}
          </span>
        </TableCell>
        <TableCell className="text-end tabular-nums">
          {unit.quality.coverageByValue.toFixed(2)}%
        </TableCell>
        <TableCell className="text-end tabular-nums">
          {unit.quality.coverageByCount.toFixed(2)}%
        </TableCell>
        <TableCell className="pe-5">
          {primaryWarning ? (
            <WarningBadge warning={primaryWarning} />
          ) : (
            <Badge
              variant="outline"
              className="border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
            >
              No immediate warning
            </Badge>
          )}
        </TableCell>
      </TableRow>

      {isOpen && (
        <TableRow className="bg-muted/15 hover:bg-muted/15">
          <TableCell colSpan={8} className="whitespace-normal p-0">
            <UnitDetails unit={unit} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function MoneyCell({ value }: { value: number }) {
  return (
    <TableCell className={cn("text-end font-medium tabular-nums", amountTone(value))}>
      {currency.format(value)}
    </TableCell>
  );
}

function UnitDetails({ unit }: { unit: BusinessUnitDashboardRow }) {
  return (
    <div className="space-y-5 px-5 py-5 lg:px-7">
      <div className="flex flex-wrap items-center gap-2">
        {unit.warnings.length > 0 ? (
          unit.warnings.map((warning) => (
            <WarningBadge key={warning} warning={warning} />
          ))
        ) : (
          <Badge
            variant="outline"
            className="border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
          >
            No immediate warning
          </Badge>
        )}
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          className="ms-auto gap-1.5 text-xs text-muted-foreground"
          render={
            <Link href={`/transactions?businessUnit=${unit.slug}`}>
              View all transactions
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          }
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <MetricPanel
          title="P&L Preview"
          icon={Landmark}
          rows={[
            ["Revenue", unit.pnl.operatingRevenue],
            ["Refunds / adjustments", unit.pnl.refunds],
            ["Operating expenses", -unit.pnl.operatingExpenses],
            ["Taxes", -unit.pnl.taxes],
            ["Net P&L", unit.pnl.netPnL],
            ["Uncertain P&L", unit.pnl.uncertainPnL],
          ]}
          emphasizedIndex={4}
        />
        <MetricPanel
          title="Cash Flow Preview"
          icon={CircleDollarSign}
          rows={[
            ["Operating", unit.cashFlow.netOperating],
            ["Investing", unit.cashFlow.netInvesting],
            ["Financing", unit.cashFlow.netFinancing],
            ["Internal / working capital", unit.cashFlow.internalNet],
            ["Headline net cash flow", unit.cashFlow.netCashFlow],
          ]}
          emphasizedIndex={4}
        />
        <QualityPanel unit={unit} />
      </div>

      <MonthlyMiniTable unit={unit} />

      <div className="grid gap-4 xl:grid-cols-3">
        <TopTransactionList
          title="Top included income"
          icon={ArrowUpRight}
          rows={unit.topIncome}
          empty="No included income rows."
        />
        <TopTransactionList
          title="Top included expenses"
          icon={ArrowDownRight}
          rows={unit.topExpenses}
          empty="No included expense rows."
        />
        <TopTransactionList
          title="Top needs review"
          icon={AlertTriangle}
          rows={unit.topNeedsReview}
          empty="No transactions need review."
        />
      </div>
    </div>
  );
}

function MetricPanel({
  title,
  icon: Icon,
  rows,
  emphasizedIndex,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  rows: Array<[string, number]>;
  emphasizedIndex: number;
}) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-medium">{title}</h3>
      </div>
      <dl className="space-y-2">
        {rows.map(([label, value], index) => (
          <div
            key={label}
            className={cn(
              "flex items-center justify-between gap-4 text-sm",
              index === emphasizedIndex &&
                "mt-3 border-t pt-3 font-medium"
            )}
          >
            <dt className="text-muted-foreground">{label}</dt>
            <dd className={cn("tabular-nums", amountTone(value))}>
              {currency.format(value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function QualityPanel({ unit }: { unit: BusinessUnitDashboardRow }) {
  const quality = unit.quality;
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <FileWarning className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-medium">Data Quality</h3>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <CoverageMetric
          value={integer.format(quality.totalTransactions)}
          label="Total"
        />
        <CoverageMetric
          value={integer.format(quality.classifiedTransactions)}
          label="Classified"
        />
        <CoverageMetric
          value={integer.format(quality.needsReviewTransactions)}
          label="Review"
        />
      </div>
      <div className="mt-4 space-y-3">
        <CoverageBar label="Value coverage" value={quality.coverageByValue} />
        <CoverageBar label="Count coverage" value={quality.coverageByCount} />
      </div>
      <div className="mt-4 flex items-center justify-between border-t pt-3 text-sm">
        <span className="text-muted-foreground">Unclassified value</span>
        <span className="font-medium tabular-nums text-amber-700 dark:text-amber-300">
          {currency.format(quality.unclassifiedValueTotal)}
        </span>
      </div>
    </div>
  );
}

function CoverageBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{value.toFixed(2)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            value >= 80
              ? "bg-emerald-500"
              : value >= 40
                ? "bg-amber-500"
                : "bg-rose-500"
          )}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}

function MonthlyMiniTable({ unit }: { unit: BusinessUnitDashboardRow }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-background">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Repeat2 className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-medium">Monthly mini breakdown</h3>
      </div>
      {unit.months.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          No transaction activity for this unit.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/20 hover:bg-muted/20">
              <TableHead className="ps-4">Month</TableHead>
              <TableHead className="text-end">Net P&L</TableHead>
              <TableHead className="text-end">Uncertain</TableHead>
              <TableHead className="text-end">Net Cash Flow</TableHead>
              <TableHead className="text-end">Internal</TableHead>
              <TableHead className="text-end">Needs Review</TableHead>
              <TableHead className="text-end">Value Coverage</TableHead>
              <TableHead className="pe-4 text-end">Count Coverage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {unit.months.map((month) => (
              <TableRow key={month.month}>
                <TableCell className="ps-4 font-medium">
                  {formatMonth(month.month)}
                </TableCell>
                <MoneyCell value={month.netPnL} />
                <MoneyCell value={month.uncertainPnL} />
                <MoneyCell value={month.netCashFlow} />
                <TableCell className="text-end tabular-nums text-muted-foreground">
                  {currency.format(month.internalMovementTotal)}
                </TableCell>
                <TableCell className="text-end tabular-nums">
                  {integer.format(month.needsReviewTransactions)}
                </TableCell>
                <TableCell className="text-end tabular-nums">
                  {month.coverageByValue.toFixed(2)}%
                </TableCell>
                <TableCell className="pe-4 text-end tabular-nums">
                  {month.coverageByCount.toFixed(2)}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function TopTransactionList({
  title,
  icon: Icon,
  rows,
  empty,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  rows: BusinessUnitDashboardTransaction[];
  empty: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-background">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-medium">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="divide-y">
          {rows.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {row.counterparty || row.description}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {row.date} · {row.categoryName ?? "Uncategorized"} · tx{" "}
                  {row.id}
                </p>
              </div>
              <span
                className={cn(
                  "text-sm font-medium tabular-nums",
                  amountTone(row.amount)
                )}
              >
                {currency.format(row.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WarningBadge({ warning }: { warning: BusinessUnitWarning }) {
  return (
    <Badge
      variant="outline"
      className={cn("font-normal", WARNING_STYLES[warning])}
    >
      {WARNING_LABELS[warning]}
    </Badge>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-36 animate-pulse rounded-2xl bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-xl bg-muted"
          />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function amountTone(value: number): string {
  if (value > 0) return "text-emerald-700 dark:text-emerald-300";
  if (value < 0) return "text-rose-700 dark:text-rose-300";
  return "text-foreground";
}

function formatMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}
