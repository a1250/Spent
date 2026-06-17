"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listBusinessUnits,
  updateTransaction,
  voidTransaction,
  unvoidTransaction,
  updateTransactionAmount,
} from "@/lib/api";
import { formatCurrency } from "@/lib/formatters";
import type {
  BusinessUnitRecord,
  Category,
  TransactionWithCategory,
} from "@/lib/types";

const FINANCIAL_NATURE_OPTIONS = [
  { value: "operating_income", label: "Operating Income" },
  { value: "operating_expense", label: "Operating Expense" },
  { value: "credit_card_payment", label: "Credit Card Payment" },
  { value: "refund", label: "Refund" },
  { value: "working_capital", label: "Working Capital" },
  { value: "internal_transfer", label: "Internal Transfer" },
  { value: "owner_deposit", label: "Owner Deposit" },
  { value: "owner_draw", label: "Owner Draw" },
  { value: "investment", label: "Investment" },
  { value: "receivable_collection", label: "Receivable Collection" },
  { value: "payable_payment", label: "Payable Payment" },
  { value: "loan_received", label: "Loan Received" },
  { value: "loan_repayment", label: "Loan Repayment" },
  { value: "tax", label: "Tax" },
  { value: "unknown", label: "Unknown" },
];

const CASH_FLOW_OPTIONS = [
  { value: "real_cash_in", label: "Cash In" },
  { value: "real_cash_out", label: "Cash Out" },
  { value: "internal_transfer", label: "Internal Transfer" },
  { value: "non_cash", label: "Non-Cash" },
  { value: "pending", label: "Pending" },
  { value: "unknown", label: "Unknown" },
];

const PNL_IMPACT_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "maybe", label: "Maybe" },
];

const CLASSIFICATION_STATUS_OPTIONS = [
  { value: "manually_approved", label: "Approved" },
  { value: "auto_classified", label: "Auto-classified" },
  { value: "needs_review", label: "Needs Review" },
];

const KIND_OPTIONS = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
];

