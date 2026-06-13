"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  CircleDollarSign,
  RefreshCcw,
  Repeat2,
  SlidersHorizontal,
  Users,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getMonthlyCashFlowPreview, listBusinessUnits } from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  CashFlowSection,
  MonthlyCashFlowDetail,
  MonthlyCashFlowPreview,
  MonthlyCashFlowRow,
  PnLReportMode,
} from "@/lib/types";

const currency = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const MODE_LABELS: Record<PnLReportMode, string> = {
  business: "Business Only",
  personal: "Personal Only",
  all: "All Units",
};

const SECTION_LABELS: Record<CashFlowSection, string> = {
  operating: "Operating Cash Flow",
  investing: "Investing Cash Flow",
  financing: "Financing Cash Flow",
  internal: "Internal / Working Capital",
};

export function MonthlyCashFlowPreviewPage() {
  const [mode, setMode] = useState<PnLReportMode>("business");
  const [fromMonth, setFromMonth] = useState("");
  const [toMonth, setToMonth] = useState("");
  const [businessUnit, setBusinessUnit] = useState("all");
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());

  const queryParams = useMemo(
    () => ({
      fromMonth: fromMonth || undefined,
      toMonth: toMonth || undefined,
      businessUnit: businessUnit === "all" ? undefined : businessUnit,
      mode,
    }),
    [businessUnit, fromMonth, mode, toMonth]
  );
  const reportQuery = useQuery({
    queryKey: ["monthly-cash-flow-preview", queryParams],
    queryFn: () => getMonthlyCashFlowPreview(queryParams),
  });
  const businessUnitsQuery = useQuery({
    queryKey: ["business-units"],
    queryFn: listBusinessUnits,
  });

  const report = reportQuery.data;
  const availableBusinessUnits = useMemo(() => {
    const units = businessUnitsQuery.data ?? [];
    if (mode === "business") {
      return units.filter(
        (unit) =>
          !["personal", "unknown", "shared"].includes(unit.slug)
      );
    }
    if (mode === "all") {
      return units.filter((unit) => unit.slug !== "unknown");
    }
    return units.filter((unit) => unit.slug === "personal");
  }, [businessUnitsQuery.data, mode]);

  const changeMode = (nextMode: string | number) => {
    if (
      nextMode === "business" ||
      nextMode === "personal" ||
      nextMode === "all"
    ) {
      setMode(nextMode);
      setBusinessUnit("all");
      setOpenMonths(new Set());
    }
  };
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
        title="Cash Flow Preview"
        meta="Classified cash movements only"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href="/reports/pl">P&L Preview</Link>}
            />
            <Badge
              variant="outline"
              className="border-sky-500/40 bg-sky-500/5 text-sky-700 dark:text-sky-300"
            >
              Preview
            </Badge>
          </div>
        }
      />

      <main className="space-y-6 p-4 md:p-6 lg:p-8">
        <section className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-serif text-xl">Report view</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Follow real cash movement without mixing personal activity
                into business performance.
              </p>
            </div>
            <Tabs value={mode} onValueChange={changeMode}>
              <TabsList className="grid w-full grid-cols-3 lg:w-[460px]">
                <TabsTrigger value="business">Business Only</TabsTrigger>
                <TabsTrigger value="personal">Personal Only</TabsTrigger>
                <TabsTrigger value="all">All Units</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {report && <ScopeSummaryCards report={report} mode={mode} />}
        </section>

        {report && <CoverageWarning report={report} mode={mode} />}

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
                value={mode === "personal" ? "personal" : businessUnit}
                onValueChange={(value) => {
                  if (value) setBusinessUnit(value);
                }}
                disabled={mode === "personal"}
              >
                <SelectTrigger className="h-9 w-48 text-foreground">
                  <SelectValue>
                    {(value: string) => {
                      if (value === "all") {
                        return mode === "business"
                          ? "All business units"
                          : "All units";
                      }
                      if (value === "unassigned") {
                        return "Unassigned / unknown";
                      }
                      return (
                        availableBusinessUnits.find(
                          (unit) => unit.slug === value
                        )?.label ?? value
                      );
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {mode !== "personal" && (
                    <SelectItem value="all">
                      {mode === "business"
                        ? "All business units"
                        : "All units"}
                    </SelectItem>
                  )}
                  {mode === "all" && (
                    <SelectItem value="unassigned">
                      Unassigned / unknown
                    </SelectItem>
                  )}
                  {availableBusinessUnits.map((unit) => (
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
          <ReportState>Tracing classified cash movements…</ReportState>
        )}
        {reportQuery.isError && (
          <ReportState error>
            The cash flow preview could not be loaded.
          </ReportState>
        )}

        {report && (
          <>
            <FlowSummaryCards report={report} />
            <MonthlyTable
              months={report.months}
              mode={report.filters.mode}
              openMonths={openMonths}
              onToggle={toggleMonth}
            />
            <InternalMovementSummary report={report} />
          </>
        )}
      </main>
    </>
  );
}

function ScopeSummaryCards({
  report,
  mode,
}: {
  report: MonthlyCashFlowPreview;
  mode: PnLReportMode;
}) {
  const cards = [
    {
      mode: "business" as const,
      label: "Business Cash Flow Preview",
      summary: report.scopeSummaries.business,
    },
    {
      mode: "personal" as const,
      label: "Personal Cash Flow Preview",
      summary: report.scopeSummaries.personal,
    },
    {
      mode: "all" as const,
      label: "All Units Cash Flow Preview",
      summary: report.scopeSummaries.all,
    },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.mode}
          className={cn(
            "rounded-2xl border bg-card p-4 transition-colors",
            card.mode === mode &&
              "border-foreground/30 bg-foreground/[0.035]"
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {card.label}
            </span>
            {card.mode === mode && (
              <Badge variant="outline">Selected</Badge>
            )}
          </div>
          <div
            className={cn(
              "mt-3 font-serif text-3xl tabular-nums",
              card.summary.netCashFlow >= 0
                ? "text-emerald-700 dark:text-emerald-300"
                : "text-red-700 dark:text-red-300"
            )}
          >
            {currency.format(card.summary.netCashFlow)}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Excludes{" "}
            {currency.format(card.summary.internalMovementTotal)} of internal
            movement
          </p>
        </div>
      ))}
    </div>
  );
}

