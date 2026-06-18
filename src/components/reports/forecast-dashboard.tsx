"use client";

import { useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  HelpCircle,
  MinusCircle,
  Plus,
  Scan,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  createForecastPattern,
  getForecastMonth,
  listForecastPatterns,
  runForecastDetection,
  updateForecastPattern,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  DetectionCandidate,
  DetectionResult,
  ForecastItem,
  ForecastItemStatus,
  ForecastMonth,
  RecurringFrequency,
  RecurringPattern,
} from "@/lib/types";

// ── Helpers ────────────────────────────────────────────────────────────────────

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function prevMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nextMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthDisplay(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

const FINANCIAL_NATURE_OPTIONS = [
  { value: "operating_income", label: "Operating Income" },
  { value: "operating_expense", label: "Operating Expense" },
  { value: "credit_card_payment", label: "Credit Card Payment" },
  { value: "refund", label: "Refund" },
  { value: "internal_transfer", label: "Internal Transfer" },
  { value: "owner_deposit", label: "Owner Deposit" },
  { value: "owner_draw", label: "Owner Draw" },
  { value: "loan_received", label: "Loan Received" },
  { value: "loan_repayment", label: "Loan Repayment" },
  { value: "tax", label: "Tax" },
  { value: "unknown", label: "Unknown" },
];

const CASH_FLOW_OPTIONS = [
  { value: "real_cash_in", label: "Cash In" },
  { value: "real_cash_out", label: "Cash Out" },
  { value: "internal_movement", label: "Internal Movement" },
  { value: "unknown", label: "Unknown" },
];

const FREQUENCY_OPTIONS: { value: RecurringFrequency; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "bimonthly", label: "Bimonthly (every 2 months)" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
  { value: "irregular", label: "Irregular" },
];

// ── Status helpers ─────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: ForecastItemStatus }) {
  switch (status) {
    case "matched":
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "expected":
      return <CalendarClock className="h-4 w-4 text-muted-foreground" />;
    case "missing":
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    case "overdue":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "uncertain":
      return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
    case "inactive":
      return <MinusCircle className="h-4 w-4 text-muted-foreground/50" />;
  }
}

function StatusBadge({ status }: { status: ForecastItemStatus }) {
  const classes: Record<ForecastItemStatus, string> = {
    matched:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    expected: "border-border bg-muted/50 text-muted-foreground",
    missing:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    overdue: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
    uncertain: "border-border bg-muted/50 text-muted-foreground",
    inactive: "border-border bg-muted/30 text-muted-foreground/60",
  };
  const labels: Record<ForecastItemStatus, string> = {
    matched: "Matched",
    expected: "Expected",
    missing: "Missing",
    overdue: "Overdue",
    uncertain: "Uncertain",
    inactive: "Inactive",
  };
  return (
    <Badge variant="outline" className={cn("text-xs", classes[status])}>
      {labels[status]}
    </Badge>
  );
}

// ── Forecast item row ──────────────────────────────────────────────────────────