interface Props {
  transaction: TransactionWithCategory;
  categories: Category[];
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function TransactionDetailSheet({
  transaction,
  categories,
  open,
  onClose,
  onSaved,
}: Props) {
  const queryClient = useQueryClient();
  const isManual = transaction.provider === "manual";

  const [date, setDate] = useState(transaction.date.slice(0, 10));
  const [description, setDescription] = useState(transaction.description);
  const [counterparty, setCounterparty] = useState(transaction.counterparty ?? "");
  const [categoryId, setCategoryId] = useState<string>(
    transaction.categoryId != null ? String(transaction.categoryId) : "none"
  );
  const [kind, setKind] = useState(transaction.kind);
  const [financialNature, setFinancialNature] = useState(transaction.financialNature);
  const [cashFlowType, setCashFlowType] = useState(transaction.cashFlowType);
  const [pnlImpact, setPnlImpact] = useState(transaction.pnlImpact);
  const [classificationStatus, setClassificationStatus] = useState(
    transaction.classificationStatus
  );
  const [businessUnit, setBusinessUnit] = useState<string>(
    transaction.businessUnit ?? "none"
  );
  const [note, setNote] = useState(transaction.note ?? "");

  // Amount editing — only for manual transactions
  const [amountStr, setAmountStr] = useState(
    String(Math.abs(transaction.chargedAmount))
  );
  const [amountDirty, setAmountDirty] = useState(false);

  // Void confirmation UI
  const [confirmingVoid, setConfirmingVoid] = useState(false);
  const [voidReason, setVoidReason] = useState("");

  useEffect(() => {
    setDate(transaction.date.slice(0, 10));
    setDescription(transaction.description);
    setCounterparty(transaction.counterparty ?? "");
    setCategoryId(transaction.categoryId != null ? String(transaction.categoryId) : "none");
    setKind(transaction.kind);
    setFinancialNature(transaction.financialNature);
    setCashFlowType(transaction.cashFlowType);
    setPnlImpact(transaction.pnlImpact);
    setClassificationStatus(transaction.classificationStatus);
    setBusinessUnit(transaction.businessUnit ?? "none");
    setNote(transaction.note ?? "");
    setAmountStr(String(Math.abs(transaction.chargedAmount)));
    setAmountDirty(false);
    setConfirmingVoid(false);
    setVoidReason("");
  }, [transaction]);

  const { data: businessUnits = [] } = useQuery<BusinessUnitRecord[]>({
    queryKey: ["business-units"],
    queryFn: () => listBusinessUnits(),
  });

  const activeBusinessUnits = businessUnits.filter((bu) => bu.isActive);

  const parentCategories = categories.filter((c) => c.parentId === null);
  const leafCategories = categories.filter((c) => c.parentId !== null);

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    queryClient.invalidateQueries({ queryKey: ["transactions-summary"] });
    queryClient.invalidateQueries({ queryKey: ["business-units"] });
    queryClient.invalidateQueries({ queryKey: ["reports"] });
    queryClient.invalidateQueries({ queryKey: ["audit-log"] });
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const patch: Parameters<typeof updateTransaction>[1] = {};
      if (date !== transaction.date.slice(0, 10)) patch.date = date;
      if (description !== transaction.description) patch.description = description;
      const cp = counterparty.trim() || null;
      if (cp !== (transaction.counterparty ?? null)) patch.counterparty = cp;
      const catId = categoryId === "none" ? null : Number(categoryId);
      if (catId !== transaction.categoryId) patch.categoryId = catId;
      if (kind !== transaction.kind) patch.kind = kind;
      if (financialNature !== transaction.financialNature) patch.financialNature = financialNature;
      if (cashFlowType !== transaction.cashFlowType) patch.cashFlowType = cashFlowType;
      if (pnlImpact !== transaction.pnlImpact) patch.pnlImpact = pnlImpact;
      if (classificationStatus !== transaction.classificationStatus)
        patch.classificationStatus = classificationStatus;
      const bu = businessUnit === "none" ? null : businessUnit;
      if (bu !== (transaction.businessUnit ?? null)) patch.businessUnit = bu;
      const n = note.trim() || null;
      if (n !== (transaction.note ?? null)) patch.note = n;

      const hasPatch = Object.keys(patch).length > 0;
      const hasAmountChange = isManual && amountDirty;

      if (!hasPatch && !hasAmountChange) return;

      if (hasPatch) await updateTransaction(transaction.id, patch);

      if (hasAmountChange) {
        const newAmount = parseFloat(amountStr);
        if (!isNaN(newAmount) && newAmount > 0) {
          const signed =
            transaction.chargedAmount < 0 ? -Math.abs(newAmount) : Math.abs(newAmount);
          await updateTransactionAmount(transaction.id, signed);
        }
      }
    },
    onSuccess: () => {
      toast.success("Transaction saved");
      invalidateAll();
      onSaved();
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Save failed");
    },
  });

  const voidMutation = useMutation({
    mutationFn: () =>
      voidTransaction(transaction.id, voidReason.trim() || "voided by user"),
    onSuccess: () => {
      toast.success("Transaction voided");
      invalidateAll();
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Void failed");
    },
  });

  const unvoidMutation = useMutation({
    mutationFn: () => unvoidTransaction(transaction.id),
    onSuccess: () => {
      toast.success("Transaction restored");
      invalidateAll();
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Restore failed");
    },
  });

  const amountDisplay = formatCurrency(Math.abs(transaction.chargedAmount), "ILS");
  const isIncome = transaction.chargedAmount > 0;
  const isVoided = transaction.isExcluded && transaction.voidReason != null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="font-serif text-xl font-normal">
            Edit Transaction
          </SheetTitle>
          <div className="mt-1 rounded-lg bg-muted/40 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="font-medium">{transaction.description}</span>
              {transaction.provider === "manual" && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                  Manual
                </span>
              )}
              {isVoided && (
                <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
                  Voided
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {transaction.date.slice(0, 10)} &middot;{" "}
              <span style={{ color: isIncome ? "var(--status-on-track)" : "var(--status-over)" }}>
                {isIncome ? "+" : "-"}{amountDisplay}
              </span>
            </div>
            {isVoided && transaction.voidReason && (
              <p className="mt-1 text-xs text-destructive/80">
                Void reason: {transaction.voidReason}
              </p>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Details */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Details
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Kind</Label>
                <Select value={kind} onValueChange={(v) => { if (v) setKind(v as typeof kind); }}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KIND_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Amount — editable only for manual transactions */}
            <div className="space-y-1.5">
              <Label>
                Amount (ILS)
                {!isManual && (
                  <span className="ms-2 text-xs text-muted-foreground font-normal">
                    — read-only for imported transactions
                  </span>
                )}
              </Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={amountStr}
                onChange={(e) => {
                  setAmountStr(e.target.value);
                  setAmountDirty(true);
                }}
                disabled={!isManual}
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Counterparty</Label>
              <Input
                value={counterparty}
                onChange={(e) => setCounterparty(e.target.value)}
                placeholder="Optional"
                className="h-9"
              />
            </div>
          </div>

          {/* Classification */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Classification
            </h3>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={(v) => { if (v) setCategoryId(v); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {parentCategories.map((parent) => {
                    const children = leafCategories.filter((l) => l.parentId === parent.id);
                    if (children.length === 0) return null;
                    return (
                      <SelectGroup key={parent.id}>
                        <SelectLabel>{parent.name}</SelectLabel>
                        {children.map((cat) => (
                          <SelectItem key={cat.id} value={String(cat.id)}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Business Unit</Label>
              <Select value={businessUnit} onValueChange={(v) => { if (v) setBusinessUnit(v); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {activeBusinessUnits.map((bu) => (
                    <SelectItem key={bu.slug} value={bu.slug}>{bu.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={classificationStatus} onValueChange={(v) => { if (v) setClassificationStatus(v); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLASSIFICATION_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Accounting */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Accounting
            </h3>
            <div className="space-y-1.5">
              <Label>Financial Nature</Label>
              <Select value={financialNature} onValueChange={(v) => { if (v) setFinancialNature(v); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FINANCIAL_NATURE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cash Flow</Label>
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
                <Label>P&L Impact</Label>
                <Select value={pnlImpact} onValueChange={(v) => { if (v) setPnlImpact(v); }}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PNL_IMPACT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label>Note</Label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note..."
              rows={3}
              className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring"
            />
          </div>

          {/* Read-only metadata */}
          {(transaction.importBatchId != null || transaction.accountLabel) && (
            <div className="space-y-1 rounded-lg border bg-muted/20 px-3 py-2">
              <p className="text-xs font-medium text-muted-foreground">Source</p>
              {transaction.accountLabel && (
                <p className="text-xs text-muted-foreground">{transaction.accountLabel}</p>
              )}
              {transaction.importBatchId != null && (
                <p className="text-xs text-muted-foreground">
                  Batch #{transaction.importBatchId}
                  {transaction.importRowId != null ? ` · Row #${transaction.importRowId}` : ""}
                </p>
              )}
            </div>
          )}

          {/* Void / unvoid section */}
          <div className="rounded-lg border border-destructive/20 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive/70" />
              <p className="text-xs font-semibold text-destructive/80 uppercase tracking-wide">
                {isVoided ? "Voided" : "Danger zone"}
              </p>
            </div>

            {isVoided ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  This transaction is excluded from all financial totals.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => unvoidMutation.mutate()}
                  disabled={unvoidMutation.isPending}
                >
                  {unvoidMutation.isPending ? "Restoring..." : "Restore transaction"}
                </Button>
              </div>
            ) : confirmingVoid ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Voided transactions are excluded from P&L and cash flow totals but remain in the database.
                </p>
                <Input
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="Reason (optional)"
                  className="h-8 text-xs"
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => voidMutation.mutate()}
                    disabled={voidMutation.isPending}
                  >
                    {voidMutation.isPending ? "Voiding..." : "Confirm void"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => { setConfirmingVoid(false); setVoidReason(""); }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmingVoid(true)}
              >
                Void transaction
              </Button>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={saveMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || isVoided}
          >
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
