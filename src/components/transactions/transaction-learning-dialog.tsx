"use client";

import { useMemo, useState } from "react";
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
import {
  getRiskyRuleReasons,
  resolveLearningRulePreview,
  validateManualApproval,
} from "@/lib/classification-learning-policy";
import type {
  BusinessUnit,
  CashFlowType,
  Category,
  FinancialNature,
  LearningApplyScope,
  LearningDecision,
  LearningRuleMatchType,
  PnlImpact,
  TransactionWithCategory,
} from "@/lib/types";

const FINANCIAL_NATURE_LABELS: Record<FinancialNature, string> = {
  operating_income: "הכנסה תפעולית",
  operating_expense: "הוצאה תפעולית",
  credit_card_payment: "תשלום כרטיס אשראי",
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
    useState<LearningRuleMatchType | "">("");
  const [riskyRuleAcknowledged, setRiskyRuleAcknowledged] =
    useState(false);
  const [otherBusinessConfirmed, setOtherBusinessConfirmed] =
    useState(false);
  const canApplyBatch =
    transaction.importBatchId != null && transaction.importRowId != null;
  const needsMatcher = applyScope === "batch_similar" || saveAsRule;
  const correction = {
    categoryId: categoryId === "none" ? null : Number(categoryId),
    financialNature,
    cashFlowType,
    pnlImpact,
    businessUnit: businessUnit === "none" ? null : businessUnit,
  };
  const rulePreview = useMemo(() => {
    if (!needsMatcher || !ruleMatchType) return null;
    try {
      return resolveLearningRulePreview(
        {
          counterparty: transaction.counterparty,
          description:
            transaction.cleanDescription ?? transaction.description,
          sourceCategory: transaction.sourceCategory,
        },
        ruleMatchType
      );
    } catch {
      return null;
    }
  }, [
    needsMatcher,
    ruleMatchType,
    transaction.cleanDescription,
    transaction.counterparty,
    transaction.description,
    transaction.sourceCategory,
  ]);
  const riskyRuleReasons =
    saveAsRule && ruleMatchType && rulePreview
      ? getRiskyRuleReasons({
          matchType: ruleMatchType,
          matchValue: rulePreview.value,
          correction,
        })
      : [];

  const { data: businessUnits = [] } = useQuery({
    queryKey: ["business-units"],
    queryFn: () => listBusinessUnits(),
  });

  const parentCategories = categories.filter((c) => c.parentId === null);
  const leafCategories = categories.filter((c) => c.parentId !== null);

  const mutation = useMutation({
    mutationFn: (decision: LearningDecision) => {
      const approving = decision === "approve";
      if (approving) {
        const errors = validateManualApproval(
          correction,
          otherBusinessConfirmed
        );
        if (errors.length > 0) throw new Error(errors.join(" "));
      }
      if (approving && needsMatcher && !rulePreview) {
        throw new Error("בחר אופן התאמה מפורש.");
      }
      if (
        approving &&
        saveAsRule &&
        riskyRuleReasons.length > 0 &&
        !riskyRuleAcknowledged
      ) {
        throw new Error("יש לאשר במפורש את הסיכון בכלל העתידי.");
      }
      return updateTransactionLearning(transaction.id, {
        ...correction,
        decision,
        applyScope: approving ? applyScope : "row",
        saveAsRule: approving ? saveAsRule : false,
        ...(approving && ruleMatchType && rulePreview
          ? {
              ruleMatchType,
              ruleMatchValue: rulePreview.value,
            }
          : {}),
        riskyRuleAcknowledged:
          approving && saveAsRule ? riskyRuleAcknowledged : false,
        otherBusinessConfirmed:
          approving && correction.businessUnit === "other"
            ? otherBusinessConfirmed
            : false,
      });
    },
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
                    {bu.slug === "other"
                      ? "Other - עסקי, היחידה המדויקת טרם שויכה"
                      : bu.slug === "unknown"
                        ? "Unknown - לא פתור, להשאיר בבדיקה"
                        : bu.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="space-y-0.5 text-xs text-muted-foreground">
              <p>Other = confirmed business, exact unit not assigned yet</p>
              <p>Unknown = unresolved, keep in review</p>
            </div>
            {businessUnit === "other" && (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <Label htmlFor={`other-confirm-${transaction.id}`}>
                  אני מאשר שזו פעילות עסקית כללית
                </Label>
                <Switch
                  id={`other-confirm-${transaction.id}`}
                  checked={otherBusinessConfirmed}
                  onCheckedChange={setOtherBusinessConfirmed}
                />
              </div>
            )}
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
              onCheckedChange={(checked) => {
                setSaveAsRule(checked);
                setRiskyRuleAcknowledged(false);
              }}
            />
          </div>

          {needsMatcher && (
            <div className="space-y-1.5">
              <Label>אופן התאמה</Label>
              <Select
                value={ruleMatchType || undefined}
                onValueChange={(value) => {
                  setRuleMatchType(value as LearningRuleMatchType)
                  setRiskyRuleAcknowledged(false);
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="בחר אופן התאמה" />
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
              {rulePreview && (
                <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs">
                  <div className="font-medium">ה-pattern המדויק</div>
                  <div className="mt-1 break-all font-mono" dir="ltr">
                    {rulePreview.field} · {rulePreview.type} ·{" "}
                    {rulePreview.value}
                  </div>
                </div>
              )}
              {saveAsRule && riskyRuleReasons.length > 0 && (
                <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2">
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    כלל רגיש: {riskyRuleReasons.join("; ")}
                  </p>
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor={`risky-rule-${transaction.id}`}>
                      אני מאשר במפורש את ה-pattern והסיכון
                    </Label>
                    <Switch
                      id={`risky-rule-${transaction.id}`}
                      checked={riskyRuleAcknowledged}
                      onCheckedChange={setRiskyRuleAcknowledged}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            ביטול
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => mutation.mutate("keep_review")}
            disabled={mutation.isPending}
          >
            שמור והשאר בבדיקה
          </Button>
          <Button
            size="sm"
            onClick={() => mutation.mutate("approve")}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "שומר..." : "שמור ואשר"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
