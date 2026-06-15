"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowLeft,
  Pencil,
  Copy,
  Ban,
  PlusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  uploadImportFile,
  listImportBatches,
  getImportBatch,
  commitImportBatch,
  getCategories,
  listBusinessUnits,
  patchImportRow,
  type ImportUploadResult,
  type ImportRowPatch,
} from "@/lib/api";
import {
  getRiskyRuleReasons,
  resolveLearningRulePreview,
  validateManualApproval,
} from "@/lib/classification-learning-policy";
import type {
  ImportBatch,
  ImportRow,
  FinancialNature,
  CashFlowType,
  PnlImpact,
  BusinessUnit,
  LearningApplyScope,
  LearningDecision,
  LearningRuleMatchType,
} from "@/lib/types";
import { ImportHealthReport } from "@/components/import/import-health-report";
import {
  CashFlowTypeBadge,
  ClassificationStatusBadge,
  ImportRowStatusBadge,
  PnlImpactBadge,
  RuleProvenanceBadge,
  TransactionStatusBadge,
} from "@/components/import/import-intelligence-badges";

// ── Financial nature labels ───────────────────────────────────────────────────

const FINANCIAL_NATURE_LABELS: Record<FinancialNature, string> = {
  operating_income: "הכנסה תפעולית",
  operating_expense: "הוצאה תפעולית",
  credit_card_payment: "תשלום כרטיס אשראי",
  refund: "זיכוי / החזר",
  working_capital: "הון חוזר",
  investment: "השקעה",
  internal_transfer: "העברה פנימית",
  receivable_collection: "גביית חוב",
  payable_payment: "תשלום חוב",
  loan_received: "קבלת הלוואה",
  loan_repayment: "פירעון הלוואה",
  owner_deposit: "הפקדת בעלים",
  owner_draw: "משיכת בעלים",
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

const ADAPTER_LABELS: Record<ImportBatch["adapterKey"], string> = {
  "legacy-excel": "Legacy Excel",
  "credit-card-isracard": "Isracard",
  "credit-card-cal": "CAL",
  "bank-checking-hebrew": "Bank checking",
};

// ── Row edit dialog ───────────────────────────────────────────────────────────

function EditRowDialog({
  row,
  batchId,
  open,
  onClose,
  onSaved,
}: {
  row: ImportRow;
  batchId: number;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [financialNature, setFinancialNature] = useState<FinancialNature>(
    row.financialNature
  );
  const [cashFlowType, setCashFlowType] = useState<CashFlowType>(
    row.cashFlowType
  );
  const [pnlImpact, setPnlImpact] = useState<PnlImpact>(row.pnlImpact);
  const [categoryId, setCategoryId] = useState(
    row.categoryId == null ? "none" : String(row.categoryId)
  );
  const [businessUnit, setBusinessUnit] = useState<BusinessUnit | "none">(
    row.businessUnit ?? "none"
  );
  const [notes, setNotes] = useState(row.notes ?? "");
  const [applyScope, setApplyScope] =
    useState<LearningApplyScope>("row");
  const [saveAsRule, setSaveAsRule] = useState(false);
  const [ruleMatchType, setRuleMatchType] =
    useState<LearningRuleMatchType | "">("");
  const [riskyRuleAcknowledged, setRiskyRuleAcknowledged] =
    useState(false);
  const [otherBusinessConfirmed, setOtherBusinessConfirmed] =
    useState(false);
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
          counterparty: row.counterparty,
          description: row.cleanDescription ?? row.rawDescription,
          sourceCategory: row.sourceCategory,
        },
        ruleMatchType
      );
    } catch {
      return null;
    }
  }, [
    needsMatcher,
    row.cleanDescription,
    row.counterparty,
    row.rawDescription,
    row.sourceCategory,
    ruleMatchType,
  ]);
  const riskyRuleReasons =
    saveAsRule && ruleMatchType && rulePreview
      ? getRiskyRuleReasons({
          matchType: ruleMatchType,
          matchValue: rulePreview.value,
          correction,
        })
      : [];
  const categoryKind = row.direction === "income" ? "income" : "expense";
  const { data: allCategories = [] } = useQuery({
    queryKey: ["categories", categoryKind],
    queryFn: () => getCategories(categoryKind),
  });
  const { data: businessUnits = [] } = useQuery({
    queryKey: ["business-units"],
    queryFn: listBusinessUnits,
  });
  // Separate parents and leaves for grouped display
  const parentCategories = allCategories.filter((c) => c.parentId === null);
  const leafCategories = allCategories.filter((c) => c.parentId !== null);

  const mutation = useMutation({
    mutationFn: (patch: ImportRowPatch) =>
      patchImportRow(batchId, row.id, patch),
    onSuccess: (result) => {
      const suffix =
        result.affectedRows && result.affectedRows > 1
          ? ` (${result.affectedRows} שורות)`
          : "";
      toast.success(
        result.ruleId
          ? `התיקון נשמר ונוצר כלל עתידי${suffix}`
          : `התיקון נשמר${suffix}`
      );
      onSaved();
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "שגיאה בשמירה");
    },
  });

  const handleSave = (decision: LearningDecision) => {
    const approving = decision === "approve";
    if (approving) {
      const errors = validateManualApproval(
        correction,
        otherBusinessConfirmed
      );
      if (errors.length > 0) {
        toast.error(errors.join(" "));
        return;
      }
    }
    if (approving && needsMatcher && !rulePreview) {
      toast.error("בחר אופן התאמה מפורש.");
      return;
    }
    if (
      approving &&
      saveAsRule &&
      riskyRuleReasons.length > 0 &&
      !riskyRuleAcknowledged
    ) {
      toast.error("יש לאשר במפורש את הסיכון בכלל העתידי.");
      return;
    }
    mutation.mutate({
      ...correction,
      classificationStatus:
        decision === "approve" ? "manually_approved" : "needs_review",
      notes: notes || null,
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
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogTitle className="font-serif text-xl font-normal">
          עריכת שורה
        </DialogTitle>

        <div className="space-y-1 rounded-lg bg-muted/40 px-3 py-2 text-sm">
          <div className="font-medium">{row.cleanDescription ?? row.rawDescription}</div>
          <div className="text-xs text-muted-foreground">
            {row.date} · ₪{row.amount?.toLocaleString("he-IL", { minimumFractionDigits: 2 })}
          </div>
          {(row.sourceCategory || row.legacyCategory) && (
            <div className="mt-1 flex items-center gap-1.5 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span>
                <span className="font-medium">קטגוריית מקור:</span>{" "}
                {row.sourceCategory ?? row.legacyCategory}
                {row.legacyRuleCategory && row.legacyRuleCategory !== row.legacyCategory
                  ? ` (כלל: ${row.legacyRuleCategory})`
                  : ""}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>סיווג פיננסי</Label>
            <Select
              value={financialNature}
              onValueChange={(v) => setFinancialNature(v as FinancialNature)}
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
            <Label>תרומה לרווח/הפסד (P&L)</Label>
            <Select
              value={pnlImpact}
              onValueChange={(v) => setPnlImpact(v as PnlImpact)}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">כן — משפיע על רווח/הפסד</SelectItem>
                <SelectItem value="no">לא — לא משפיע (העברה, השקעה)</SelectItem>
                <SelectItem value="maybe">אולי — דורש בדיקה</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>קטגוריה</Label>
            <Select
              value={categoryId}
              onValueChange={(value) => {
                if (value) setCategoryId(value);
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="ללא קטגוריה" />
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
            <Label>יחידה עסקית</Label>
            <Select
              value={businessUnit}
              onValueChange={(value) => {
                if (value) {
                  setBusinessUnit(value as BusinessUnit | "none");
                }
              }}
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
                <Label htmlFor={`import-other-confirm-${row.id}`}>
                  אני מאשר שזו פעילות עסקית כללית
                </Label>
                <Switch
                  id={`import-other-confirm-${row.id}`}
                  checked={otherBusinessConfirmed}
                  onCheckedChange={setOtherBusinessConfirmed}
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>הערות</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="הוסף הערה אופציונלית..."
              className="h-9"
            />
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
                <SelectItem value="row">רק על השורה הזו</SelectItem>
                <SelectItem value="batch_similar">
                  על כל השורות הדומות בייבוא הזה
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div>
              <Label htmlFor={`save-rule-${row.id}`}>שמור ככלל עתידי</Label>
              <p className="text-xs text-muted-foreground">
                רק כלל שאושר כאן יוכל לסווג שורות מיובאות אוטומטית
              </p>
            </div>
            <Switch
              id={`save-rule-${row.id}`}
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
                  {row.counterparty?.trim() && (
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
                  {(row.cleanDescription ?? row.rawDescription)?.trim() && (
                    <SelectItem value="description_contains">
                      התיאור מכיל
                    </SelectItem>
                  )}
                  {row.sourceCategory?.trim() && (
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
              <p className="text-xs text-muted-foreground">
                רק provider source_category יכול לשמש להתאמה.
                legacy_category נשאר audit בלבד.
              </p>
              {saveAsRule && riskyRuleReasons.length > 0 && (
                <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2">
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    כלל רגיש: {riskyRuleReasons.join("; ")}
                  </p>
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor={`import-risky-rule-${row.id}`}>
                      אני מאשר במפורש את ה-pattern והסיכון
                    </Label>
                    <Switch
                      id={`import-risky-rule-${row.id}`}
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
            onClick={() => handleSave("keep_review")}
            disabled={mutation.isPending}
          >
            שמור והשאר בבדיקה
          </Button>
          <Button
            size="sm"
            onClick={() => handleSave("approve")}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "שומר..." : "שמור ואשר"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Summary cards ─────────────────────────────────────────────────────────────

function SummaryCards({
  result,
  batch,
  pendingCount,
}: {
  result: ImportUploadResult["summary"];
  batch: ImportBatch;
  pendingCount: number;
}) {
  const cards = [
    { label: "שורות", value: result.totalRows, color: "text-foreground" },
    { label: "סווגו אוטומטית", value: result.autoClassified, color: "text-blue-600 dark:text-blue-400" },
    { label: "דורשות בדיקה", value: result.needsReview, color: "text-amber-600 dark:text-amber-400" },
    { label: "ממתינות", value: pendingCount, color: "text-violet-600 dark:text-violet-400" },
    { label: "כפולות", value: result.duplicates, color: "text-muted-foreground" },
    { label: "דולגו", value: result.skipped, color: "text-muted-foreground" },
  ];

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{batch.sourceFilename}</span>
        <Badge variant="outline" className="text-xs">
          {ADAPTER_LABELS[batch.adapterKey]}
        </Badge>
        <Badge variant="secondary" className="ms-auto text-xs">
          {batch.status}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className="space-y-0.5 text-center">
            <div className={`text-2xl font-semibold tabular-nums ${c.color}`}>
              {c.value}
            </div>
            <div className="text-xs text-muted-foreground">{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Review table ──────────────────────────────────────────────────────────────

type RowFilter = "all" | "needs_review";

function ReviewTable({
  rows,
  batchId,
  onRowUpdated,
}: {
  rows: ImportRow[];
  batchId: number;
  onRowUpdated: () => void;
}) {
  const [filter, setFilter] = useState<RowFilter>("all");
  const [editRow, setEditRow] = useState<ImportRow | null>(null);
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategories(),
  });
  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
  );

  const displayed = filter === "needs_review"
    ? rows.filter((r) => r.classificationStatus === "needs_review" && !r.isDuplicate)
    : rows.filter((r) => !r.isDuplicate);

  const needsReviewCount = rows.filter(
    (r) => r.classificationStatus === "needs_review" && !r.isDuplicate
  ).length;
  const hasEditableRows = rows.some(
    (row) => !row.isDuplicate && row.importStatus === "pending"
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
        >
          הצג הכל ({rows.filter((r) => !r.isDuplicate).length})
        </Button>
        <Button
          variant={filter === "needs_review" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("needs_review")}
        >
          <AlertCircle className="me-1.5 h-3.5 w-3.5" />
          דורשות בדיקה ({needsReviewCount})
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[1480px] text-sm">
          <thead>
            <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
              <th className="px-3 py-2 text-start font-medium">תאריך</th>
              <th className="px-3 py-2 text-start font-medium">תיאור</th>
              <th className="px-3 py-2 text-end font-medium">סכום</th>
              <th className="px-3 py-2 text-start font-medium">מקור הקובץ</th>
              <th className="px-3 py-2 text-start font-medium">Audit בלבד</th>
              <th className="px-3 py-2 text-start font-medium">סיווג סופי</th>
              <th className="px-3 py-2 text-start font-medium">סטטוס / Rule</th>
              {hasEditableRows && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {displayed.map((row) => (
              <tr
                key={row.id}
                className={`border-b last:border-0 hover:bg-muted/20 ${
                  row.classificationStatus === "needs_review"
                    ? "bg-amber-500/3"
                    : ""
                }`}
              >
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">
                  <div>{row.date}</div>
                  {row.billingDate && (
                    <div className="mt-0.5 text-[10px]">
                      חיוב: {row.billingDate}
                    </div>
                  )}
                  {row.valueDate && row.valueDate !== row.date && (
                    <div className="mt-0.5 text-[10px]">
                      ערך: {row.valueDate}
                    </div>
                  )}
                </td>
                <td className="max-w-[220px] px-3 py-2">
                  <div className="truncate font-medium" title={row.cleanDescription ?? undefined}>
                    {row.cleanDescription ?? row.rawDescription}
                  </div>
                  {row.notes && (
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {row.notes}
                    </div>
                  )}
                  {row.cardLast4 && (
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      כרטיס •••• {row.cardLast4}
                      {row.transactionType ? ` · ${row.transactionType}` : ""}
                    </div>
                  )}
                  {(row.bankAccountLabel || row.bankAccountNumberMasked) && (
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {row.bankAccountLabel ?? "חשבון"}{" "}
                      {row.bankAccountNumberMasked ?? ""}
                      {row.reference ? ` · אסמכתה ${row.reference}` : ""}
                    </div>
                  )}
                  {row.paymentChannel && (
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      ערוץ: {row.paymentChannel}
                    </div>
                  )}
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-2 text-end font-mono tabular-nums ${
                    row.direction === "income"
                      ? "text-green-600 dark:text-green-400"
                      : "text-foreground"
                  }`}
                >
                  {row.direction === "income" ? "+" : "-"}
                  {row.currency === "ILS" || !row.currency
                    ? "₪"
                    : `${row.currency} `}
                  {row.amount?.toLocaleString("he-IL", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                  {row.originalCurrency &&
                    row.originalAmount != null &&
                    row.originalCurrency !== row.currency && (
                      <div className="text-[10px] text-muted-foreground">
                        מקור: {row.originalAmount.toLocaleString("he-IL")}{" "}
                        {row.originalCurrency}
                      </div>
                    )}
                  {row.balanceAfter != null && (
                    <div className="text-[10px] text-muted-foreground">
                      יתרה: ₪
                      {row.balanceAfter.toLocaleString("he-IL", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <ImportSourceDetails row={row} />
                </td>
                <td className="px-3 py-2">
                  <ImportAuditDetails row={row} />
                </td>
                <td className="max-w-[260px] px-3 py-2">
                  <div className="font-medium">
                    {row.categoryId == null
                      ? "ללא קטגוריה"
                      : categoryNames.get(row.categoryId) ??
                        `category #${row.categoryId}`}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {FINANCIAL_NATURE_LABELS[row.financialNature] ??
                      row.financialNature}{" "}
                    · {row.businessUnit ?? "unknown"}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <CashFlowTypeBadge type={row.cashFlowType} />
                    <PnlImpactBadge impact={row.pnlImpact} />
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-col items-start gap-1">
                    <ClassificationStatusBadge
                      status={row.classificationStatus}
                    />
                    <ImportRowStatusBadge status={row.importStatus} />
                    <TransactionStatusBadge status={row.transactionStatus} />
                    <RuleProvenanceBadge
                      ruleId={row.appliedRuleId}
                      source={row.appliedRuleSource}
                      confidence={row.appliedRuleConfidence}
                      legacyRuleCategory={row.legacyRuleCategory}
                    />
                  </div>
                </td>
                {hasEditableRows && (
                  <td className="px-3 py-2">
                    {row.importStatus === "pending" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
                        onClick={() => setEditRow(row)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {displayed.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {filter === "needs_review" ? "אין שורות הדורשות בדיקה" : "אין שורות"}
          </div>
        )}
      </div>

      {editRow && (
        <EditRowDialog
          key={editRow.id}
          row={editRow}
          batchId={batchId}
          open={true}
          onClose={() => setEditRow(null)}
          onSaved={onRowUpdated}
        />
      )}
    </div>
  );
}

function PendingTransactionsTable({
  rows,
  batchId,
  onRowUpdated,
}: {
  rows: ImportRow[];
  batchId: number;
  onRowUpdated: () => void;
}) {
  const [pendingRowId, setPendingRowId] = useState<number | null>(null);
  const pendingRows = rows.filter(
    (row) => row.transactionStatus === "pending" && !row.isDuplicate
  );
  const mutation = useMutation({
    mutationFn: (rowId: number) =>
      patchImportRow(batchId, rowId, { pendingAction: "import_pending" }),
    onMutate: setPendingRowId,
    onSuccess: () => {
      toast.success("העסקה הממתינה יובאה כ-pending");
      onRowUpdated();
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "שגיאה בייבוא העסקה הממתינה"
      );
    },
    onSettled: () => setPendingRowId(null),
  });

  if (pendingRows.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-violet-600 dark:text-violet-400" />
        <div>
          <h3 className="font-medium">
            עסקאות ממתינות ({pendingRows.length})
          </h3>
          <p className="text-xs text-muted-foreground">
            commit רגיל אינו מכניס אותן להוצאות. הייבוא מתבצע רק בפעולה מפורשת.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-violet-500/30">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b bg-violet-500/5 text-xs text-muted-foreground">
              <th className="px-3 py-2 text-start font-medium">שורת מקור</th>
              <th className="px-3 py-2 text-start font-medium">תאריך</th>
              <th className="px-3 py-2 text-start font-medium">בית עסק</th>
              <th className="px-3 py-2 text-end font-medium">סכום</th>
              <th className="px-3 py-2 text-start font-medium">חשבון / כרטיס</th>
              <th className="px-3 py-2 text-start font-medium">Audit status</th>
              <th className="px-3 py-2 text-start font-medium">פעולה</th>
            </tr>
          </thead>
          <tbody>
            {pendingRows.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono text-xs">
                  {row.rawRowNumber}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{row.date}</td>
                <td className="max-w-[280px] px-3 py-2">
                  <div className="truncate">
                    {row.counterparty ??
                      row.cleanDescription ??
                      row.rawDescription}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-end font-mono">
                  {row.direction === "income" ? "+" : "-"}
                  {row.currency === "ILS" || !row.currency
                    ? "₪"
                    : `${row.currency} `}
                  {row.amount?.toLocaleString("he-IL", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {row.bankAccountNumberMasked ??
                    (row.cardLast4 ? `•••• ${row.cardLast4}` : "—")}
                </td>
                <td className="px-3 py-2">
                  <ImportRowStatusBadge status={row.importStatus} />
                </td>
                <td className="px-3 py-2">
                  {row.importStatus === "pending" ? (
                    <Button
                      size="sm"
                      disabled={pendingRowId === row.id}
                      onClick={() => mutation.mutate(row.id)}
                    >
                      {pendingRowId === row.id
                        ? "מייבא..."
                        : "Import pending"}
                    </Button>
                  ) : row.importStatus === "imported" ? (
                    <Badge variant="outline">transaction #{row.transactionId}</Badge>
                  ) : (
                    <ImportRowStatusBadge status={row.importStatus} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PotentialDuplicatesTable({
  rows,
  batchId,
  onRowUpdated,
}: {
  rows: ImportRow[];
  batchId: number;
  onRowUpdated: () => void;
}) {
  const [pendingRowId, setPendingRowId] = useState<number | null>(null);
  const duplicateRows = rows.filter((row) => row.isDuplicate);

  const mutation = useMutation({
    mutationFn: ({
      rowId,
      duplicateAction,
    }: {
      rowId: number;
      duplicateAction: NonNullable<ImportRowPatch["duplicateAction"]>;
    }) => patchImportRow(batchId, rowId, { duplicateAction }),
    onMutate: ({ rowId }) => setPendingRowId(rowId),
    onSuccess: (_result, variables) => {
      const messages = {
        skip_duplicate: "השורה סומנה ככפולה שדולגה",
        import_anyway: "הכפולה יובאה עם רצף חדש",
        keep_pending: "השורה נשארה ממתינה לבדיקה",
      };
      toast.success(messages[variables.duplicateAction]);
      onRowUpdated();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "שגיאה בטיפול בכפולה");
    },
    onSettled: () => setPendingRowId(null),
  });

  if (duplicateRows.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Copy className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <h3 className="font-medium">כפילויות אפשריות ({duplicateRows.length})</h3>
      </div>

      <div className="overflow-x-auto rounded-xl border border-amber-500/30">
        <table className="w-full min-w-[1180px] text-sm">
          <thead>
            <tr className="border-b bg-amber-500/5 text-xs text-muted-foreground">
              <th className="px-3 py-2 text-start font-medium">שורת ייבוא</th>
              <th className="px-3 py-2 text-start font-medium">שורת מקור</th>
              <th className="px-3 py-2 text-start font-medium">תאריך</th>
              <th className="px-3 py-2 text-start font-medium">תיאור / בית עסק</th>
              <th className="px-3 py-2 text-end font-medium">סכום</th>
              <th className="px-3 py-2 text-start font-medium">קטגוריה ישנה</th>
              <th className="px-3 py-2 text-start font-medium">סיבת התאמה</th>
              <th className="px-3 py-2 text-start font-medium">תנועה תואמת</th>
              <th className="px-3 py-2 text-center font-medium">רצף הבא</th>
              <th className="px-3 py-2 text-start font-medium">החלטה</th>
            </tr>
          </thead>
          <tbody>
            {duplicateRows.map((row) => {
              const isPending = pendingRowId === row.id;
              return (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">#{row.id}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {row.rawRowNumber}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                    {row.date}
                  </td>
                  <td className="max-w-[260px] px-3 py-2">
                    <div
                      className="truncate"
                      title={row.cleanDescription ?? undefined}
                    >
                      {row.counterparty ??
                        row.cleanDescription ??
                        row.rawDescription}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-end font-mono">
                    {row.direction === "expense" ? "-" : "+"}₪
                    {row.amount?.toLocaleString("he-IL", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.legacyCategory ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-xs">
                      {row.duplicateReason ?? "התאמה מדויקת"}
                    </div>
                    <code className="block max-w-[150px] truncate text-[10px] text-muted-foreground">
                      {row.dedupHash}
                    </code>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.duplicateMatch ? (
                      <>
                        <div>
                          #{row.duplicateMatch.id} · {row.duplicateMatch.date}
                        </div>
                        <div className="max-w-[220px] truncate text-muted-foreground">
                          {row.duplicateMatch.description}
                        </div>
                      </>
                    ) : (
                      "לא נמצאה"
                    )}
                  </td>
                  <td className="px-3 py-2 text-center font-mono">
                    {row.canImportDuplicate ? row.nextDedupSequence : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {row.importStatus === "pending_duplicate" ? (
                      <div className="flex min-w-max items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isPending}
                          onClick={() =>
                            mutation.mutate({
                              rowId: row.id,
                              duplicateAction: "skip_duplicate",
                            })
                          }
                        >
                          <Ban className="me-1 h-3.5 w-3.5" />
                          דלג
                        </Button>
                        <Button
                          size="sm"
                          disabled={isPending || !row.canImportDuplicate}
                          onClick={() =>
                            mutation.mutate({
                              rowId: row.id,
                              duplicateAction: "import_anyway",
                            })
                          }
                        >
                          <PlusCircle className="me-1 h-3.5 w-3.5" />
                          ייבא בכל זאת
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isPending}
                          onClick={() =>
                            mutation.mutate({
                              rowId: row.id,
                              duplicateAction: "keep_pending",
                            })
                          }
                        >
                          השאר ממתין
                        </Button>
                      </div>
                    ) : (
                      <Badge variant="secondary">
                        {row.importStatus === "skipped_duplicate"
                          ? "דולג ככפול"
                          : row.importStatus === "imported"
                            ? `יובא · תנועה #${row.transactionId}`
                            : row.importStatus}
                      </Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Upload zone ───────────────────────────────────────────────────────────────

function UploadZone({
  onUploaded,
}: {
  onUploaded: (result: ImportUploadResult) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const mutation = useMutation({
    mutationFn: (file: File) => uploadImportFile(file),
    onSuccess: onUploaded,
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "שגיאה בהעלאת הקובץ");
    },
  });

  const handleFile = (file: File) => mutation.mutate(file);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <div className="space-y-6">
      <div
        className={`flex min-h-[240px] cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed transition-colors ${
          dragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/30"
        }`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />

        {mutation.isPending ? (
          <>
            <Clock className="h-10 w-10 animate-pulse text-muted-foreground" />
            <p className="text-sm text-muted-foreground">מעבד קובץ...</p>
          </>
        ) : (
          <>
            <Upload className="h-10 w-10 text-muted-foreground" />
            <div className="text-center">
              <p className="font-medium">גרור קובץ .xlsx לכאן</p>
              <p className="mt-1 text-sm text-muted-foreground">
                או לחץ לבחירת קובץ
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Legacy Excel, Isracard, CAL או קובץ עובר ושב. הפורמט מזוהה אוטומטית.
              </p>
            </div>
          </>
        )}
      </div>

      {mutation.isError && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">
                {getImportErrorTitle(mutation.error)}
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {mutation.error instanceof Error
                  ? mutation.error.message
                  : "The file could not be imported."}
              </p>
            </div>
          </div>
        </div>
      )}

      <BatchHistoryList onSelect={onUploaded} />
    </div>
  );
}

function ImportSourceDetails({ row }: { row: ImportRow }) {
  const sourceParts = [
    row.sourceType,
    row.sourceSection,
    row.sourceSheetName ? `sheet: ${row.sourceSheetName}` : null,
  ].filter(Boolean);

  return (
    <div className="max-w-[240px] space-y-1 text-xs">
      <div className="font-medium">
        {sourceParts.length > 0 ? sourceParts.join(" · ") : "מקור לא זמין"}
      </div>
      {row.billingDate && (
        <div className="text-muted-foreground">
          billing date: {row.billingDate}
        </div>
      )}
      {row.valueDate && row.valueDate !== row.date && (
        <div className="text-muted-foreground">value date: {row.valueDate}</div>
      )}
    </div>
  );
}

function ImportAuditDetails({ row }: { row: ImportRow }) {
  const sourceCategory = row.sourceCategory?.trim();
  const legacyCategory = row.legacyCategory?.trim();

  if (!sourceCategory && !legacyCategory) {
    return <span className="text-xs text-muted-foreground">אין metadata</span>;
  }

  return (
    <div className="max-w-[220px] space-y-1 text-xs">
      {sourceCategory && (
        <div className="truncate" title={sourceCategory}>
          <span className="text-muted-foreground">source:</span>{" "}
          {sourceCategory}
        </div>
      )}
      {legacyCategory && legacyCategory !== sourceCategory && (
        <div className="truncate" title={legacyCategory}>
          <span className="text-muted-foreground">legacy:</span>{" "}
          {legacyCategory}
        </div>
      )}
      <div className="text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
        Audit only · not final category
      </div>
    </div>
  );
}

function getImportErrorTitle(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("unsupported_isracard_profile")) {
    return "Isracard file recognized, but this profile is not supported yet";
  }
  if (message.toLowerCase().includes("unsupported")) {
    return "Unsupported import file";
  }
  return "Import could not be completed";
}

// ── Batch history ─────────────────────────────────────────────────────────────

function BatchHistoryList({
  onSelect,
}: {
  onSelect: (result: ImportUploadResult) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["import-batches"],
    queryFn: listImportBatches,
  });

  const batches = data?.batches ?? [];

  if (isLoading) return null;
  if (batches.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">ייבואים קודמים</h3>
      <ul className="divide-y divide-border rounded-xl border">
        {batches.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start hover:bg-muted/30"
              onClick={() =>
                onSelect({
                  batch: b,
                  summary: {
                    totalRows: b.totalRows,
                    autoClassified: Math.max(
                      0,
                      b.totalRows - b.needsReviewRows - b.duplicateRows
                    ),
                    needsReview: b.needsReviewRows,
                    duplicates: b.duplicateRows,
                    skipped: b.skippedRows,
                  },
                })
              }
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">{b.sourceFilename}</span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {new Date(b.createdAt).toLocaleDateString("he-IL")} ·{" "}
                  {b.totalRows} שורות · {ADAPTER_LABELS[b.adapterKey]}
                </div>
              </div>
              <Badge
                variant={b.status === "committed" ? "default" : "secondary"}
                className="text-xs"
              >
                {b.status === "committed" ? "יובא" : b.status}
              </Badge>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Review view ───────────────────────────────────────────────────────────────

function ReviewView({
  initialBatch,
  initialSummary,
  onBack,
}: {
  initialBatch: ImportBatch;
  initialSummary: ImportUploadResult["summary"];
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const [committed, setCommitted] = useState(
    initialBatch.status === "committed"
  );

  const { data, refetch } = useQuery({
    queryKey: ["import-batch", initialBatch.id],
    queryFn: () => getImportBatch(initialBatch.id),
    initialData: { batch: initialBatch, rows: [] },
    refetchOnMount: true,
  });

  const commitMutation = useMutation({
    mutationFn: () => commitImportBatch(initialBatch.id),
    onSuccess: (result) => {
      toast.success(
        result.pending > 0
          ? `יובאו ${result.inserted} תנועות; ${result.pending} עסקאות pending נשארו לבדיקה`
          : `יובאו ${result.inserted} תנועות בהצלחה`
      );
      setCommitted(true);
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["home"] });
      void queryClient.invalidateQueries({ queryKey: ["import-batches"] });
      void refetch();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "שגיאה בייבוא");
    },
  });

  const rows = data.rows;
  const needsReviewCount = rows.filter(
    (r) => r.classificationStatus === "needs_review" && !r.isDuplicate
  ).length;
  const pendingCount = rows.filter(
    (row) => row.transactionStatus === "pending" && !row.isDuplicate
  ).length;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          ייבוא חדש
        </Button>
        <h2 className="text-lg font-medium">
          {committed ? "✓ יובא בהצלחה" : "סקירה לפני אישור"}
        </h2>
      </div>

      <SummaryCards
        result={initialSummary}
        batch={data.batch}
        pendingCount={pendingCount}
      />

      {!committed && (
        <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
          {needsReviewCount > 0 && (
            <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-4 w-4" />
              <span>{needsReviewCount} שורות דורשות בדיקה — מומלץ לעיין בהן לפני האישור</span>
            </div>
          )}
          {pendingCount > 0 && (
            <div className="flex items-center gap-2 text-sm text-violet-600 dark:text-violet-400">
              <Clock className="h-4 w-4" />
              <span>{pendingCount} עסקאות ממתינות יישארו מחוץ ל-transactions</span>
            </div>
          )}
          <div className="ms-auto">
            <Button
              onClick={() => commitMutation.mutate()}
              disabled={commitMutation.isPending}
              className="gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              {commitMutation.isPending ? "מייבא..." : "אשר ויבא תנועות"}
            </Button>
          </div>
        </div>
      )}

      <ReviewTable
        rows={rows}
        batchId={initialBatch.id}
        onRowUpdated={() => { void refetch(); }}
      />

      <PendingTransactionsTable
        rows={rows}
        batchId={initialBatch.id}
        onRowUpdated={() => {
          void queryClient.invalidateQueries({ queryKey: ["transactions"] });
          void queryClient.invalidateQueries({ queryKey: ["home"] });
          void queryClient.invalidateQueries({ queryKey: ["import-batches"] });
          void refetch();
        }}
      />

      <PotentialDuplicatesTable
        rows={rows}
        batchId={initialBatch.id}
        onRowUpdated={() => {
          void queryClient.invalidateQueries({ queryKey: ["transactions"] });
          void queryClient.invalidateQueries({ queryKey: ["home"] });
          void queryClient.invalidateQueries({ queryKey: ["import-batches"] });
          void refetch();
        }}
      />
    </div>
  );
}

// ── Page root ─────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [uploadResult, setUploadResult] = useState<ImportUploadResult | null>(null);
  const requestedBatchId = Number(searchParams.get("batchId"));
  const hasRequestedBatch =
    Number.isInteger(requestedBatchId) && requestedBatchId > 0;
  const requestedBatchQuery = useQuery({
    queryKey: ["import-batch", requestedBatchId],
    queryFn: () => getImportBatch(requestedBatchId),
    enabled: hasRequestedBatch && uploadResult == null,
  });

  const requestedResult = useMemo<ImportUploadResult | null>(() => {
    const data = requestedBatchQuery.data;
    if (!data) return null;
    return {
      batch: data.batch,
      summary: {
        totalRows: data.rows.length,
        autoClassified: data.rows.filter(
          (row) => row.classificationStatus === "auto_classified"
        ).length,
        needsReview: data.rows.filter(
          (row) => row.classificationStatus === "needs_review"
        ).length,
        duplicates: data.rows.filter((row) => row.isDuplicate).length,
        skipped: data.rows.filter(
          (row) => row.importStatus === "skipped_duplicate"
        ).length,
        pending: data.rows.filter(
          (row) => row.transactionStatus === "pending"
        ).length,
      },
    };
  }, [requestedBatchQuery.data]);

  const activeResult = uploadResult ?? requestedResult;

  const handleSelect = (result: ImportUploadResult) => {
    setUploadResult(result);
    router.replace(`/import?batchId=${result.batch.id}`, { scroll: false });
  };

  const handleBack = () => {
    setUploadResult(null);
    router.replace("/import", { scroll: false });
  };

  if (activeResult) {
    return (
      <ReviewView
        initialBatch={activeResult.batch}
        initialSummary={activeResult.summary}
        onBack={handleBack}
      />
    );
  }

  return (
    <div className="space-y-10" dir="rtl">
      <div className="mx-auto max-w-2xl">
        <UploadZone onUploaded={handleSelect} />
      </div>
      <ImportHealthReport />
    </div>
  );
}
