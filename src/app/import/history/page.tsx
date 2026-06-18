"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  AlertCircle,
  History,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getImportHistory } from "@/lib/api";
import type { ImportBatch } from "@/lib/types";

const ADAPTER_LABELS: Record<ImportBatch["adapterKey"], string> = {
  "legacy-excel": "Legacy Excel",
  "credit-card-isracard": "Isracard",
  "credit-card-cal": "CAL",
  "bank-checking-hebrew": "Bank checking",
};

function statusBadge(status: ImportBatch["status"]) {
  if (status === "committed") {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="h-3 w-3" />
        Committed
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="outline" className="gap-1 border-destructive/30 bg-destructive/8 text-destructive">
        <AlertCircle className="h-3 w-3" />
        Failed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <Clock className="h-3 w-3" />
      {status}
    </Badge>
  );
}

function formatDate(isoDate: string | null) {
  if (!isoDate) return "—";
  return new Date(isoDate).toLocaleDateString("en-IL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function ImportHistoryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["import-history"],
    queryFn: () => getImportHistory(100, 0),
  });

  const batches = data?.batches ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          className="gap-1.5"
          render={<Link href="/import"><ArrowLeft className="h-3.5 w-3.5" />Back to Import</Link>}
        />
      </div>

      <div className="rounded-2xl border bg-card">
        <div className="flex items-center gap-3 border-b px-5 py-4">
          <History className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="font-serif text-xl">Import History</h2>
            <p className="text-sm text-muted-foreground">
              All file imports, newest first.
            </p>
          </div>
          <span className="ms-auto text-xs text-muted-foreground">
            {data ? `${data.total} batches` : ""}
          </span>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : batches.length === 0 ? (
          <div className="py-16 text-center">
            <FileSpreadsheet className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No imports yet.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              nativeButton={false}
              render={<Link href="/import">Import a file</Link>}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                  <th className="px-5 py-3 text-start font-medium">File</th>
                  <th className="px-4 py-3 text-start font-medium">Adapter</th>
                  <th className="px-4 py-3 text-start font-medium">Status</th>
                  <th className="px-4 py-3 text-end font-medium">Date range</th>
                  <th className="px-4 py-3 text-center font-medium">Rows</th>
                  <th className="px-4 py-3 text-center font-medium">Imported</th>
                  <th className="px-4 py-3 text-center font-medium">Dupes</th>
                  <th className="px-4 py-3 text-center font-medium">Review</th>
                  <th className="px-4 py-3 text-end font-medium">Committed</th>
                  <th className="px-4 py-3 text-start font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {batches.map((b) => (
                  <tr key={b.id} className="hover:bg-muted/20">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="max-w-[200px] truncate font-medium" title={b.sourceFilename}>
                          {b.sourceFilename}
                        </span>
                      </div>
                      <div className="ms-5 mt-0.5 text-[11px] text-muted-foreground">
                        Batch #{b.id} · uploaded {formatDate(b.createdAt)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {b.adapterKey ? (ADAPTER_LABELS[b.adapterKey] ?? b.adapterKey) : "—"}
                    </td>
                    <td className="px-4 py-3">{statusBadge(b.status)}</td>
                    <td className="px-4 py-3 text-end text-xs text-muted-foreground">
                      {b.dateRangeStart ? (
                        <>
                          {formatDate(b.dateRangeStart)}
                          {b.dateRangeEnd && b.dateRangeEnd !== b.dateRangeStart && (
                            <> – {formatDate(b.dateRangeEnd)}</>
                          )}
                        </>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums">{b.totalRows}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-emerald-700 dark:text-emerald-300">
                      {b.importedRows}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums text-muted-foreground">
                      {b.duplicateRows}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums text-amber-700 dark:text-amber-300">
                      {b.needsReviewRows}
                    </td>
                    <td className="px-4 py-3 text-end text-xs text-muted-foreground">
                      {formatDate(b.committedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/import?batch=${b.id}`}
                        className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      >
                        View batch
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