function ForecastItemRow({ item }: { item: ForecastItem }) {
  const variance =
    item.actualAmount != null
      ? item.actualAmount - item.expectedAmount
      : null;
  const pct =
    variance != null && item.expectedAmount !== 0
      ? (variance / item.expectedAmount) * 100
      : null;

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
      <StatusIcon status={item.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">
            {item.displayLabel}
          </span>
          {item.expectedDayOfMonth && (
            <span className="shrink-0 text-xs text-muted-foreground">
              day {item.expectedDayOfMonth}
            </span>
          )}
        </div>
        {item.amountMin != null && item.amountMax != null && (
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            Range: {ILS.format(item.amountMin)} – {ILS.format(item.amountMax)}
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-semibold tabular-nums">
          {ILS.format(item.expectedAmount)}
        </div>
        {item.actualAmount != null && (
          <div
            className={cn(
              "text-xs tabular-nums",
              variance != null && variance > 0
                ? "text-emerald-600 dark:text-emerald-400"
                : variance != null && variance < 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-muted-foreground"
            )}
          >
            actual {ILS.format(item.actualAmount)}
            {pct != null && ` (${pct > 0 ? "+" : ""}${pct.toFixed(0)}%)`}
          </div>
        )}
      </div>
      <StatusBadge status={item.status} />
    </div>
  );
}

// ── Forecast section ───────────────────────────────────────────────────────────

function ForecastSection({
  title,
  items,
  accent,
  totalExpected,
  totalActual,
}: {
  title: string;
  items: ForecastItem[];
  accent: string;
  totalExpected: number;
  totalActual: number;
}) {
  if (items.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div
        className={cn(
          "flex items-center justify-between border-b px-4 py-3",
          accent
        )}
      >
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="text-right">
          <div className="text-sm font-semibold tabular-nums">
            {ILS.format(totalExpected)} expected
          </div>
          {totalActual > 0 && (
            <div className="text-xs text-muted-foreground tabular-nums">
              {ILS.format(totalActual)} actual
            </div>
          )}
        </div>
      </div>
      <div className="divide-y divide-border/50">
        {items.map((item) => (
          <ForecastItemRow key={item.patternId} item={item} />
        ))}
      </div>
    </div>
  );
}

// ── Summary cards ──────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  expected,
  actual,
  accent,
}: {
  label: string;
  expected: number;
  actual: number;
  accent: "income" | "expense";
}) {
  const delta = actual - expected;
  const pct = expected !== 0 ? (delta / expected) * 100 : 0;
  const accentClass =
    accent === "income"
      ? "border-l-emerald-500"
      : "border-l-rose-500";

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-4 border-l-4",
        accentClass
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-2 font-serif text-2xl font-semibold tabular-nums">
        {ILS.format(expected)}
      </div>
      <div className="mt-1 text-sm text-muted-foreground">
        expected
      </div>
      {actual > 0 && (
        <div className="mt-3 border-t pt-3">
          <div className="text-sm font-semibold tabular-nums">
            {ILS.format(actual)}{" "}
            <span
              className={cn(
                "text-xs font-normal",
                delta > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : delta < 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-muted-foreground"
              )}
            >
              ({delta >= 0 ? "+" : ""}
              {pct.toFixed(0)}%)
            </span>
          </div>
          <div className="text-xs text-muted-foreground">actual so far</div>
        </div>
      )}
    </div>
  );
}

// ── Confirm candidate dialog ───────────────────────────────────────────────────

