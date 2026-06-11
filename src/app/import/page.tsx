"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowLeft,
  Pencil,
  X,
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
  patchImportRow,
  type ImportUploadResult,
  type ImportRowPatch,
} from "@/lib/api";
import type {
  ImportBatch,
  ImportRow,
  FinancialNature,
  PnlImpact,
} from "@/lib/types";

// ── Financial nature labels ───────────────────────────────────────────────────

const FINANCIAL_NATURE_LABELS: Record<FinancialNature, string> = {
  operating_income: "הכנסה תפעולית",
  operating_expense: "הוצאה תפעולית",
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
  const [notes, setNotes] = useState(row.notes ?? "");

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
      notes: notes || null,
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
          {row.legacyCategory && (
            <div className="mt-1 flex items-center gap-1.5 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span>
                <span className="font-medium">קטגוריה מקורית מהאקסל:</span>{" "}
                {row.legacyCategory}
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
            <Label>הערות</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="הוסף הערה אופציונלית..."
              className="h-9"
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
}: {
  result: ImportUploadResult["summary"];
  batch: ImportBatch;
}) {
  const cards = [
    { label: "שורות", value: result.totalRows, color: "text-foreground" },
    { label: "סווגו אוטומטית", value: result.autoClassified, color: "text-blue-600 dark:text-blue-400" },
    { label: "דורשות בדיקה", value: result.needsReview, color: "text-amber-600 dark:text-amber-400" },
    { label: "כפולות", value: result.duplicates, color: "text-muted-foreground" },
    { label: "דולגו", value: result.skipped, color: "text-muted-foreground" },
  ];

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{batch.sourceFilename}</span>
        <Badge variant="secondary" className="ms-auto text-xs">
          {batch.status}
        </Badge>
      </div>
      <div className="grid grid-cols-5 gap-3">
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
  committed,
  onRowUpdated,
}: {
  rows: ImportRow[];
  batchId: number;
  committed: boolean;
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
                  קטגוריה מקורית
                  <span
                    className="cursor-help text-amber-500"
                    title="קטגוריה מהאקסל הישן — לא הסיווג הסופי"
                  >
                    ⚠
                  </span>
                </span>
              </th>
              <th className="px-3 py-2 text-start font-medium">סיווג פיננסי</th>
              <th className="px-3 py-2 text-center font-medium">P&L</th>
              <th className="px-3 py-2 text-start font-medium">סטטוס</th>
              {!committed && <th className="px-3 py-2" />}
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
                  {row.date}
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
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-2 text-end font-mono tabular-nums ${
                    row.direction === "income"
                      ? "text-green-600 dark:text-green-400"
                      : "text-foreground"
                  }`}
                >
                  {row.direction === "income" ? "+" : "-"}₪
                  {row.amount?.toLocaleString("he-IL", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td className="px-3 py-2">
                  {row.legacyCategory ? (
                    <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                      {row.legacyCategory}
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
                  <StatusBadge status={row.classificationStatus} />
                </td>
                {!committed && (
                  <td className="px-3 py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
                      onClick={() => setEditRow(row)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
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

      {editRow && !committed && (
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
                Format C בלבד: חייב להכיל גיליונות &quot;הכנסות&quot; ו-&quot;הוצאות&quot;
              </p>
            </div>
          </>
        )}
      </div>

      <BatchHistoryList />
    </div>
  );
}

// ── Batch history ─────────────────────────────────────────────────────────────

function BatchHistoryList() {
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
          <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm">
                <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium">{b.sourceFilename}</span>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {new Date(b.createdAt).toLocaleDateString("he-IL")} ·{" "}
                {b.totalRows} שורות
              </div>
            </div>
            <Badge variant={b.status === "committed" ? "default" : "secondary"} className="text-xs">
              {b.status === "committed" ? "יובא" : b.status}
            </Badge>
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
      toast.success(`יובאו ${result.inserted} תנועות בהצלחה`);
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

      <SummaryCards result={initialSummary} batch={data.batch} />

      {!committed && (
        <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
          {needsReviewCount > 0 && (
            <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-4 w-4" />
              <span>{needsReviewCount} שורות דורשות בדיקה — מומלץ לעיין בהן לפני האישור</span>
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
        committed={committed}
        onRowUpdated={() => { void refetch(); }}
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
