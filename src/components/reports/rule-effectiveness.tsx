"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Gauge,
  ListChecks,
  ShieldCheck,
  Sparkles,
  TimerOff,
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
import { getRuleEffectivenessReport } from "@/lib/api";
import { RuleProvenanceBadge } from "@/components/import/import-intelligence-badges";
import type {
  RuleEffectiveness,
  RuleEffectivenessReport,
} from "@/lib/types";

const integer = new Intl.NumberFormat("en-US");
const dateTime = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string | null): string {
  if (!value) return "Never";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : dateTime.format(date);
}

function formatConfidence(value: number | null): string {
  return value == null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function readable(value: string | null): string {
  return value ? value.replaceAll("_", " ") : "—";
}

export function RuleEffectivenessPage() {
  const reportQuery = useQuery({
    queryKey: ["rule-effectiveness"],
    queryFn: getRuleEffectivenessReport,
  });

  return (
    <>
      <PageHeader
        title="Rule Effectiveness"
        meta="Future auto-classification provenance"
        actions={
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href="/reports">Reports</Link>}
          />
        }
      />

      <main className="space-y-6 p-4 md:p-6 lg:p-8">
        <section className="rounded-2xl border border-sky-500/25 bg-sky-500/[0.055] p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-700 dark:text-sky-300" />
            <div>
              <h2 className="font-medium">Forward-looking attribution</h2>
              <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">
                This report tracks future auto-classifications from
                user-approved rules. Existing manually approved rows were not
                retroactively assigned to rules.
              </p>
            </div>
          </div>
        </section>

        {reportQuery.isLoading && <ReportSkeleton />}

        {reportQuery.isError && (
          <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
              <div>
                <h2 className="font-medium">
                  Could not load rule effectiveness
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {reportQuery.error instanceof Error
                    ? reportQuery.error.message
                    : "The report request failed."}
                </p>
              </div>
            </div>
          </section>
        )}

        {reportQuery.data && (
          <>
            <SummaryCards summary={reportQuery.data.summary} />
            {reportQuery.data.summary.rulesWithApplications === 0 && (
              <ZeroApplicationsNotice
                ruleCount={reportQuery.data.summary.totalUserApprovedRules}
              />
            )}
            <RulesTable rules={reportQuery.data.rules} />
          </>
        )}
      </main>
    </>
  );
}

function SummaryCards({
  summary,
}: {
  summary: RuleEffectivenessReport["summary"];
}) {
  const cards = [
    {
      label: "User-approved rules",
      value: integer.format(summary.totalUserApprovedRules),
      note: `${integer.format(summary.legacyRules)} legacy rules excluded`,
      icon: ListChecks,
    },
    {
      label: "Active rules",
      value: integer.format(summary.activeUserApprovedRules),
      note: "Eligible for future imports",
      icon: CheckCircle2,
    },
    {
      label: "Rules with applications",
      value: integer.format(summary.rulesWithApplications),
      note: "Observed on future imports",
      icon: Sparkles,
    },
    {
      label: "Zero applications",
      value: integer.format(summary.rulesWithoutApplications),
      note: "Expected before matching imports",
      icon: TimerOff,
    },
    {
      label: "Attributed rows",
      value: integer.format(summary.totalAutoClassifiedRowsWithRule),
      note: "Auto-classified with applied_rule_id",
      icon: ShieldCheck,
    },
    {
      label: "Average confidence",
      value: formatConfidence(summary.averageAppliedConfidence),
      note: "Recorded at application time",
      icon: Gauge,
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {cards.map((card) => (
        <Card key={card.label} size="sm">
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

function ZeroApplicationsNotice({ ruleCount }: { ruleCount: number }) {
  return (
    <section className="rounded-2xl border border-dashed bg-muted/20 p-5">
      <div className="flex items-start gap-3">
        <TimerOff className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div>
          <h2 className="font-medium">No rule applications recorded yet</h2>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">
            All {integer.format(ruleCount)} user-approved rules are ready for
            future matching imports. Zero applications is expected because
            existing manual classifications were intentionally not backfilled.
          </p>
        </div>
      </div>
    </section>
  );
}

function RulesTable({ rules }: { rules: RuleEffectiveness[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-xl">User-approved rules</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Legacy seed rules are excluded from this effectiveness table.
          </p>
        </div>
        <Badge variant="outline">{integer.format(rules.length)} rules</Badge>
      </div>

      {rules.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <Clock3 className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 font-medium">No user-approved rules yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Rules appear here after they are explicitly saved from review.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rule</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Match pattern</TableHead>
              <TableHead>Classification</TableHead>
              <TableHead>Business unit</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-end">Applied</TableHead>
              <TableHead>Last applied</TableHead>
              <TableHead className="text-end">Avg. confidence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((rule) => (
              <TableRow
                key={rule.ruleId}
                className={rule.appliedRows === 0 ? "bg-muted/[0.12]" : undefined}
              >
                <TableCell>
                  <RuleProvenanceBadge
                    ruleId={rule.ruleId}
                    source={rule.ruleSource}
                    confidence={null}
                  />
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={
                      rule.isActive
                        ? "border-emerald-500/35 bg-emerald-500/8 text-emerald-800 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground"
                    }
                  >
                    {rule.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[320px] whitespace-normal">
                  <div className="text-xs text-muted-foreground">
                    {readable(rule.matchField)} · {readable(rule.matchType)}
                  </div>
                  <div className="mt-1 break-words font-mono text-xs">
                    {rule.matchValue}
                  </div>
                </TableCell>
                <TableCell className="whitespace-normal">
                  <div className="font-medium">
                    {rule.categoryName ?? "No category"}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    {readable(rule.financialNature)} ·{" "}
                    {readable(rule.cashFlowType)} · P&amp;L{" "}
                    {rule.pnlImpact ?? "—"}
                  </div>
                </TableCell>
                <TableCell>{rule.businessUnit ?? "—"}</TableCell>
                <TableCell>{formatDate(rule.createdAt)}</TableCell>
                <TableCell className="text-end tabular-nums">
                  {rule.appliedRows === 0 ? (
                    <Badge
                      variant="outline"
                      className="whitespace-nowrap text-muted-foreground"
                    >
                      Awaiting match
                    </Badge>
                  ) : (
                    <span className="font-medium">
                      {integer.format(rule.appliedRows)}
                    </span>
                  )}
                </TableCell>
                <TableCell>{formatDate(rule.lastAppliedAt)}</TableCell>
                <TableCell className="text-end tabular-nums">
                  {formatConfidence(rule.averageAppliedConfidence)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
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