function ConfirmCandidateDialog({
  candidate,
  open,
  onClose,
}: {
  candidate: DetectionCandidate | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [label, setLabel] = useState(candidate?.descriptionPattern ?? "");
  const [expectedAmount, setExpectedAmount] = useState(
    candidate ? String(Math.round(candidate.avgAmount)) : ""
  );
  const [frequency, setFrequency] = useState<string>(
    candidate?.frequency ?? "monthly"
  );
  const [dayOfMonth, setDayOfMonth] = useState(
    candidate ? String(candidate.expectedDayOfMonth) : ""
  );
  const [financialNature, setFinancialNature] = useState(
    candidate?.financialNature ?? "unknown"
  );
  const [cashFlowType, setCashFlowType] = useState(
    candidate?.cashFlowType ?? "unknown"
  );
  const [pnlImpact, setPnlImpact] = useState(
    candidate?.isIncomeAdvisoryOnly ? "maybe" : (candidate?.pnlImpact ?? "maybe")
  );

  const isIncome = candidate?.isIncomeAdvisoryOnly === true;

  const createMutation = useMutation({
    mutationFn: () =>
      createForecastPattern({
        displayLabel: label.trim(),
        descriptionPattern: candidate!.descriptionPattern,
        direction: candidate!.direction,
        financialNature: financialNature as import("@/lib/types").FinancialNature,
        cashFlowType: cashFlowType as import("@/lib/types").CashFlowType,
        pnlImpact: pnlImpact as import("@/lib/types").PnlImpact,
        frequency: frequency as RecurringFrequency,
        expectedAmount: expectedAmount ? Number(expectedAmount) : undefined,
        expectedDayOfMonth: dayOfMonth ? Number(dayOfMonth) : undefined,
        sourceType: "auto_detected",
        confidenceScore: candidate?.confidenceScore,
        lastSeenDate: candidate?.lastSeen,
        isUserConfirmed: true,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forecast"] });
      qc.invalidateQueries({ queryKey: ["forecast-patterns"] });
      toast.success("Pattern confirmed and added to forecast");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!candidate) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm Recurring Pattern</DialogTitle>
        </DialogHeader>

        {isIncome && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
            <strong>Income advisory:</strong> This pattern looks like income.
            Salary, owner deposits, reimbursements, and operating income all
            appear the same to the detector. Set the correct nature and P&L
            impact before confirming.
          </div>
        )}

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>Display label</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. AWS Monthly Billing"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Expected amount (ILS)</Label>
              <Input
                type="number"
                value={expectedAmount}
                onChange={(e) => setExpectedAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Day of month</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
                placeholder="1–31"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Frequency</Label>
            <Select
              value={frequency}
              onValueChange={(v) => { if (v) setFrequency(v); }}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label>Nature</Label>
              <Select
                value={financialNature}
                onValueChange={(v) => { if (v) setFinancialNature(v); }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FINANCIAL_NATURE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cash flow</Label>
              <Select
                value={cashFlowType}
                onValueChange={(v) => { if (v) setCashFlowType(v); }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CASH_FLOW_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>P&L</Label>
              <Select
                value={pnlImpact}
                onValueChange={(v) => { if (v) setPnlImpact(v); }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="maybe">Maybe</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium">Detected:</span>{" "}
            {candidate.monthsSeen}/{candidate.monthsInWindow} months ·{" "}
            {candidate.frequency} · avg {ILS.format(candidate.avgAmount)} ·
            variance {candidate.variancePct.toFixed(0)}% ·
            confidence {(candidate.confidenceScore * 100).toFixed(0)}%
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !label.trim()}
          >
            {createMutation.isPending ? "Saving..." : "Confirm Pattern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Create pattern dialog (manual) ────────────────────────────────────────────

function CreatePatternDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [descriptionPattern, setDescriptionPattern] = useState("");
  const [direction, setDirection] = useState<string>("expense");
  const [expectedAmount, setExpectedAmount] = useState("");
  const [frequency, setFrequency] = useState<string>("monthly");
  const [dayOfMonth, setDayOfMonth] = useState("");
  const [financialNature, setFinancialNature] = useState("operating_expense");
  const [cashFlowType, setCashFlowType] = useState("real_cash_out");
  const [pnlImpact, setPnlImpact] = useState("yes");
  const [isConfirmed, setIsConfirmed] = useState(true);

  const reset = () => {
    setLabel(""); setDescriptionPattern(""); setDirection("expense");
    setExpectedAmount(""); setFrequency("monthly"); setDayOfMonth("");
    setFinancialNature("operating_expense"); setCashFlowType("real_cash_out");
    setPnlImpact("yes"); setIsConfirmed(true);
  };

  const isIncome = direction === "income";

  const createMutation = useMutation({
    mutationFn: () =>
      createForecastPattern({
        displayLabel: label.trim(),
        descriptionPattern: descriptionPattern.trim() || label.trim(),
        direction: direction as "income" | "expense",
        financialNature: financialNature as import("@/lib/types").FinancialNature,
        cashFlowType: cashFlowType as import("@/lib/types").CashFlowType,
        pnlImpact: pnlImpact as import("@/lib/types").PnlImpact,
        frequency: frequency as RecurringFrequency,
        expectedAmount: expectedAmount ? Number(expectedAmount) : undefined,
        expectedDayOfMonth: dayOfMonth ? Number(dayOfMonth) : undefined,
        sourceType: "manual",
        isUserConfirmed: isConfirmed,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forecast"] });
      qc.invalidateQueries({ queryKey: ["forecast-patterns"] });
      toast.success("Pattern created");
      reset();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Recurring Pattern</DialogTitle>
        </DialogHeader>

        {isIncome && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
            <strong>Income advisory:</strong> Set the correct financial nature
            and P&L impact. Salary, owner deposits, and operating income
            require different classifications.
          </div>
        )}

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>Display label</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Office Rent"
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              Description pattern{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              value={descriptionPattern}
              onChange={(e) => setDescriptionPattern(e.target.value)}
              placeholder="Substring to match in transaction description"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Direction</Label>
              <Select
                value={direction}
                onValueChange={(v) => { if (v) setDirection(v); }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Select
                value={frequency}
                onValueChange={(v) => { if (v) setFrequency(v); }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Expected amount (ILS)</Label>
              <Input
                type="number"
                value={expectedAmount}
                onChange={(e) => setExpectedAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Day of month</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
                placeholder="1–31"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label>Nature</Label>
              <Select
                value={financialNature}
                onValueChange={(v) => { if (v) setFinancialNature(v); }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FINANCIAL_NATURE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cash flow</Label>
              <Select
                value={cashFlowType}
                onValueChange={(v) => { if (v) setCashFlowType(v); }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CASH_FLOW_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>P&L</Label>
              <Select
                value={pnlImpact}
                onValueChange={(v) => { if (v) setPnlImpact(v); }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="maybe">Maybe</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg border p-3">
            <input
              id="confirm-immediately"
              type="checkbox"
              checked={isConfirmed}
              onChange={(e) => setIsConfirmed(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <label
              htmlFor="confirm-immediately"
              className="cursor-pointer text-sm"
            >
              Add to forecast immediately (confirmed)
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { reset(); onClose(); }}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !label.trim()}
          >
            {createMutation.isPending ? "Saving..." : "Add Pattern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Candidate card in detection sheet ─────────────────────────────────────────

function CandidateCard({
  candidate,
  onConfirm,
}: {
  candidate: DetectionCandidate;
  onConfirm: (c: DetectionCandidate) => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">
              {candidate.descriptionPattern}
            </span>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] shrink-0",
                candidate.direction === "income"
                  ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                  : "border-rose-500/40 text-rose-700 dark:text-rose-300"
              )}
            >
              {candidate.direction}
            </Badge>
            {candidate.isIncomeAdvisoryOnly && (
              <Badge
                variant="outline"
                className="text-[10px] shrink-0 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              >
                advisory
              </Badge>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              {candidate.monthsSeen}/{candidate.monthsInWindow} months
            </span>
            <span>{candidate.frequency}</span>
            <span>avg {ILS.format(candidate.avgAmount)}</span>
            <span>variance {candidate.variancePct.toFixed(0)}%</span>
            <span>day ~{candidate.expectedDayOfMonth}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold tabular-nums">
            {(candidate.confidenceScore * 100).toFixed(0)}%
          </div>
          <div className="text-[10px] text-muted-foreground">confidence</div>
        </div>
      </div>

      {candidate.isIncomeAdvisoryOnly && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          Review carefully: income patterns require explicit classification
          before being included in P&L totals.
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="outline" onClick={() => onConfirm(candidate)}>
          Confirm as pattern
        </Button>
      </div>
    </div>
  );
}

// ── Detection sheet ────────────────────────────────────────────────────────────

function DetectionSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [confirmCandidate, setConfirmCandidate] =
    useState<DetectionCandidate | null>(null);
  const [showRejected, setShowRejected] = useState(false);

  const detectMutation = useMutation({
    mutationFn: runForecastDetection,
    onSuccess: (data) => setResult(data),
    onError: (e: Error) => toast.error(e.message),
  });

  const totalCandidates =
    (result?.candidates.high.length ?? 0) +
    (result?.candidates.medium.length ?? 0) +
    (result?.candidates.low.length ?? 0);

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => { if (!o) { onClose(); setResult(null); } }}>
        <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Detect Recurring Patterns</SheetTitle>
          </SheetHeader>

          <div className="mt-4 flex-1 space-y-4">
            {!result && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Scan your transaction history for recurring charges and income.
                  Results are read-only — nothing is saved until you confirm a
                  candidate.
                </p>
                <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground space-y-1">
                  <div>Grouping key: description + direction (income/expense)</div>
                  <div>Excludes: credit card payments, transfers, refunds, owner draws/deposits</div>
                  <div>Income candidates require explicit confirmation</div>
                </div>
                <Button
                  onClick={() => detectMutation.mutate()}
                  disabled={detectMutation.isPending}
                  className="w-full"
                >
                  {detectMutation.isPending ? "Scanning..." : "Run Detection"}
                </Button>
              </div>
            )}

            {result && (
              <div className="space-y-5">
                <div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
                  Detection window: {result.window.startMonth} to{" "}
                  {result.window.endMonth} ({result.window.monthsInWindow} months)
                  · {totalCandidates} candidates ·{" "}
                  {result.candidates.rejected.length} rejected
                </div>

                {totalCandidates === 0 && (
                  <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    No recurring patterns detected in this transaction history.
                  </div>
                )}

                {result.candidates.high.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-emerald-500" />
                      <h4 className="text-sm font-semibold">
                        High confidence ({result.candidates.high.length})
                      </h4>
                      <span className="text-xs text-muted-foreground">
                        variance &lt;20%
                      </span>
                    </div>
                    {result.candidates.high.map((c) => (
                      <CandidateCard
                        key={`${c.descriptionPattern}-${c.direction}`}
                        candidate={c}
                        onConfirm={setConfirmCandidate}
                      />
                    ))}
                  </div>
                )}

                {result.candidates.medium.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-amber-500" />
                      <h4 className="text-sm font-semibold">
                        Medium confidence ({result.candidates.medium.length})
                      </h4>
                      <span className="text-xs text-muted-foreground">
                        variance 20–60%
                      </span>
                    </div>
                    {result.candidates.medium.map((c) => (
                      <CandidateCard
                        key={`${c.descriptionPattern}-${c.direction}`}
                        candidate={c}
                        onConfirm={setConfirmCandidate}
                      />
                    ))}
                  </div>
                )}

                {result.candidates.low.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-rose-400" />
                      <h4 className="text-sm font-semibold">
                        Low confidence ({result.candidates.low.length})
                      </h4>
                      <span className="text-xs text-muted-foreground">
                        variance &gt;60%
                      </span>
                    </div>
                    {result.candidates.low.map((c) => (
                      <CandidateCard
                        key={`${c.descriptionPattern}-${c.direction}`}
                        candidate={c}
                        onConfirm={setConfirmCandidate}
                      />
                    ))}
                  </div>
                )}

                {result.installmentAdvisory.installmentRowCount > 0 && (
                  <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm">
                    <div className="font-medium">Installment transactions</div>
                    <div className="mt-1 text-muted-foreground">
                      {result.installmentAdvisory.installmentRowCount} installment
                      rows found.{" "}
                      {!result.installmentAdvisory.dataQualitySufficient && (
                        <span className="text-amber-700 dark:text-amber-300">
                          {result.installmentAdvisory.rowsWithMissingSequence}{" "}
                          rows have missing sequence numbers — projections
                          unavailable until data quality improves.
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {result.candidates.rejected.length > 0 && (
                  <div className="rounded-xl border bg-muted/10">
                    <button
                      type="button"
                      onClick={() => setShowRejected((v) => !v)}
                      className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
                    >
                      <span>
                        Rejected candidates (
                        {result.candidates.rejected.length})
                      </span>
                      {showRejected ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                    {showRejected && (
                      <div className="border-t px-4 pb-4 pt-3 space-y-2">
                        {result.candidates.rejected.map((r) => (
                          <div
                            key={`${r.descriptionPattern}-${r.direction}`}
                            className="text-xs text-muted-foreground"
                          >
                            <span className="font-medium text-foreground/70">
                              {r.descriptionPattern}
                            </span>{" "}
                            ({r.direction}) — {r.rejectionReason} ·{" "}
                            {r.monthsSeen} months
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setResult(null); setShowRejected(false); }}
                >
                  Run again
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmCandidateDialog
        candidate={confirmCandidate}
        open={confirmCandidate !== null}
        onClose={() => setConfirmCandidate(null)}
      />
    </>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────

function ForecastEmptyState({
  onDetect,
  onAdd,
  unconfirmedCount,
}: {
  onDetect: () => void;
  onAdd: () => void;
  unconfirmedCount: number;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
      <CalendarClock className="mb-4 h-10 w-10 text-muted-foreground/40" />
      <h3 className="font-serif text-2xl">No confirmed patterns yet</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Run detection to find recurring charges from your transaction history,
        or add a pattern manually.
      </p>
      {unconfirmedCount > 0 && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-300">
          {unconfirmedCount} unconfirmed suggestion
          {unconfirmedCount !== 1 ? "s" : ""} waiting for review
        </div>
      )}
      <div className="mt-6 flex gap-3">
        <Button onClick={onDetect} variant="outline">
          <Scan className="me-2 h-4 w-4" />
          Run Detection
        </Button>
        <Button onClick={onAdd}>
          <Plus className="me-2 h-4 w-4" />
          Add Pattern
        </Button>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function ForecastDashboardPage() {
  const [month, setMonth] = useState(currentMonth);
  const [detectionOpen, setDetectionOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const forecastQuery = useQuery({
    queryKey: ["forecast", month],
    queryFn: () => getForecastMonth(month),
  });

  const patternsQuery = useQuery({
    queryKey: ["forecast-patterns"],
    queryFn: () => listForecastPatterns(),
  });

  const data: ForecastMonth | undefined = forecastQuery.data;

  const totalItems =
    (data?.confirmedPnlIncome.length ?? 0) +
    (data?.confirmedPnlExpenses.length ?? 0) +
    (data?.confirmedNonPnlCashIn.length ?? 0) +
    (data?.confirmedNonPnlCashOut.length ?? 0) +
    (data?.uncertain.length ?? 0);

  const confirmedPatternCount =
    patternsQuery.data?.patterns.filter((p: RecurringPattern) => p.isUserConfirmed && p.isActive)
      .length ?? 0;

  const allPatternCount = patternsQuery.data?.patterns.length ?? 0;
  const unconfirmedCount = allPatternCount - confirmedPatternCount;

  return (
    <>
      <PageHeader
        title="Forecast"
        meta="Expected cash movements from confirmed recurring patterns"
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDetectionOpen(true)}
            >
              <Scan className="me-2 h-4 w-4" />
              Run Detection
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="me-2 h-4 w-4" />
              Add Pattern
            </Button>
          </div>
        }
      />

      <main className="space-y-6 p-4 md:p-6 lg:p-8">
        {/* Month nav */}
        <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
          <button
            type="button"
            onClick={() => setMonth(prevMonth)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            {formatMonthDisplay(prevMonth(month))}
          </button>
          <div className="text-base font-semibold">{formatMonthDisplay(month)}</div>
          <button
            type="button"
            onClick={() => setMonth(nextMonth)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {formatMonthDisplay(nextMonth(month))}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Loading */}
        {forecastQuery.isLoading && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Loading forecast...
          </div>
        )}

        {/* Unconfirmed suggestions banner */}
        {data && data.unconfirmedSuggestionCount > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
            <strong>{data.unconfirmedSuggestionCount} unconfirmed pattern
            {data.unconfirmedSuggestionCount !== 1 ? "s" : ""}</strong> detected
            but not yet confirmed. Confirm them to include them in this forecast.
            <button
              type="button"
              onClick={() => setDetectionOpen(true)}
              className="ms-2 underline underline-offset-4 hover:no-underline"
            >
              Run detection
            </button>
          </div>
        )}

        {/* Summary cards */}
        {data && totalItems > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <SummaryCard
              label="P&L Income"
              expected={data.totalExpectedPnlIncome}
              actual={data.totalActualPnlIncome}
              accent="income"
            />
            <SummaryCard
              label="P&L Expenses"
              expected={data.totalExpectedPnlExpenses}
              actual={data.totalActualPnlExpenses}
              accent="expense"
            />
          </div>
        )}

        {/* Empty state */}
        {data && totalItems === 0 && (
          <ForecastEmptyState
            onDetect={() => setDetectionOpen(true)}
            onAdd={() => setCreateOpen(true)}
            unconfirmedCount={unconfirmedCount}
          />
        )}

        {/* Forecast sections */}
        {data && totalItems > 0 && (
          <div className="space-y-4">
            <ForecastSection
              title="P&L Expenses"
              items={data.confirmedPnlExpenses}
              accent="bg-rose-500/5"
              totalExpected={data.totalExpectedPnlExpenses}
              totalActual={data.totalActualPnlExpenses}
            />
            <ForecastSection
              title="P&L Income"
              items={data.confirmedPnlIncome}
              accent="bg-emerald-500/5"
              totalExpected={data.totalExpectedPnlIncome}
              totalActual={data.totalActualPnlIncome}
            />
            <ForecastSection
              title="Non-P&L Cash Out"
              items={data.confirmedNonPnlCashOut}
              accent="bg-sky-500/5"
              totalExpected={data.confirmedNonPnlCashOut.reduce(
                (s, i) => s + i.expectedAmount,
                0
              )}
              totalActual={data.confirmedNonPnlCashOut.reduce(
                (s, i) => s + (i.actualAmount ?? 0),
                0
              )}
            />
            <ForecastSection
              title="Non-P&L Cash In"
              items={data.confirmedNonPnlCashIn}
              accent="bg-teal-500/5"
              totalExpected={data.confirmedNonPnlCashIn.reduce(
                (s, i) => s + i.expectedAmount,
                0
              )}
              totalActual={data.confirmedNonPnlCashIn.reduce(
                (s, i) => s + (i.actualAmount ?? 0),
                0
              )}
            />
            <ForecastSection
              title="Uncertain"
              items={data.uncertain}
              accent="bg-muted/30"
              totalExpected={data.uncertain.reduce(
                (s, i) => s + i.expectedAmount,
                0
              )}
              totalActual={data.uncertain.reduce(
                (s, i) => s + (i.actualAmount ?? 0),
                0
              )}
            />
          </div>
        )}

        {/* Installment advisory */}
        {data?.installmentAdvisory.installmentRowCount != null &&
          data.installmentAdvisory.installmentRowCount > 0 && (
            <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm">
              <div className="font-medium">Installment transactions</div>
              <div className="mt-1 text-muted-foreground">
                {data.installmentAdvisory.installmentRowCount} installment rows
                in your history.{" "}
                {!data.installmentAdvisory.dataQualitySufficient ? (
                  <span>
                    {data.installmentAdvisory.rowsWithMissingSequence} have
                    missing sequence fields — projections will be available once
                    import adapters populate installment_number and
                    installment_total.
                  </span>
                ) : (
                  <span>
                    {data.installmentAdvisory.projections.length} projections
                    available.
                  </span>
                )}
              </div>
            </div>
          )}

        {/* Footer note */}
        <div className="rounded-xl border bg-muted/10 px-4 py-3 text-xs text-muted-foreground">
          Forecast is advisory only. Confirmed patterns never modify existing
          transactions or financial totals. Only{" "}
          <strong>confirmed and active</strong> patterns appear here.
        </div>
      </main>

      <DetectionSheet
        open={detectionOpen}
        onClose={() => setDetectionOpen(false)}
      />
      <CreatePatternDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </>
  );
}