function CoverageWarning({
  report,
  mode,
}: {
  report: MonthlyCashFlowPreview;
  mode: PnLReportMode;
}) {
  const summary = report.coverage;
  const hasUnassignedRows =
    report.scopeSummaries.unknown.transactionCount > 0 ||
    report.scopeSummaries.shared.transactionCount > 0;
  const metrics = [
    ["Total transactions", summary.totalTransactions],
    ["Classified", summary.classifiedTransactions],
    ["Needs review", summary.needsReviewTransactions],
    ["Coverage by count", `${summary.coverageByCount.toFixed(2)}%`],
    ["Coverage by value", `${summary.coverageByValue.toFixed(2)}%`],
    ["Unclassified value", currency.format(summary.unclassifiedValueTotal)],
  ] as const;

  return (
    <section className="overflow-hidden rounded-2xl border border-sky-500/45 bg-sky-500/[0.055]">
      <div className="flex flex-col gap-4 border-b border-sky-500/20 p-5 lg:flex-row lg:items-start">
        <div className="flex min-w-0 gap-3">
          <div className="rounded-xl bg-sky-500/15 p-2.5">
            <AlertTriangle className="h-5 w-5 text-sky-700 dark:text-sky-300" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-800/70 dark:text-sky-200/70">
              Classified cash flow preview
            </p>
            <h2 className="mt-1 max-w-4xl font-serif text-xl leading-snug text-sky-950 dark:text-sky-100">
              Preview only: {summary.needsReviewTransactions.toLocaleString(
                "en-US"
              )}{" "}
              transactions still need review and are excluded.
            </h2>
            <p className="mt-2 text-sm text-sky-900/75 dark:text-sky-100/70">
              Net Cash Flow includes operating, investing, and financing cash.
              Internal transfers are displayed separately and never inflate
              the headline.
            </p>
            {mode === "all" && (
              <p className="mt-3 rounded-lg border border-sky-600/20 bg-background/55 px-3 py-2 text-sm font-medium text-sky-950 dark:text-sky-100">
                This view mixes business and personal cash activity. Use
                Business Only for business cash performance.
              </p>
            )}
            {mode === "business" && hasUnassignedRows && (
              <p className="mt-3 rounded-lg border border-sky-600/20 bg-background/55 px-3 py-2 text-sm font-medium text-sky-950 dark:text-sky-100">
                Some classified rows are unknown/shared and are excluded from
                this business view.
              </p>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          className="border-sky-600/30 bg-background/70 lg:ms-auto"
          render={
            <Link href="/review">
              Continue classification
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          }
        />
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-sky-500/15 sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
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

function FlowSummaryCards({
  report,
}: {
  report: MonthlyCashFlowPreview;
}) {
  const items = [
    {
      label: "Operating Cash Flow",
      value: report.totals.netOperating,
      note: `${currency.format(report.totals.operatingIn)} in · ${currency.format(report.totals.operatingOut)} out`,
    },
    {
      label: "Investing Cash Flow",
      value: report.totals.netInvesting,
      note: `${currency.format(report.totals.investingIn)} in · ${currency.format(report.totals.investingOut)} out`,
    },
    {
      label: "Financing Cash Flow",
      value: report.totals.netFinancing,
      note: `${currency.format(report.totals.financingIn)} in · ${currency.format(report.totals.financingOut)} out`,
    },
    {
      label: "Net Cash Flow",
      value: report.totals.netCashFlow,
      note: "Excludes internal movement",
      featured: true,
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
              "mt-3 font-serif text-3xl tabular-nums",
              item.value >= 0
                ? "text-emerald-700 dark:text-emerald-300"
                : "text-red-700 dark:text-red-300"
            )}
          >
            {currency.format(item.value)}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
        </div>
      ))}
    </section>
  );
}

