"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BadgeQuestionMark,
  BookOpenCheck,
  CircleHelp,
  FileSearch,
  ListFilter,
  RefreshCcw,
  ScanSearch,
  ShieldAlert,
  Sparkles,
  Tags,
  UsersRound,
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
import { getDataQualityDashboard } from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  DataQualityDashboard,
  DataQualityExample,
  DataQualityRecommendedAction,
  DataQualitySprintBucket,
  RepeatedUnclassifiedPattern,
} from "@/lib/types";

const currency = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const integer = new Intl.NumberFormat("en-US");

const ACTION_LABELS: Record<DataQualityRecommendedAction, string> = {
  classify_manually: "Classify manually",
  create_rule_candidate: "Possible rule candidate",
  keep_review: "Keep review",
  needs_user_context: "Needs user context",
};

const ACTION_STYLES: Record<DataQualityRecommendedAction, string> = {
  classify_manually:
    "border-sky-500/35 bg-sky-500/8 text-sky-800 dark:text-sky-300",
  create_rule_candidate:
    "border-emerald-500/35 bg-emerald-500/8 text-emerald-800 dark:text-emerald-300",
  keep_review:
    "border-violet-500/35 bg-violet-500/8 text-violet-800 dark:text-violet-300",
  needs_user_context:
    "border-amber-500/35 bg-amber-500/8 text-amber-800 dark:text-amber-300",
};

const BUCKET_ICONS = {
  high_count_low_ambiguity: ListFilter,
  high_value_needs_context: CircleHelp,
  possible_rule_candidates: Sparkles,
  should_remain_manual: ShieldAlert,
};

export function DataQualityDashboardPage() {
  const reportQuery = useQuery({
    queryKey: ["data-quality-dashboard"],
    queryFn: getDataQualityDashboard,
  });

  return (
    <>
      <PageHeader
        title="Business Data Quality"
        meta="Read-only classification coverage and sprint planning"
        actions={
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href="/review">Review Queue</Link>}
            />
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href="/reports">Reports</Link>}
            />
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
                <h2 className="font-medium">
                  Could not load data quality
                </h2>
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
            <ReadOnlyBanner report={reportQuery.data} />
            <SummaryCards report={reportQuery.data} />
            <SprintBuckets
              buckets={reportQuery.data.suggestedSprintBuckets}
            />
            <NeedsReviewBySource report={reportQuery.data} />
            <div className="grid gap-6 xl:grid-cols-2">
              <UnknownBusinessUnit report={reportQuery.data} />
              <UncertainPnl report={reportQuery.data} />
            </div>
            <RepeatedPatterns report={reportQuery.data} />
          </>
        )}
      </main>
    </>
  );
}

function ReadOnlyBanner({ report }: { report: DataQualityDashboard }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-amber-500/[0.055]">
      <div className="absolute inset-y-0 start-0 w-1 bg-amber-500" />
      <div className="grid gap-5 p-5 ps-6 lg:grid-cols-[1.4fr_1fr] lg:items-center">
        <div>
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
            <ScanSearch className="h-5 w-5" />
            <h2 className="font-medium">
              Planning view, not a classification action
            </h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Suggestions prioritize repeated descriptors and unresolved value.
            They do not apply categories, create rules, or treat legacy/source
            categories as final truth.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <BannerMetric
            label="Needs review"
            value={integer.format(
              report.summary.needsReviewTransactions
            )}
          />
          <BannerMetric
            label="Count coverage"
            value={`${report.summary.coverageByCount.toFixed(2)}%`}
          />
          <BannerMetric
            label="Value coverage"
            value={`${report.summary.coverageByValue.toFixed(2)}%`}
          />
        </div>
      </div>
    </section>
  );
}

function BannerMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background/75 px-3 py-4 text-center">
      <div className="font-serif text-xl font-semibold tabular-nums">
        {value}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function SummaryCards({ report }: { report: DataQualityDashboard }) {
  const summary = report.summary;
  const cards = [
    {
      label: "Total transactions",
      value: integer.format(summary.totalTransactions),
      note: "Full workspace scope",
      icon: BookOpenCheck,
    },
    {
      label: "Classified",
      value: integer.format(summary.classifiedTransactions),
      note: `${summary.coverageByCount.toFixed(2)}% by count`,
      icon: Tags,
    },
    {
      label: "Needs review",
      value: integer.format(summary.needsReviewTransactions),
      note: currency.format(summary.unclassifiedValueTotal),
      icon: FileSearch,
      warning: true,
    },
    {
      label: "Value coverage",
      value: `${summary.coverageByValue.toFixed(2)}%`,
      note: `${currency.format(summary.classifiedAbsoluteValue)} classified`,
      icon: ScanSearch,
    },
    {
      label: "User-approved rules",
      value: integer.format(summary.userApprovedRules),
      note: `${integer.format(summary.legacyRules)} legacy rules, audit only`,
      icon: Sparkles,
    },
    {
      label: "Unknown business unit",
      value: integer.format(summary.unknownBusinessUnitCount),
      note: "Already-classified rows",
      icon: UsersRound,
      warning: summary.unknownBusinessUnitCount > 0,
    },
    {
      label: "P&L maybe",
      value: integer.format(summary.uncertainPnlCount),
      note: "Classified but excluded from headline P&L",
      icon: BadgeQuestionMark,
      warning: summary.uncertainPnlCount > 0,
    },
    {
      label: "Missing / incomplete",
      value: integer.format(summary.missingCategoryCount),
      note: `${integer.format(summary.incompleteFinancialFieldsCount)} have unknown financial fields`,
      icon: ShieldAlert,
      warning: summary.missingCategoryCount > 0,
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card
          key={card.label}
          size="sm"
          className={cn(
            card.warning &&
              "border-amber-500/25 bg-amber-500/[0.025]"
          )}
        >
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                {card.label}
              </p>
              <p className="mt-2 font-serif text-3xl font-semibold tabular-nums">
                {card.value}
              </p>
            </div>
            <div className="rounded-lg bg-muted p-2">
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {card.note}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function SprintBuckets({
  buckets,
}: {
  buckets: DataQualitySprintBucket[];
}) {
  return (
    <section className="space-y-3">
      <SectionHeading
        icon={Sparkles}
        title="Suggested next sprint buckets"
        description="Read-only prioritization. Every row still requires explicit review and approval."
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {buckets.map((bucket) => {
          const Icon = BUCKET_ICONS[bucket.kind];
          return (
            <Card key={bucket.kind} size="sm">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="rounded-lg bg-muted p-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <Badge variant="outline">
                    {integer.format(bucket.transactionCount)} rows
                  </Badge>
                </div>
                <h3 className="mt-3 font-serif text-lg">{bucket.title}</h3>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-5 text-muted-foreground">
                  {bucket.description}
                </p>
                <p className="mt-3 font-medium tabular-nums">
                  {currency.format(bucket.absoluteValue)}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {bucket.patterns.length > 0 ? (
                    bucket.patterns.map((pattern) => (
                      <Badge
                        key={pattern}
                        variant="secondary"
                        className="max-w-full truncate font-normal"
                        title={pattern}
                      >
                        {pattern}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      No current patterns in this bucket.
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function NeedsReviewBySource({
  report,
}: {
  report: DataQualityDashboard;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <SectionHeader
        icon={FileSearch}
        title="Needs Review by Source"
        description="Full review denominator grouped by import provenance."
        count={report.needsReviewBySource.length}
      />
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/25 hover:bg-muted/25">
            <TableHead className="ps-5">Source / Batch</TableHead>
            <TableHead>Sheet</TableHead>
            <TableHead className="text-end">Rows</TableHead>
            <TableHead className="text-end">Absolute value</TableHead>
            <TableHead className="text-end">Largest row</TableHead>
            <TableHead className="min-w-80 pe-5">Examples</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.needsReviewBySource.map((group) => (
            <TableRow
              key={`${group.sourceType}-${group.importBatchId}-${group.sourceSheetName}`}
            >
              <TableCell className="ps-5">
                <div className="font-medium">{group.sourceType}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {group.adapterKey ?? "direct"} · batch{" "}
                  {group.importBatchId ?? "—"}
                </div>
                <div className="mt-0.5 max-w-64 truncate text-xs text-muted-foreground">
                  {group.sourceFilename ?? "Direct transaction"}
                </div>
              </TableCell>
              <TableCell>{group.sourceSheetName ?? "—"}</TableCell>
              <TableCell className="text-end font-medium tabular-nums">
                {integer.format(group.count)}
              </TableCell>
              <TableCell className="text-end tabular-nums">
                {currency.format(group.absoluteValue)}
              </TableCell>
              <TableCell className="text-end tabular-nums">
                {currency.format(group.largestAmount)}
              </TableCell>
              <TableCell className="pe-5">
                <Examples examples={group.examples} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

function UnknownBusinessUnit({
  report,
}: {
  report: DataQualityDashboard;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <SectionHeader
        icon={UsersRound}
        title="Unknown Business Unit"
        description="Classified rows whose unit allocation is still unresolved."
        count={report.summary.unknownBusinessUnitCount}
      />
      <div className="max-h-[520px] overflow-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="sticky top-0 bg-muted/95 text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-2 text-start font-medium">Group</th>
              <th className="px-4 py-2 text-end font-medium">Rows</th>
              <th className="px-4 py-2 text-end font-medium">Net amount</th>
              <th className="px-4 py-2 text-start font-medium">Examples</th>
            </tr>
          </thead>
          <tbody>
            {report.unknownBusinessUnits.map((group) => (
              <tr
                key={`${group.categoryName}-${group.financialNature}-${group.counterparty}`}
                className="border-b last:border-0"
              >
                <td className="px-4 py-3">
                  <div className="font-medium">{group.counterparty}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {group.categoryName ?? "No category"} ·{" "}
                    {readable(group.financialNature)}
                  </div>
                </td>
                <td className="px-4 py-3 text-end tabular-nums">
                  {group.count}
                </td>
                <td className="px-4 py-3 text-end font-medium tabular-nums">
                  {currency.format(group.amountSum)}
                </td>
                <td className="px-4 py-3">
                  <Examples examples={group.examples} compact />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UncertainPnl({ report }: { report: DataQualityDashboard }) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <SectionHeader
        icon={BadgeQuestionMark}
        title="P&L Maybe / Uncertain"
        description="Classified rows kept outside headline Net P&L."
        count={report.summary.uncertainPnlCount}
      />
      <div className="max-h-[520px] overflow-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="sticky top-0 bg-muted/95 text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-2 text-start font-medium">Group</th>
              <th className="px-4 py-2 text-end font-medium">Rows</th>
              <th className="px-4 py-2 text-end font-medium">Net amount</th>
              <th className="px-4 py-2 text-start font-medium">Examples</th>
            </tr>
          </thead>
          <tbody>
            {report.uncertainPnl.map((group) => (
              <tr
                key={`${group.financialNature}-${group.categoryName}-${group.businessUnit}`}
                className="border-b last:border-0"
              >
                <td className="px-4 py-3">
                  <div className="font-medium">
                    {group.categoryName ?? "No category"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {readable(group.financialNature)} · {group.businessUnit}
                  </div>
                </td>
                <td className="px-4 py-3 text-end tabular-nums">
                  {group.count}
                </td>
                <td className="px-4 py-3 text-end font-medium tabular-nums">
                  {currency.format(group.amountSum)}
                </td>
                <td className="px-4 py-3">
                  <Examples examples={group.examples} compact />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RepeatedPatterns({ report }: { report: DataQualityDashboard }) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <SectionHeader
        icon={ListFilter}
        title="Top Repeated Unclassified Counterparties"
        description="Normalized descriptors ranked by repetition, then unresolved absolute value."
        count={report.repeatedUnclassified.length}
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1380px] text-sm">
          <thead className="bg-muted/25 text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-2 text-start font-medium">Pattern</th>
              <th className="px-4 py-2 text-end font-medium">Rows</th>
              <th className="px-4 py-2 text-end font-medium">Absolute value</th>
              <th className="px-4 py-2 text-start font-medium">Examples</th>
              <th className="px-4 py-2 text-start font-medium">
                Audit context
              </th>
              <th className="px-4 py-2 text-start font-medium">
                Recommended action
              </th>
            </tr>
          </thead>
          <tbody>
            {report.repeatedUnclassified.map((pattern) => (
              <RepeatedPatternRow
                key={pattern.normalizedCounterparty}
                pattern={pattern}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RepeatedPatternRow({
  pattern,
}: {
  pattern: RepeatedUnclassifiedPattern;
}) {
  return (
    <tr className="border-b last:border-0 align-top">
      <td className="max-w-80 px-4 py-3">
        <div className="font-medium">{pattern.normalizedCounterparty}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          largest {currency.format(pattern.largestAmount)}
        </div>
      </td>
      <td className="px-4 py-3 text-end font-medium tabular-nums">
        {integer.format(pattern.count)}
      </td>
      <td className="px-4 py-3 text-end tabular-nums">
        {currency.format(pattern.absoluteValue)}
      </td>
      <td className="px-4 py-3">
        <div className="space-y-1 text-xs">
          {pattern.exampleDates.map((date, index) => (
            <div key={`${date}-${index}`} className="flex gap-2">
              <span className="font-mono text-muted-foreground">{date}</span>
              <span>{currency.format(pattern.exampleAmounts[index] ?? 0)}</span>
            </div>
          ))}
        </div>
      </td>
      <td className="max-w-72 px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {[...pattern.sourceCategories, ...pattern.legacyCategories].map(
            (category) => (
              <Badge
                key={category}
                variant="secondary"
                className="font-normal"
              >
                {category}
              </Badge>
            )
          )}
        </div>
        <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
          Audit only
        </div>
      </td>
      <td className="max-w-96 px-4 py-3">
        <Badge
          variant="outline"
          className={ACTION_STYLES[pattern.recommendedAction]}
        >
          {ACTION_LABELS[pattern.recommendedAction]}
        </Badge>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {pattern.recommendationReason}
        </p>
      </td>
    </tr>
  );
}

function Examples({
  examples,
  compact = false,
}: {
  examples: DataQualityExample[];
  compact?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      {examples.map((example) => (
        <div
          key={example.id}
          className={cn("text-xs", compact && "max-w-64")}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="truncate" title={example.description}>
              {example.counterparty ?? example.description}
            </span>
            <span className="shrink-0 font-mono tabular-nums">
              {currency.format(example.amount)}
            </span>
          </div>
          <div className="mt-0.5 flex gap-2 text-[10px] text-muted-foreground">
            <span>tx #{example.id}</span>
            <span>{example.date}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Sparkles;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 rounded-lg border bg-card p-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <h2 className="font-serif text-xl">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  description,
  count,
}: {
  icon: typeof Sparkles;
  title: string;
  description: string;
  count: number;
}) {
  return (
    <div className="flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-muted p-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <h2 className="font-serif text-xl">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <Badge variant="outline">{integer.format(count)}</Badge>
    </div>
  );
}

function readable(value: string): string {
  return value.replaceAll("_", " ");
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-36 animate-pulse rounded-2xl bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-xl bg-muted"
          />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}
