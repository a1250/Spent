"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  Building2,
  ChartNoAxesCombined,
  FileChartColumn,
  ListChecks,
  Upload,
} from "lucide-react";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import {
  getBusinessUnitDashboard,
  getDataQualitySummary,
  getImportHealth,
  getMonthlyCashFlowPreview,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const currency = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const integer = new Intl.NumberFormat("en-US");

export function ReportsHubPage() {
  const dashboardQuery = useQuery({
    queryKey: ["business-unit-dashboard"],
    queryFn: getBusinessUnitDashboard,
  });
  const cashFlowQuery = useQuery({
    queryKey: ["monthly-cash-flow-preview", { mode: "business" }],
    queryFn: () => getMonthlyCashFlowPreview({ mode: "business" }),
  });
  const qualityQuery = useQuery({
    queryKey: ["review-summary"],
    queryFn: getDataQualitySummary,
  });
  const importHealthQuery = useQuery({
    queryKey: ["import-health"],
    queryFn: getImportHealth,
  });

  const dashboard = dashboardQuery.data;
  const quality = qualityQuery.data;
  const latestBatch = importHealthQuery.data?.[0];
  const unknownUnit = dashboard?.units.find(
    (unit) => unit.slug === "unknown"
  );
  const businessInternalMovement =
    cashFlowQuery.data?.scopeSummaries.business.internalMovementTotal;

  return (
    <>
      <PageHeader
        title="Reports"
        meta="Financial previews and data-quality workflows"
        actions={
          <Badge
            variant="outline"
            className="border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300"
          >
            Preview workspace
          </Badge>
        }
      />

      <main className="space-y-6 p-4 md:p-6 lg:p-8">
        <section className="overflow-hidden rounded-2xl border bg-card">
          <div className="grid gap-6 p-5 md:p-6 lg:grid-cols-[1.35fr_1fr] lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Reports index
              </p>
              <h2 className="mt-2 max-w-3xl font-serif text-3xl leading-tight md:text-4xl">
                Follow performance, cash movement, and the work still needed
                to trust both.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                Preview only. Based on classified transactions.
                Needs-review rows are excluded from financial totals.
                Coverage by value/count is shown to indicate reliability.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <ReliabilityMetric
                label="Transactions"
                value={
                  quality
                    ? integer.format(quality.totalTransactions)
                    : "..."
                }
              />
              <ReliabilityMetric
                label="Count coverage"
                value={
                  quality
                    ? `${quality.coverageByCount.toFixed(2)}%`
                    : "..."
                }
                warning={quality?.lowCoverage}
              />
              <ReliabilityMetric
                label="Value coverage"
                value={
                  quality
                    ? `${quality.coverageByValue.toFixed(2)}%`
                    : "..."
                }
              />
            </div>
          </div>
          {quality && (
            <div className="border-t bg-amber-500/[0.045] px-5 py-3 text-sm text-amber-900 dark:text-amber-100 md:px-6">
              <span className="font-medium">
                {integer.format(quality.needsReviewTransactions)} rows need
                review.
              </span>{" "}
              Their {currency.format(quality.unclassifiedValueTotal)} of
              absolute value is not included in financial headlines.
            </div>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <ReportCard
            href="/reports/pl"
            eyebrow="Profitability"
            title="Monthly P&L Preview"
            description="Operating revenue, refunds, expenses, taxes, and uncertain P&L by month."
            icon={FileChartColumn}
            accent="emerald"
            metric={
              dashboard
                ? currency.format(dashboard.summary.businessNetPnL)
                : "Loading..."
            }
            metricLabel="Business Net P&L Preview"
            note={
              quality
                ? `${quality.coverageByValue.toFixed(2)}% value coverage`
                : "Coverage loading"
            }
            warning="Needs-review rows are excluded from financial totals."
            preview
          />

          <ReportCard
            href="/reports/cashflow"
            eyebrow="Cash movement"
            title="Cash Flow Preview"
            description="Operating, investing, and financing cash with internal movement kept separate."
            icon={ChartNoAxesCombined}
            accent="sky"
            metric={
              dashboard
                ? currency.format(dashboard.summary.businessNetCashFlow)
                : "Loading..."
            }
            metricLabel="Business Net Cash Flow Preview"
            note={
              businessInternalMovement != null
                ? `${currency.format(businessInternalMovement)} internal movement excluded`
                : "Internal movement loading"
            }
            warning="Preview only. Based on classified transactions."
            preview
          />

          <ReportCard
            href="/reports/business-units"
            eyebrow="Operating structure"
            title="Business Unit Dashboard"
            description="Compare P&L, cash flow, review exposure, and top transactions across active units."
            icon={Building2}
            accent="teal"
            metric={
              dashboard
                ? integer.format(dashboard.units.length)
                : "Loading..."
            }
            metricLabel="Active business units"
            note={
              unknownUnit
                ? `${integer.format(unknownUnit.quality.needsReviewTransactions)} review rows remain unassigned`
                : "Unknown-unit exposure loading"
            }
            warning="Unknown and shared activity is surfaced separately."
            preview
          />

          <ReportCard
            href="/review"
            eyebrow="Classification workflow"
            title="Needs Review Queue"
            description="Resolve the highest-value unknown transactions and improve report reliability."
            icon={ListChecks}
            accent="amber"
            metric={
              quality
                ? integer.format(quality.needsReviewTransactions)
                : "Loading..."
            }
            metricLabel="Transactions needing review"
            note={
              quality
                ? `${quality.coverageByCount.toFixed(2)}% count / ${quality.coverageByValue.toFixed(2)}% value coverage`
                : "Coverage loading"
            }
            warning="Classifying a row removes it from this queue."
          />

          <ReportCard
            href="/import"
            eyebrow="Import operations"
            title="Import Health"
            description="Inspect the latest staged batch, pending rows, and duplicate-review work."
            icon={Upload}
            accent="violet"
            metric={
              latestBatch
                ? `Batch #${latestBatch.batchId}`
                : importHealthQuery.isLoading
                  ? "Loading..."
                  : "No batches"
            }
            metricLabel={
              latestBatch?.sourceFilename ?? "Latest import status"
            }
            note={
              latestBatch
                ? `${integer.format(latestBatch.pendingDuplicates)} pending duplicates · ${integer.format(latestBatch.importedTransactions)} transactions`
                : "Import a supported file to begin"
            }
            warning={
              latestBatch && latestBatch.pendingDuplicates > 0
                ? "Potential duplicates are retained for review."
                : "No pending duplicate warning."
            }
            className="lg:col-span-2"
          />
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border bg-muted/20 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border bg-background p-2.5">
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <h2 className="font-medium">A read-only reporting surface</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Opening reports does not classify, import, or modify
                transactions.
              </p>
            </div>
          </div>
          <Link
            href="/review"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Improve coverage
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </section>
      </main>
    </>
  );
}

function ReliabilityMetric({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-background/80 px-3 py-4 text-center">
      <div
        className={cn(
          "font-serif text-lg font-semibold tabular-nums md:text-xl",
          warning && "text-amber-700 dark:text-amber-300"
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

const ACCENTS = {
  emerald: {
    icon: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    line: "bg-emerald-500",
  },
  sky: {
    icon: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    line: "bg-sky-500",
  },
  teal: {
    icon: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
    line: "bg-teal-500",
  },
  amber: {
    icon: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    line: "bg-amber-500",
  },
  violet: {
    icon: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    line: "bg-violet-500",
  },
};

function ReportCard({
  href,
  eyebrow,
  title,
  description,
  icon: Icon,
  accent,
  metric,
  metricLabel,
  note,
  warning,
  preview = false,
  className,
}: {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: keyof typeof ACCENTS;
  metric: string;
  metricLabel: string;
  note: string;
  warning: string;
  preview?: boolean;
  className?: string;
}) {
  const colors = ACCENTS[accent];
  return (
    <Link
      href={href}
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-card p-5 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-lg hover:shadow-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <div className={cn("absolute inset-y-0 start-0 w-1", colors.line)} />
      <div className="flex items-start justify-between gap-4">
        <div className={cn("rounded-xl p-2.5", colors.icon)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex items-center gap-2">
          {preview && <Badge variant="outline">Preview</Badge>}
          <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </div>
      </div>

      <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {eyebrow}
      </p>
      <h2 className="mt-1 font-serif text-2xl">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        {description}
      </p>

      <div className="mt-6 border-t pt-4">
        <div className="font-serif text-3xl font-semibold tabular-nums">
          {metric}
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {metricLabel}
        </p>
        <p className="mt-4 text-sm font-medium">{note}</p>
        <p className="mt-1 text-xs text-muted-foreground">{warning}</p>
      </div>
    </Link>
  );
}