function MonthlyTable({
  months,
  mode,
  openMonths,
  onToggle,
}: {
  months: MonthlyCashFlowRow[];
  mode: PnLReportMode;
  openMonths: Set<string>;
  onToggle: (month: string) => void;
}) {
  if (months.length === 0) {
    return <ReportState>No cash movements match these filters.</ReportState>;
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-serif text-xl">
          {MODE_LABELS[mode]} monthly cash flow
        </h2>
        <p className="text-sm text-muted-foreground">
          Internal movement is visible but excluded from Net Cash Flow.
        </p>
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[1700px] text-sm">
          <thead>
            <tr className="border-b bg-muted/35 text-xs text-muted-foreground">
              <th className="px-3 py-3 text-start font-medium">Month</th>
              <th className="px-3 py-3 text-end font-medium">Operating In</th>
              <th className="px-3 py-3 text-end font-medium">Operating Out</th>
              <th className="px-3 py-3 text-end font-medium">Net Operating</th>
              <th className="px-3 py-3 text-end font-medium">Investing In</th>
              <th className="px-3 py-3 text-end font-medium">Investing Out</th>
              <th className="px-3 py-3 text-end font-medium">Net Investing</th>
              <th className="px-3 py-3 text-end font-medium">Financing In</th>
              <th className="px-3 py-3 text-end font-medium">Financing Out</th>
              <th className="px-3 py-3 text-end font-medium">Net Financing</th>
              <th className="px-3 py-3 text-end font-medium">Internal In</th>
              <th className="px-3 py-3 text-end font-medium">Internal Out</th>
              <th className="px-3 py-3 text-end font-medium">
                Internal Movement
              </th>
              <th className="px-3 py-3 text-end font-medium">Net Cash Flow</th>
            </tr>
          </thead>
          <tbody>
            {months.map((month) => (
              <MonthRows
                key={month.month}
                month={month}
                isOpen={openMonths.has(month.month)}
                onToggle={() => onToggle(month.month)}
              />
            ))}
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
  month: MonthlyCashFlowRow;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-b hover:bg-muted/20">
        <td className="p-0">
          <button
            type="button"
            aria-expanded={isOpen}
            className="flex w-full min-w-44 items-center gap-3 px-3 py-3 text-start font-medium"
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
        <MoneyCell value={month.operatingIn} inflow />
        <MoneyCell value={month.operatingOut} />
        <MoneyCell value={month.netOperating} net />
        <MoneyCell value={month.investingIn} inflow />
        <MoneyCell value={month.investingOut} />
        <MoneyCell value={month.netInvesting} net />
        <MoneyCell value={month.financingIn} inflow />
        <MoneyCell value={month.financingOut} />
        <MoneyCell value={month.netFinancing} net />
        <MoneyCell value={month.internalIn} internal />
        <MoneyCell value={month.internalOut} internal />
        <MoneyCell value={month.internalMovementTotal} internal />
        <MoneyCell value={month.netCashFlow} net featured />
      </tr>
      {isOpen && (
        <tr className="border-b bg-muted/[0.12]">
          <td colSpan={14} className="p-0">
            <MonthDetails month={month} />
          </td>
        </tr>
      )}
    </>
  );
}

