"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronRight,
  MinusCircle,
  Plus,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
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
  SheetDescription,
} from "@/components/ui/sheet";
import { SectionShell } from "@/components/settings/section-shell";
import {
  createForecastPattern,
  listForecastPatterns,
  updateForecastPattern,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  RecurringFrequency,
  RecurringPattern,
} from "@/lib/types";

// ── Constants ──────────────────────────────────────────────────────────────────

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

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
  { value: "bimonthly", label: "Bimonthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
  { value: "irregular", label: "Irregular" },
];

const SOURCE_LABELS: Record<string, string> = {
  auto_detected: "Detected",
  manual: "Manual",
  installment: "Installment",
  rule_derived: "Rule",
};

// ── Pattern row ────────────────────────────────────────────────────────────────

function PatternRow({
  pattern,
  onSelect,
}: {
  pattern: RecurringPattern;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-muted/50"
      >
        <div className="shrink-0">
          {pattern.isActive ? (
            pattern.isUserConfirmed ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <div className="h-4 w-4 rounded-full border-2 border-amber-400 bg-amber-400/20" />
            )
          ) : (
            <MinusCircle className="h-4 w-4 text-muted-foreground/50" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="truncate text-sm font-medium">
              {pattern.displayLabel}
            </span>
            <Badge
              variant="outline"
              className={cn(
                "shrink-0 text-[10px]",
                pattern.direction === "income"
                  ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                  : "border-rose-500/40 text-rose-700 dark:text-rose-300"
              )}
            >
              {pattern.direction}
            </Badge>
            <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
              {SOURCE_LABELS[pattern.sourceType] ?? pattern.sourceType}
            </Badge>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            <span>{pattern.frequency}</span>
            {pattern.expectedAmount != null && (
              <span>{ILS.format(pattern.expectedAmount)}</span>
            )}
            {pattern.expectedDayOfMonth != null && (
              <span>day {pattern.expectedDayOfMonth}</span>
            )}
            {!pattern.isActive && (
              <span className="text-muted-foreground/60">inactive</span>
            )}
            {pattern.isActive && !pattern.isUserConfirmed && (
              <span className="text-amber-600 dark:text-amber-400">
                pending confirmation
              </span>
            )}
          </div>
        </div>

        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
      </button>
    </li>
  );
}

// ── Pattern edit sheet ─────────────────────────────────────────────────────────

function PatternEditSheet({
  pattern,
  onClose,
}: {
  pattern: RecurringPattern | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const [label, setLabel] = useState(pattern?.displayLabel ?? "");
  const [expectedAmount, setExpectedAmount] = useState(
    pattern?.expectedAmount != null ? String(pattern.expectedAmount) : ""
  );
  const [frequency, setFrequency] = useState(
    pattern?.frequency ?? "monthly"
  );
  const [dayOfMonth, setDayOfMonth] = useState(
    pattern?.expectedDayOfMonth != null
      ? String(pattern.expectedDayOfMonth)
      : ""
  );
  const [financialNature, setFinancialNature] = useState(
    pattern?.financialNature ?? "unknown"
  );
  const [cashFlowType, setCashFlowType] = useState(
    pattern?.cashFlowType ?? "unknown"
  );
  const [pnlImpact, setPnlImpact] = useState(pattern?.pnlImpact ?? "maybe");

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof updateForecastPattern>[1]) =>
      updateForecastPattern(pattern!.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forecast-patterns"] });
      qc.invalidateQueries({ queryKey: ["forecast"] });
      toast.success("Pattern updated");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: () =>
      updateForecastPattern(pattern!.id, {
        isActive: !pattern!.isActive,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forecast-patterns"] });
      qc.invalidateQueries({ queryKey: ["forecast"] });
      toast.success(
        pattern?.isActive ? "Pattern deactivated" : "Pattern reactivated"
      );
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleConfirmedMutation = useMutation({
    mutationFn: () =>
      updateForecastPattern(pattern!.id, {
        isUserConfirmed: !pattern!.isUserConfirmed,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forecast-patterns"] });
      qc.invalidateQueries({ queryKey: ["forecast"] });
      toast.success(
        pattern?.isUserConfirmed
          ? "Pattern moved to unconfirmed"
          : "Pattern confirmed"
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!pattern) return null;

  const isIncome = pattern.direction === "income";

  return (
    <Sheet open={pattern !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{pattern.displayLabel}</SheetTitle>
          <SheetDescription>
            {SOURCE_LABELS[pattern.sourceType] ?? pattern.sourceType} ·{" "}
            {pattern.direction} · {pattern.descriptionPattern}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex-1 space-y-6">
          {isIncome && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
              Income pattern: verify financial nature and P&L impact before
              confirming.
            </div>
          )}

          {/* Status controls */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={pattern.isUserConfirmed ? "outline" : "default"}
              onClick={() => toggleConfirmedMutation.mutate()}
              disabled={toggleConfirmedMutation.isPending}
            >
              {pattern.isUserConfirmed
                ? "Unconfirm pattern"
                : "Confirm pattern"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => toggleActiveMutation.mutate()}
              disabled={toggleActiveMutation.isPending}
            >
              <RotateCcw className="me-1.5 h-3.5 w-3.5" />
              {pattern.isActive ? "Deactivate" : "Reactivate"}
            </Button>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Display label</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
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

            {/* Metadata */}
            <div className="rounded-lg bg-muted/40 px-3 py-3 text-xs text-muted-foreground space-y-1">
              {pattern.confidenceScore != null && (
                <div>Detection confidence: {(pattern.confidenceScore * 100).toFixed(0)}%</div>
              )}
              {pattern.lastSeenDate && (
                <div>Last seen: {pattern.lastSeenDate}</div>
              )}
              <div>Created: {new Date(pattern.createdAt).toLocaleDateString()}</div>
            </div>
          </div>
        </div>

        <div className="mt-4 border-t pt-4">
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() =>
                updateMutation.mutate({
                  displayLabel: label.trim(),
                  financialNature: financialNature as import("@/lib/types").FinancialNature,
                  cashFlowType: cashFlowType as import("@/lib/types").CashFlowType,
                  pnlImpact: pnlImpact as import("@/lib/types").PnlImpact,
                  frequency: frequency as RecurringFrequency,
                  expectedAmount: expectedAmount ? Number(expectedAmount) : null,
                  expectedDayOfMonth: dayOfMonth ? Number(dayOfMonth) : null,
                })
              }
              disabled={updateMutation.isPending || !label.trim()}
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Create pattern dialog ──────────────────────────────────────────────────────

function NewPatternDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [descriptionPattern, setDescriptionPattern] = useState("");
  const [direction, setDirection] = useState("expense");
  const [expectedAmount, setExpectedAmount] = useState("");
  const [frequency, setFrequency] = useState("monthly");
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
      qc.invalidateQueries({ queryKey: ["forecast-patterns"] });
      qc.invalidateQueries({ queryKey: ["forecast"] });
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

        {direction === "income" && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
            Income patterns require explicit nature and P&L impact before being
            included in forecast totals.
          </div>
        )}

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>Display label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Office Rent" />
          </div>
          <div className="space-y-1.5">
            <Label>Description pattern <span className="text-muted-foreground">(optional)</span></Label>
            <Input value={descriptionPattern} onChange={(e) => setDescriptionPattern(e.target.value)} placeholder="Substring to match in transaction description" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Direction</Label>
              <Select value={direction} onValueChange={(v) => { if (v) setDirection(v); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={(v) => { if (v) setFrequency(v); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount (ILS)</Label>
              <Input type="number" value={expectedAmount} onChange={(e) => setExpectedAmount(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Day of month</Label>
              <Input type="number" min={1} max={31} value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} placeholder="1–31" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label>Nature</Label>
              <Select value={financialNature} onValueChange={(v) => { if (v) setFinancialNature(v); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FINANCIAL_NATURE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cash flow</Label>
              <Select value={cashFlowType} onValueChange={(v) => { if (v) setCashFlowType(v); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CASH_FLOW_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>P&L</Label>
              <Select value={pnlImpact} onValueChange={(v) => { if (v) setPnlImpact(v); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="maybe">Maybe</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border p-3">
            <input id="new-confirm" type="checkbox" checked={isConfirmed} onChange={(e) => setIsConfirmed(e.target.checked)} className="h-4 w-4 rounded border-border accent-primary" />
            <label htmlFor="new-confirm" className="cursor-pointer text-sm">Add to forecast immediately (confirmed)</label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => { reset(); onClose(); }} disabled={createMutation.isPending}>Cancel</Button>
          <Button size="sm" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !label.trim()}>
            {createMutation.isPending ? "Saving..." : "Add Pattern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function RecurringPatternsPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "confirmed" | "unconfirmed">("all");

  const { data } = useQuery({
    queryKey: ["forecast-patterns"],
    queryFn: () => listForecastPatterns({ activeOnly: false }),
  });

  const patterns = data?.patterns ?? [];
  const selected = patterns.find((p: RecurringPattern) => p.id === selectedId) ?? null;

  const active = patterns.filter((p: RecurringPattern) => p.isActive);
  const inactive = patterns.filter((p: RecurringPattern) => !p.isActive);
  const confirmed = active.filter((p: RecurringPattern) => p.isUserConfirmed);
  const unconfirmed = active.filter((p: RecurringPattern) => !p.isUserConfirmed);

  const displayed =
    filter === "confirmed"
      ? confirmed
      : filter === "unconfirmed"
        ? unconfirmed
        : active;

  return (
    <>
      <SectionShell
        title="Recurring Patterns"
        description="Manage expected recurring charges and income. Confirmed patterns appear in the Forecast report."
      >
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "confirmed", "unconfirmed"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === f
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              )}
            >
              {f === "all"
                ? `All (${active.length})`
                : f === "confirmed"
                  ? `Confirmed (${confirmed.length})`
                  : `Pending (${unconfirmed.length})`}
            </button>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="ms-auto"
            onClick={() => setNewOpen(true)}
          >
            <Plus className="me-1.5 h-3.5 w-3.5" />
            Add pattern
          </Button>
        </div>

        {!data ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : displayed.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            {filter === "confirmed"
              ? "No confirmed patterns. Confirm a detected candidate or add one manually."
              : filter === "unconfirmed"
                ? "No pending patterns."
                : "No recurring patterns yet. Use Run Detection from the Forecast report or add one manually."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <ul className="divide-y divide-border/60">
              {displayed.map((p: RecurringPattern) => (
                <PatternRow
                  key={p.id}
                  pattern={p}
                  onSelect={() => setSelectedId(p.id)}
                />
              ))}
            </ul>
          </div>
        )}

        {inactive.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {inactive.length} inactive pattern
            {inactive.length !== 1 ? "s" : ""} hidden. Open a pattern to
            reactivate it.
          </p>
        )}
      </SectionShell>

      <PatternEditSheet
        pattern={selected}
        onClose={() => setSelectedId(null)}
      />
      <NewPatternDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </>
  );
}
