"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { createTransaction, listBusinessUnits } from "@/lib/api";
import type { BusinessUnitRecord, Category } from "@/lib/types";

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

const today = () => new Date().toISOString().slice(0, 10);

interface Props {
  categories: Category[];
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function TransactionCreateDialog({ categories, open, onClose, onCreated }: Props) {
  const queryClient = useQueryClient();

  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"expense" | "income">("expense");
  const [categoryId, setCategoryId] = useState<string>("none");
  const [businessUnit, setBusinessUnit] = useState<string>("none");
  const [financialNature, setFinancialNature] = useState("unknown");
  const [cashFlowType, setCashFlowType] = useState("unknown");
  const [pnlImpact, setPnlImpact] = useState("maybe");
  const [note, setNote] = useState("");

  const { data: businessUnits = [] } = useQuery<BusinessUnitRecord[]>({
    queryKey: ["business-units"],
    queryFn: () => listBusinessUnits(),
  });

  const parentCategories = categories.filter((c) => c.parentId === null);
  const leafCategories = categories.filter((c) => c.parentId !== null);

  const reset = () => {
    setDate(today());
    setDescription("");
    setAmount("");
    setDirection("expense");
    setCategoryId("none");
    setBusinessUnit("none");
    setFinancialNature("unknown");
    setCashFlowType("unknown");
    setPnlImpact("maybe");
    setNote("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const createMutation = useMutation({
    mutationFn: () => {
      const parsedAmount = parseFloat(amount);
      if (!description.trim()) throw new Error("Description is required");
      if (isNaN(parsedAmount) || parsedAmount <= 0) throw new Error("Amount must be a positive number");
      if (!date) throw new Error("Date is required");
      return createTransaction({
        date,
        description: description.trim(),
        amount: parsedAmount,
        direction,
        categoryId: categoryId === "none" ? null : Number(categoryId),
        businessUnit: businessUnit === "none" ? null : businessUnit,
        financialNature,
        cashFlowType,
        pnlImpact,
        note: note.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success("Transaction created");
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["transactions-summary"] });
      queryClient.invalidateQueries({ queryKey: ["business-units"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      reset();
      onCreated();
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Create failed");
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl font-normal">
            Add Manual Transaction
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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
              <Label>Direction</Label>
              <Select
                value={direction}
                onValueChange={(v) => { if (v) setDirection(v as "expense" | "income"); }}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What was this transaction?"
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Amount (ILS)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="h-9"
            />
          </div>

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
                {businessUnits.map((bu) => (
                  <SelectItem key={bu.slug} value={bu.slug}>{bu.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
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

          <div className="space-y-1.5">
            <Label>Note <span className="text-muted-foreground">(optional)</span></Label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note..."
              rows={2}
              className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "Creating..." : "Add Transaction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