function MonthDetails({ month }: { month: MonthlyCashFlowRow }) {
  const sections: CashFlowSection[] = [
    "operating",
    "investing",
    "financing",
    "internal",
  ];

  return (
    <div className="space-y-5 p-5">
      {sections.map((section) => {
        const details = month.details.filter(
          (detail) => detail.section === section
        );
        if (details.length === 0) return null;
        return (
          <DetailSection key={section} section={section} details={details} />
        );
      })}
    </div>
  );
}

function DetailSection({
  section,
  details,
}: {
  section: CashFlowSection;
  details: MonthlyCashFlowDetail[];
}) {
  return (
    <div>
      <h3
        className={cn(
          "mb-2 text-xs font-semibold uppercase tracking-[0.08em]",
          section === "internal"
            ? "text-sky-700 dark:text-sky-300"
            : "text-muted-foreground"
        )}
      >
        {SECTION_LABELS[section]}
      </h3>
      <div className="overflow-hidden rounded-xl border bg-background/70">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="px-3 py-2 text-start font-medium">Section</th>
              <th className="px-3 py-2 text-start font-medium">
                Financial nature
              </th>
              <th className="px-3 py-2 text-start font-medium">Category</th>
              <th className="px-3 py-2 text-start font-medium">
                Business unit
              </th>
              <th className="px-3 py-2 text-center font-medium">Tx count</th>
              <th className="px-3 py-2 text-end font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {details.map((detail) => (
              <tr
                key={`${section}-${detail.financialNature}-${detail.categoryName}-${detail.businessUnit}`}
                className="border-b last:border-0"
              >
                <td className="px-3 py-2 text-muted-foreground">
                  {SECTION_LABELS[section]}
                </td>
                <td className="px-3 py-2 font-medium">
                  {formatNature(detail.financialNature)}
                </td>
                <td className="px-3 py-2">{detail.categoryName}</td>
                <td className="px-3 py-2">{detail.businessUnit}</td>
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

function InternalMovementSummary({
  report,
}: {
  report: MonthlyCashFlowPreview;
}) {
  return (
    <section className="rounded-2xl border border-sky-500/25 bg-card p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-sky-500/10 p-2.5">
            <Repeat2 className="h-5 w-5 text-sky-700 dark:text-sky-300" />
          </div>
          <div>
            <h2 className="font-serif text-xl">
              Internal / Working Capital
            </h2>
            <p className="text-sm text-muted-foreground">
              Transfers and credit-card settlement movement. Displayed for
              traceability, excluded from headline Net Cash Flow.
            </p>
          </div>
        </div>
        <div className="grid flex-1 gap-3 sm:grid-cols-3 lg:ms-auto lg:max-w-2xl">
          <InternalMetric
            label="Internal In"
            value={report.totals.internalIn}
            icon={ArrowDownLeft}
          />
          <InternalMetric
            label="Internal Out"
            value={report.totals.internalOut}
            icon={ArrowUpRight}
          />
          <InternalMetric
            label="Movement total"
            value={report.totals.internalMovementTotal}
            icon={CircleDollarSign}
          />
        </div>
      </div>
    </section>
  );
}

function InternalMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof ArrowUpRight;
}) {
  return (
    <div className="rounded-xl border bg-muted/15 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-2 font-mono text-xl font-semibold tabular-nums">
        {currency.format(value)}
      </div>
    </div>
  );
}

function MoneyCell({
  value,
  inflow = false,
  net = false,
  internal = false,
  featured = false,
}: {
  value: number;
  inflow?: boolean;
  net?: boolean;
  internal?: boolean;
  featured?: boolean;
}) {
  return (
    <td
      className={cn(
        "px-3 py-3 text-end font-mono tabular-nums",
        inflow && value > 0 && "text-emerald-700 dark:text-emerald-300",
        net &&
          (value >= 0
            ? "font-semibold text-emerald-700 dark:text-emerald-300"
            : "font-semibold text-red-700 dark:text-red-300"),
        internal && value !== 0 && "text-sky-700 dark:text-sky-300",
        featured && "bg-foreground/[0.025]"
      )}
    >
      {currency.format(value)}
    </td>
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

function formatNature(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
