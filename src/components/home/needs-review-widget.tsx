import Link from "next/link";
import { ArrowUpRight, ListChecks } from "lucide-react";
import type { NeedsReviewTransaction } from "@/lib/types";

const moneyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export function NeedsReviewWidget({
  rows,
  total,
}: {
  rows: NeedsReviewTransaction[];
  total: number;
}) {
  return (
    <section className="rounded-2xl border bg-card p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <h2 className="font-medium">Needs Review</h2>
        </div>
        <Link
          href="/review"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          כל התור
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="mt-3 divide-y">
        {rows.slice(0, 3).map((row) => (
          <div
            key={row.id}
            className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {row.counterparty ?? row.cleanDescription ?? row.description}
              </div>
              <div className="text-xs text-muted-foreground">
                #{row.id} · {row.date}
              </div>
            </div>
            <div className="shrink-0 font-mono text-sm font-medium tabular-nums">
              {moneyFormatter.format(row.chargedAmount)}
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="py-4 text-center text-sm text-muted-foreground">
            אין תנועות שממתינות לבדיקה.
          </div>
        )}
      </div>

      {total > rows.length && (
        <div className="mt-3 border-t pt-3 text-xs text-muted-foreground">
          עוד {(total - rows.length).toLocaleString("he-IL")} תנועות בתור
        </div>
      )}
    </section>
  );
}
