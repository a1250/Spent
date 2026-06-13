"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowUpRight } from "lucide-react";
import { getImportHealth } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function ImportHealthReport() {
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ["import-health"],
    queryFn: getImportHealth,
  });

  return (
    <section className="space-y-3" dir="rtl">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg border bg-card p-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <h2 className="font-serif text-xl">Import Health</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            איכות הסיווג ומצבי staging לכל batch. הצגת הדוח אינה משנה נתונים.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[1440px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
              <th className="px-3 py-2 text-start font-medium">Batch</th>
              <th className="px-3 py-2 text-start font-medium">קובץ / adapter</th>
              <th className="px-3 py-2 text-start font-medium">סטטוס</th>
              <th className="px-3 py-2 text-start font-medium">נוצר</th>
              <th className="px-3 py-2 text-center font-medium">שורות</th>
              <th className="px-3 py-2 text-center font-medium">Imported rows</th>
              <th className="px-3 py-2 text-center font-medium">Pending</th>
              <th className="px-3 py-2 text-center font-medium">Pending dup.</th>
              <th className="px-3 py-2 text-center font-medium">Skipped dup.</th>
              <th className="px-3 py-2 text-center font-medium">Transactions</th>
              <th className="px-3 py-2 text-center font-medium">Manual</th>
              <th className="px-3 py-2 text-center font-medium">Auto</th>
              <th className="px-3 py-2 text-center font-medium">Needs review</th>
              <th className="px-3 py-2 text-center font-medium">כיסוי</th>
              <th className="px-3 py-2 text-start font-medium">פעולה</th>
            </tr>
          </thead>
          <tbody>
            {data.map((batch) => (
              <tr
                key={batch.batchId}
                className="border-b last:border-0 hover:bg-muted/20"
              >
                <td className="px-3 py-2 font-mono text-xs">#{batch.batchId}</td>
                <td className="max-w-[250px] px-3 py-2">
                  <div className="truncate font-medium" title={batch.sourceFilename}>
                    {batch.sourceFilename}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {batch.adapterKey}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Badge
                    variant={batch.status === "committed" ? "default" : "secondary"}
                  >
                    {batch.status}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                  {new Date(batch.createdAt).toLocaleString("he-IL")}
                </td>
                <HealthNumber value={batch.totalRows} />
                <HealthNumber value={batch.importedRows} />
                <HealthNumber value={batch.pendingRows} warn />
                <HealthNumber value={batch.pendingDuplicates} warn />
                <HealthNumber value={batch.skippedDuplicates} />
                <HealthNumber value={batch.importedTransactions} />
                <HealthNumber value={batch.manuallyApproved} good />
                <HealthNumber value={batch.autoClassified} good />
                <HealthNumber value={batch.needsReview} warn />
                <td className="px-3 py-2 text-center">
                  <span
                    className={
                      batch.classificationPercent < 40
                        ? "font-semibold text-amber-700 dark:text-amber-300"
                        : "font-semibold text-emerald-700 dark:text-emerald-300"
                    }
                  >
                    {batch.classificationPercent.toFixed(1)}%
                  </span>
                </td>
                <td className="px-3 py-2">
                  <Button
                    variant="outline"
                    size="sm"
                    render={
                      <Link href={`/import?batchId=${batch.batchId}`}>
                        סקירת batch
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {isLoading && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            טוען נתוני איכות ייבוא...
          </div>
        )}
        {isError && (
          <div className="py-12 text-center text-sm text-destructive">
            לא ניתן לטעון את דוח הייבוא.
          </div>
        )}
        {!isLoading && !isError && data.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            עדיין אין batches להצגה.
          </div>
        )}
      </div>
    </section>
  );
}

function HealthNumber({
  value,
  warn = false,
  good = false,
}: {
  value: number;
  warn?: boolean;
  good?: boolean;
}) {
  return (
    <td
      className={`px-3 py-2 text-center font-mono tabular-nums ${
        warn && value > 0
          ? "font-semibold text-amber-700 dark:text-amber-300"
          : good && value > 0
            ? "font-semibold text-emerald-700 dark:text-emerald-300"
            : ""
      }`}
    >
      {value.toLocaleString("he-IL")}
    </td>
  );
}
