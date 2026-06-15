"use client";

import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { NeedsReviewTransaction } from "@/lib/types";

export interface ReviewFilters {
  search: string;
  auditSearch: string;
  batchId: string;
  adapterKey: string;
  businessUnit: string;
  financialNature: string;
  cashFlowType: string;
  amountMin: string;
  amountMax: string;
  dateFrom: string;
  dateTo: string;
  highValueOnly: boolean;
  repeatedOnly: boolean;
}

export const EMPTY_FILTERS: ReviewFilters = {
  search: "",
  auditSearch: "",
  batchId: "",
  adapterKey: "",
  businessUnit: "",
  financialNature: "",
  cashFlowType: "",
  amountMin: "",
  amountMax: "",
  dateFrom: "",
  dateTo: "",
  highValueOnly: false,
  repeatedOnly: false,
};

const FINANCIAL_NATURES: [string, string][] = [
  ["operating_income", "הכנסה תפעולית"],
  ["operating_expense", "הוצאה תפעולית"],
  ["credit_card_payment", "⚠ תשלום כרטיס אשראי"],
  ["refund", "זיכוי"],
  ["working_capital", "הון חוזר"],
  ["internal_transfer", "העברה פנימית"],
  ["owner_deposit", "הפקדת בעל"],
  ["owner_draw", "משיכת בעל"],
  ["investment", "השקעה"],
  ["tax", "מס"],
  ["unknown", "לא ידוע"],
];

const CASH_FLOW_TYPES: [string, string][] = [
  ["real_cash_in", "תזרים נכנס"],
  ["real_cash_out", "תזרים יוצא"],
  ["internal_transfer", "העברה פנימית"],
  ["non_cash", "לא במזומן"],
  ["pending", "ממתין"],
  ["unknown", "לא ידוע"],
];

function NativeSelect({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-lg border border-input bg-transparent px-2 py-1 text-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30 dark:bg-input/30"
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  );
}

function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-transparent text-muted-foreground hover:border-foreground/30 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

interface FilterBarProps {
  filters: ReviewFilters;
  onChange: (f: ReviewFilters) => void;
  allRows: NeedsReviewTransaction[];
  totalCount: number;
  filteredCount: number;
}

export function ReviewFilterBar({
  filters,
  onChange,
  allRows,
  totalCount,
  filteredCount,
}: FilterBarProps) {
  const set = <K extends keyof ReviewFilters>(key: K, value: ReviewFilters[K]) =>
    onChange({ ...filters, [key]: value });

  // Unique option lists derived from loaded data
  const uniqueBatches = Array.from(
    new Map(
      allRows
        .filter((r) => r.importBatchId != null)
        .map((r) => [r.importBatchId, r.sourceFilename])
    ).entries()
  ).sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));

  const uniqueAdapters = Array.from(
    new Set(allRows.filter((r) => r.adapterKey).map((r) => r.adapterKey!))
  ).sort();

  const uniqueBUs = Array.from(
    new Set(
      allRows
        .filter((r) => r.businessUnit && r.businessUnit !== "unknown")
        .map((r) => r.businessUnit!)
    )
  ).sort();

  const activeCount = [
    filters.search,
    filters.auditSearch,
    filters.batchId,
    filters.adapterKey,
    filters.businessUnit,
    filters.financialNature,
    filters.cashFlowType,
    filters.amountMin,
    filters.amountMax,
    filters.dateFrom,
    filters.dateTo,
    filters.highValueOnly ? "1" : "",
    filters.repeatedOnly ? "1" : "",
  ].filter(Boolean).length;

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      {/* Row 1: text search + dropdowns */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 ps-8 text-sm"
            placeholder="חיפוש תיאור / צד נגדי..."
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
          />
        </div>

        <Input
          className="h-8 min-w-[150px] max-w-[190px] text-sm"
          placeholder="audit: legacy / source..."
          value={filters.auditSearch}
          onChange={(e) => set("auditSearch", e.target.value)}
        />

        {uniqueBatches.length > 0 && (
          <NativeSelect
            value={filters.batchId}
            onChange={(v) => set("batchId", v)}
            placeholder="כל ה-batch-ים"
          >
            {uniqueBatches.map(([id, name]) => (
              <option key={id} value={String(id)}>
                #{id} · {name ?? "ייבוא"}
              </option>
            ))}
          </NativeSelect>
        )}

        {uniqueAdapters.length > 1 && (
          <NativeSelect
            value={filters.adapterKey}
            onChange={(v) => set("adapterKey", v)}
            placeholder="כל המקורות"
          >
            {uniqueAdapters.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </NativeSelect>
        )}

        {uniqueBUs.length > 0 && (
          <NativeSelect
            value={filters.businessUnit}
            onChange={(v) => set("businessUnit", v)}
            placeholder="כל היחידות"
          >
            {uniqueBUs.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </NativeSelect>
        )}

        <NativeSelect
          value={filters.financialNature}
          onChange={(v) => set("financialNature", v)}
          placeholder="סוג פיננסי"
        >
          {FINANCIAL_NATURES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </NativeSelect>

        <NativeSelect
          value={filters.cashFlowType}
          onChange={(v) => set("cashFlowType", v)}
          placeholder="תזרים"
        >
          {CASH_FLOW_TYPES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </NativeSelect>
      </div>

      {/* Row 2: numeric/date ranges + toggles + count/clear */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">סכום ₪</span>
          <Input
            type="number"
            className="h-7 w-20 text-xs"
            placeholder="מינ'"
            value={filters.amountMin}
            onChange={(e) => set("amountMin", e.target.value)}
          />
          <span className="text-xs text-muted-foreground">–</span>
          <Input
            type="number"
            className="h-7 w-20 text-xs"
            placeholder="מקס'"
            value={filters.amountMax}
            onChange={(e) => set("amountMax", e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">תאריך</span>
          <Input
            type="date"
            className="h-7 w-36 text-xs"
            value={filters.dateFrom}
            onChange={(e) => set("dateFrom", e.target.value)}
          />
          <span className="text-xs text-muted-foreground">–</span>
          <Input
            type="date"
            className="h-7 w-36 text-xs"
            value={filters.dateTo}
            onChange={(e) => set("dateTo", e.target.value)}
          />
        </div>

        <ToggleChip
          active={filters.highValueOnly}
          onClick={() => set("highValueOnly", !filters.highValueOnly)}
        >
          ≥ ₪5,000 בלבד
        </ToggleChip>

        <ToggleChip
          active={filters.repeatedOnly}
          onClick={() => set("repeatedOnly", !filters.repeatedOnly)}
        >
          צד נגדי חוזר בלבד
        </ToggleChip>

        <div className="ms-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {filteredCount === totalCount
              ? `${totalCount} תנועות`
              : `${filteredCount} מתוך ${totalCount}`}
          </span>
          {activeCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => onChange(EMPTY_FILTERS)}
            >
              <X className="me-1 h-3 w-3" />
              נקה
              <Badge
                variant="secondary"
                className="ms-1 h-4 px-1 text-[10px]"
              >
                {activeCount}
              </Badge>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
