"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Switch } from "@/components/ui/switch";
import { listBusinessUnits, updateTransactionLearning } from "@/lib/api";
import type {
  BusinessUnit,
  CashFlowType,
  Category,
  FinancialNature,
  LearningApplyScope,
  LearningRuleMatchType,
  PnlImpact,
  TransactionWithCategory,
} from "@/lib/types";

const FINANCIAL_NATURE_LABELS: Record<FinancialNature, string> = {
  operating_income: "הכנסה תפעולית",
  operating_expense: "הוצאה תפעולית",
  refund: "זיכוי / החזר",
  working_capital: "הון חוזר",
  internal_transfer: "העברה פנימית",
  owner_deposit: "הפקדת בעלים",
  owner_draw: "משיכת בעלים",
  investment: "השקעה",
  receivable_collection: "גביית חוב",
  payable_payment: "תשלום חוב",
  loan_received: "קבלת הלוואה",
  loan_repayment: "פירעון הלוואה",
  tax: "מס",
  unknown: "לא ידוע",
};

const CASH_FLOW_LABELS: Record<CashFlowType, string> = {
  real_cash_in: "תזרים נכנס",
  real_cash_out: "תזרים יוצא",
  internal_transfer: "העברה פנימית",
  non_cash: "ללא תנועת מזומן",
  pending: "ממתין",
  unknown: "לא ידוע",
};

interface TransactionLearningDialogProps {
  transaction: TransactionWithCategory;
  categories: Category[];
  initialCategoryId: number | null;
  onClose: () => void;
  onSaved: () => void;
}

export function TransactionLearningDialog({
  transaction,
  categories,
  initialCategoryId,
  onClose,
  onSaved,
}: TransactionLearningDialogProps) {
  const [categoryId, setCategoryId] = useState(
    initialCategoryId == null ? "none" : String(initialCategoryId)
  );
  const [financialNature, setFinancialNature] = useState(
    transaction.financialNature
  );
  const [cashFlowType, setCashFlowType] = useState(transaction.cashFlowType);
  const [pnlImpact, setPnlImpact] = useState(transaction.pnlImpact);
  const [businessUnit, setBusinessUnit] = useState<BusinessUnit | "none">(
    transaction.businessUnit ?? "none"
  );
  const [applyScope, setApplyScope] =
    useState<LearningApplyScope>("row");
  const [saveAsRule, setSaveAsRule] = useState(false);
  const [ruleMatchType, setRuleMatchType] =
    useState<LearningRuleMatchType>(
      transaction.counterparty?.trim()
        ? "merchant_contains"
        : "description_contains"
    );
  const canApplyBatch =
    transaction.importBatchId != null && transaction.importRowId != null;
  const needsMatcher = applyScope === "batch_similar" || saveAsRule;

  const { data: businessUnits = [] } = useQuery({
    queryKey: ["business-units"],
    queryFn: listBusinessUnits,
  });

  const parentCategories = categories.filter((c) => c.parentId === null);
  const leafCategories = categories.filter((c) => c.parentId !== null);

  const mutation = useMutation({
    mutationFn: () =>
      updateTransactionLearning(transaction.id, {
        categoryId: categoryId === "none" ? null : Number(categoryId),
        financialNature,
        cashFlowType,
        pnlImpact,
        businessUnit: businessUnit === "none" ? null : businessUnit,
        applyScope,
        saveAsRule,
        ...(needsMatcher ? { ruleMatchType } : {}),
      }),
    onSuccess: (result) => {
      const suffix =
        result.affectedRows > 1 ? ` (${result.affectedRows} שורות)` : "";
      toast.success(
        result.ruleId
          ? `התיקון נשמר ונוצר כלל עתידי${suffix}`
          : `התיקון נשמר${suffix}`
      );
      onSaved();
      onClose();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "שגיאה בשמירה");
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogTitle className="font-serif text-xl font-normal">
          עריכת סיווג ולמידה
        </DialogTitle>

        <div className="rounded-lg bg-muted/40 px-3 py-2">
          <div className="font-medium">{transaction.description}</div>
          <div className="text-xs text-muted-foreground">
            {transaction.date} · {transaction.chargedAmount.toLocaleString("he-IL")} ₪
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>קטגוריה</Label>
            <Select
              value={categoryId}
              onValueChange={(value) => {
                if (value) setCategoryId(value);
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">ללא קטגוריה</SelectItem>
                {parentCategories.map((parent) => {
                  const children = leafCategories.filter(
                    (l) => l.parentId === parent.id
                  );
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
            <Label>סיווג פיננסי</Label>
            <Select
              value={financialNature}
              onValueChange={(value) =>
                setFinancialNature(value as FinancialNature)
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FINANCIAL_NATURE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>סוג תזרים</Label>
            <Select
              value={cashFlowType}
              onValueChange={(value) =>
                setCashFlowType(value as CashFlowType)
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CASH_FLOW_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>תרומה לרווח/הפסד</Label>
            <Select
              value={pnlImpact}
              onValueChange={(value) => setPnlImpact(value as PnlImpact)}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">כן</SelectItem>
                <SelectItem value="no">לא</SelectItem>
                <SelectItem value="maybe">אולי</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>יחידה עסקית</Label>
            <Select
              value={businessUnit}
              onValueChange={(value) =>
                setBusinessUnit(value as BusinessUnit | "none")
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">לא הוגדר</SelectItem>
                {businessUnits.map((bu) => (
                  <SelectItem key={bu.slug} value={bu.slug}>
                    {bu.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>החלת התיקון</Label>
            <Select
              value={applyScope}
              onValueChange={(value) =>
                setApplyScope(value as LearningApplyScope)
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="row">רק על העסקה הזו</SelectItem>
                {canApplyBatch && (
                  <SelectItem value="batch_similar">
                    על כל השורות הדומות בייבוא הזה
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div>
              <Label htmlFor={`transaction-rule-${transaction.id}`}>
                שמור ככלל עתידי
              </Label>
              <p className="text-xs text-muted-foreground">
                חוק ייווצר רק לאחר בחירה מפורשת
              </p>
            </div>
            <Switch
              id={`transaction-rule-${transaction.id}`}
              checked={saveAsRule}
              onCheckedChange={setSaveAsRule}
            />
          </div>

          {needsMatcher && (
            <div className="space-y-1.5">
              <Label>אופן התאמה</Label>
              <Select
                value={ruleMatchType}
                onValueChange={(value) =>
                  setRuleMatchType(value as LearningRuleMatchType)
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {transaction.counterparty?.trim() && (
                    <>
                      <SelectItem value="merchant_contains">
                        שם בית העסק מכיל
                      </SelectItem>
                      <SelectItem value="exact_merchant">
                        שם בית עסק מדויק
                      </SelectItem>
                      <SelectItem value="exact_counterparty">
                        צד נגדי מדויק
                      </SelectItem>
                    </>
                  )}
                  {(transaction.cleanDescription ?? transaction.description).trim() && (
                    <SelectItem value="description_contains">
                      התיאור מכיל
                    </SelectItem>
                  )}
                  {transaction.sourceCategory?.trim() && (
                    <SelectItem value="source_category">
                      קטגוריית מקור מדויקת
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            ביטול
          </Button>
          <Button
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "שומר..." : "שמור ואשר"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
