"use client";

import { useState } from "react";
import { ArrowUpRight, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { NeedsReviewTransaction } from "@/lib/types";

const moneyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export interface CounterpartyGroup {
  key: string;
  displayName: string;
  count: number;
  totalAbsAmount: number;
  largestAbsAmount: number;
  batches: number[];
  legacyCategories: string[];
  sourceCategories: string[];
  examples: NeedsReviewTransaction[];
}

export function buildCounterpartyGroups(
  rows: NeedsReviewTransaction[]
): CounterpartyGroup[] {
  const map = new Map<
    string,
    {
      displayName: string;
      count: number;
      totalAbsAmount: number;
      largestAbsAmount: number;
      batches: Set<number>;
      legacyCategories: Set<string>;
      sourceCategories: Set<string>;
      examples: NeedsReviewTransaction[];
    }
  >();

  for (const row of rows) {
    const display =
      row.counterparty ??
      row.cleanDescription ??
      row.description ??
      "";
    if (!display.trim()) continue;
    const key = display.toLowerCase().trim();

    if (!map.has(key)) {
      map.set(key, {
        displayName: display.trim(),
        count: 0,
        totalAbsAmount: 0,
        largestAbsAmount: 0,
        batches: new Set(),
        legacyCategories: new Set(),
        sourceCategories: new Set(),
        examples: [],
      });
    }

    const g = map.get(key)!;
    const abs = Math.abs(row.chargedAmount);
    g.count++;
    g.totalAbsAmount += abs;
    if (abs > g.largestAbsAmount) g.largestAbsAmount = abs;
    if (row.importBatchId != null) g.batches.add(row.importBatchId);
    if (row.legacyCategory) g.legacyCategories.add(row.legacyCategory);
    if (row.sourceCategory) g.sourceCategories.add(row.sourceCategory);
    if (g.examples.length < 3) g.examples.push(row);
  }

  return Array.from(map.values())
    .filter((g) => g.count > 1)
    .sort((a, b) => b.totalAbsAmount - a.totalAbsAmount)
    .map((g) => ({
      key: g.displayName.toLowerCase().trim(),
      displayName: g.displayName,
      count: g.count,
      totalAbsAmount: g.totalAbsAmount,
      largestAbsAmount: g.largestAbsAmount,
      batches: Array.from(g.batches).sort((a, b) => a - b),
      legacyCategories: Array.from(g.legacyCategories).sort(),
      sourceCategories: Array.from(g.sourceCategories).sort(),
      examples: g.examples,
    }));
}

function GroupRow({
  group,
  onFilterByCounterparty,
}: {
  group: CounterpartyGroup;
  onFilterByCounterparty: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr className="border-b last:border-0 hover:bg-muted/20">
        <td className="px-3 py-2">
          <button
            type="button"
            className="flex items-center gap-1.5 text-start text-sm font-medium hover:underline"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            {group.displayName}
          </button>
        </td>
        <td className="px-3 py-2 text-center">
          <Badge variant="secondary">{group.count}</Badge>
        </td>
        <td className="px-3 py-2 text-end font-mono font-semibold tabular-nums">
          {moneyFormatter.format(group.totalAbsAmount)}
        </td>
        <td className="px-3 py-2 text-end font-mono text-xs text-muted-foreground tabular-nums">
          {moneyFormatter.format(group.largestAbsAmount)}
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground">
          {group.batches.map((id) => `#${id}`).join(", ")}
        </td>
        <td className="max-w-[220px] px-3 py-2 text-xs text-muted-foreground">
          {[...group.legacyCategories, ...group.sourceCategories]
            .slice(0, 3)
            .join(", ") || "—"}
          <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Audit only
          </div>
        </td>
        <td className="px-3 py-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() => onFilterByCounterparty(group.displayName)}
          >
            <ArrowUpRight className="me-1 h-3 w-3" />
            סנן
          </Button>
        </td>
      </tr>

      {expanded &&
        group.examples.map((ex) => (
          <tr
            key={ex.id}
            className="border-b bg-muted/10 last:border-0 hover:bg-muted/20"
          >
            <td className="py-1.5 pe-3 ps-10 text-xs text-muted-foreground" colSpan={2}>
              <span className="font-mono">#{ex.id}</span> · {ex.date} ·{" "}
              {ex.cleanDescription ?? ex.description}
            </td>
            <td className="py-1.5 pe-3 text-end font-mono text-xs tabular-nums">
              {moneyFormatter.format(ex.chargedAmount)}
            </td>
            <td colSpan={4} className="py-1.5 pe-3 text-xs text-muted-foreground">
              {ex.businessUnit ?? "unknown"} · {ex.financialNature}
            </td>
          </tr>
        ))}
    </>
  );
}

export function ReviewCounterpartyGroups({
  groups,
  onFilterByCounterparty,
}: {
  groups: CounterpartyGroup[];
  onFilterByCounterparty: (name: string) => void;
}) {
  if (groups.length === 0) {
    return (
      <div className="rounded-xl border bg-card py-12 text-center text-sm text-muted-foreground">
        אין צדדים נגדיים חוזרים בין התנועות הממתינות לסיווג.
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="sticky top-0 z-[1] bg-muted/95 text-xs text-muted-foreground backdrop-blur">
          <tr className="border-b">
            <th className="px-3 py-2 text-start font-medium">צד נגדי</th>
            <th className="px-3 py-2 text-center font-medium">כמות</th>
            <th className="px-3 py-2 text-end font-medium">{"סה\"כ ₪"}</th>
            <th className="px-3 py-2 text-end font-medium">גדול ביותר</th>
            <th className="px-3 py-2 text-start font-medium">batch</th>
            <th className="px-3 py-2 text-start font-medium">Audit בלבד</th>
            <th className="px-3 py-2 text-start font-medium">פעולה</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <GroupRow
              key={g.key}
              group={g}
              onFilterByCounterparty={onFilterByCounterparty}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
