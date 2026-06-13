import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DataQualitySummary } from "@/lib/types";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value);
}

export function CoverageBanner({
  summary,
}: {
  summary: DataQualitySummary;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border p-4 md:p-5",
        summary.lowCoverage
          ? "border-amber-500/40 bg-amber-500/[0.06]"
          : "border-emerald-500/30 bg-emerald-500/[0.05]"
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-start gap-3">
          {summary.lowCoverage ? (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          )}
          <div>
            <h2 className="font-medium">Classification coverage</h2>
            {summary.lowCoverage ? (
              <p className="mt-0.5 text-sm font-medium text-amber-800 dark:text-amber-300">
                Low classification coverage. Financial reports are incomplete.
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-muted-foreground">
                רוב התנועות עברו סיווג פיננסי.
              </p>
            )}
          </div>
        </div>

        <div className="grid flex-1 grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4 lg:ms-auto lg:max-w-3xl">
          <Metric
            label="כיסוי לפי כמות"
            value={`${summary.coverageByCount.toFixed(1)}%`}
          />
          <Metric
            label="כיסוי לפי ערך"
            value={`${summary.coverageByValue.toFixed(1)}%`}
          />
          <Metric
            label="מסווגות"
            value={`${summary.classifiedTransactions.toLocaleString("he-IL")} / ${summary.totalTransactions.toLocaleString("he-IL")}`}
          />
          <Metric
            label="דורשות בדיקה"
            value={summary.needsReviewTransactions.toLocaleString("he-IL")}
          />
          <Metric
            label="ערך לא מסווג"
            value={formatCurrency(summary.unclassifiedValueTotal)}
          />
          <Metric
            label="הכנסות לא מסווגות"
            value={formatCurrency(summary.unclassifiedIncomeValue)}
          />
          <Metric
            label="הוצאות לא מסווגות"
            value={formatCurrency(summary.unclassifiedExpenseValue)}
          />
          <div className="flex items-end">
            <Link
              href="/review"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              פתיחת תור הבדיקה
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
