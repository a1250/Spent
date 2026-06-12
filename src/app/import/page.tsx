"use client";

import { useCallback, useRef, useState } from "react";
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
  CreditCard,
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  uploadImportFile,
  listImportBatches,
  getImportBatch,
  commitImportBatch,
  getCategories,
  patchImportRow,
  type ImportUploadResult,
  type ImportRowPatch,
} from "@/lib/api";
import type {
  ImportBatch,
  ImportRow,
  FinancialNature,
  PnlImpact,
  BusinessUnit,
} from "@/lib/types";

// ── Financial nature labels ───────────────────────────────────────────────────

const FINANCIAL_NATURE_LABELS: Record<FinancialNature, string> = {
  operating_income: "הכנסה תפעולית",
  operating_expense: "הוצאה תפעולית",
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

const PNL_LABELS: Record<PnlImpact, string> = {
  yes: "כן",
  no: "לא",
  maybe: "אולי",
};

const BUSINESS_UNIT_LABELS: Record<BusinessUnit, string> = {
  personal: "אישי",
  business: "עסקי",
  investment: "השקעות",
};

const ADAPTER_LABELS: Record<ImportBatch["adapterKey"], string> = {
  "legacy-excel": "Legacy Excel",
  "credit-card-isracard": "Isracard",
  "credit-card-cal": "CAL",
};

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ImportRow["classificationStatus"] }) {
  if (status === "needs_review") {
    return (
      <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400">
        <AlertCircle className="h-3 w-3" />
        דורש בדיקה
      </Badge>
    );
  }
  if (status === "manually_approved") {
    return (
      <Badge variant="outline" className="gap-1 border-green-500/40 text-green-600 dark:text-green-400">
        <CheckCircle2 className="h-3 w-3" />
        אושר ידנית
      </Badge>
    );
  }
  if (status === "auto_classified") {
    return (
      <Badge variant="outline" className="gap-1 border-blue-500/40 text-blue-600 dark:text-blue-400">
        <CheckCircle2 className="h-3 w-3" />
        סווג אוטומטית
      </Badge>
    );
  }
  return <Badge variant="secondary">{status}</Badge>;
}

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
  const [pnlImpact, setPnlImpact] = useState<PnlImpact>(row.pnlImpact);
  const [categoryId, setCategoryId] = useState(
    row.categoryId == null ? "none" : String(row.categoryId)
  );
  const [businessUnit, setBusinessUnit] = useState<BusinessUnit | "none">(
    row.businessUnit ?? "none"
  );
  const [notes, setNotes] = useState(row.notes ?? "");
  const [saveAsRule, setSaveAsRule] = useState(false);
  const categoryKind = row.direction === "income" ? "income" : "expense";
  const { data: categories = [] } = useQuery({
    queryKey: ["categories", categoryKind],
    queryFn: () => getCategories(categoryKind, { leavesOnly: true }),
  });

  const mutation = useMutation({
    mutationFn: (patch: ImportRowPatch) =>
      patchImportRow(batchId, row.id, patch),
    onSuccess: () => {
      toast.success("השורה עודכנה");
      onSaved();
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "שגיאה בשמירה");
    },
  });

  const handleSave = () => {
    mutation.mutate({
      financialNature,
      pnlImpact,
      classificationStatus: "manually_approved",
      categoryId: categoryId === "none" ? null : Number(categoryId),
      businessUnit: businessUnit === "none" ? null : businessUnit,
      notes: notes || null,
      saveAsRule,
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
                {categories.map((category) => (
                  <SelectItem key={category.id} value={String(category.id)}>
                    {category.name}
                  </SelectItem>
                ))}
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
                {Object.entries(BUSINESS_UNIT_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div>
              <Label htmlFor={`save-rule-${row.id}`}>שמור ככלל עתידי</Label>
              <p className="text-xs text-muted-foreground">
                רק כלל שאושר כאן יוכל לסווג שורות אשראי אוטומטית
              </p>
            </div>
            <Switch
              id={`save-rule-${row.id}`}
              checked={saveAsRule}
              onCheckedChange={setSaveAsRule}
            />
          </div>
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
            onClick={handleSave}
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
    { label: "ממתינות לחיוב", value: pendingCount, color: "text-violet-600 dark:text-violet-400" },
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
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
              <th className="px-3 py-2 text-start font-medium">תאריך</th>
              <th className="px-3 py-2 text-start font-medium">תיאור</th>
              <th className="px-3 py-2 text-end font-medium">סכום</th>
              <th className="px-3 py-2 text-start font-medium">
                <span className="flex items-center gap-1">
                  קטגוריית מקור
                  <span
                    className="cursor-help text-amber-500"
                    title="קטגוריה מהספק או מהאקסל הישן — לא הסיווג הסופי"
                  >
                    ⚠
                  </span>
                </span>
              </th>
              <th className="px-3 py-2 text-start font-medium">סיווג פיננסי</th>
              <th className="px-3 py-2 text-center font-medium">P&L</th>
              <th className="px-3 py-2 text-start font-medium">סטטוס</th>
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
                </td>
                <td className="px-3 py-2">
                  {row.sourceCategory || row.legacyCategory ? (
                    <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                      {row.sourceCategory ?? row.legacyCategory}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className="text-xs">
                    {FINANCIAL_NATURE_LABELS[row.financialNature] ?? row.financialNature}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                      row.pnlImpact === "yes"
                        ? "bg-green-500/10 text-green-700 dark:text-green-400"
                        : row.pnlImpact === "no"
                          ? "bg-muted text-muted-foreground"
                          : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    }`}
                  >
                    {PNL_LABELS[row.pnlImpact]}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge status={row.classificationStatus} />
                    {row.transactionStatus === "pending" && (
                      <Badge
                        variant="outline"
                        className="border-violet-500/40 text-violet-600 dark:text-violet-400"
                      >
                        ממתינה לחיוב
                      </Badge>
                    )}
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
        <CreditCard className="h-4 w-4 text-violet-600 dark:text-violet-400" />
        <div>
          <h3 className="font-medium">
            עסקאות אשראי ממתינות ({pendingRows.length})
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
              <th className="px-3 py-2 text-start font-medium">כרטיס</th>
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
                  -{row.currency === "ILS" || !row.currency
                    ? "₪"
                    : `${row.currency} `}
                  {row.amount?.toLocaleString("he-IL", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {row.cardLast4 ? `•••• ${row.cardLast4}` : "—"}
                </td>
                <td className="px-3 py-2">
                  <Badge variant="secondary">{row.importStatus}</Badge>
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
                    <Badge variant="outline">
                      transaction #{row.transactionId}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">{row.importStatus}</Badge>
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
                Legacy Excel, Isracard או CAL. הפורמט מזוהה אוטומטית.
              </p>
            </div>
          </>
        )}
      </div>

      <BatchHistoryList onSelect={onUploaded} />
    </div>
  );
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
              <CreditCard className="h-4 w-4" />
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
  const [uploadResult, setUploadResult] = useState<ImportUploadResult | null>(null);

  const handleBack = () => setUploadResult(null);

  if (uploadResult) {
    return (
      <ReviewView
        initialBatch={uploadResult.batch}
        initialSummary={uploadResult.summary}
        onBack={handleBack}
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl" dir="rtl">
      <UploadZone onUploaded={setUploadResult} />
    </div>
  );
}
