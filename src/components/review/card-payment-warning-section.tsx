"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { detectCardPayment } from "@/lib/card-payment-detector";
import type { NeedsReviewTransaction } from "@/lib/types";

const moneyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
});

interface CardPaymentRow {
  tx: NeedsReviewTransaction;
  issuer: string;
  reason: string;
  confidence: number;
  isRefund: boolean;
}

function buildCardPaymentRows(rows: NeedsReviewTransaction[]): CardPaymentRow[] {
  const result: CardPaymentRow[] = [];
  for (const tx of rows) {
    if (tx.financialNature !== "credit_card_payment") continue;
    const detection = detectCardPayment(
      tx.cleanDescription ?? tx.description ?? "",
      tx.chargedAmount
    );
    result.push({
      tx,
      issuer: detection.issuer ?? "unknown",
      reason: detection.reason || "Detected as credit card settlement",
      confidence: detection.detected ? detection.confidence : 0.5,
      isRefund: detection.isRefund,
    });
  }
  return result.sort((a, b) =>
    Math.abs(b.tx.chargedAmount) - Math.abs(a.tx.chargedAmount)
  );
}

export function CardPaymentWarningSection({
  allRows,
}: {
  allRows: NeedsReviewTransaction[];
}) {
  const [expanded, setExpanded] = useState(true);
  const cardRows = buildCardPaymentRows(allRows);

  if (cardRows.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg border border-amber-500/40 bg-amber-500/8 p-2">
          <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-xl text-amber-800 dark:text-amber-200">
              Credit Card Payment / Double-Count Risk
            </h2>
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/8 text-amber-800 dark:text-amber-300"
            >
              {cardRows.length}
            </Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            שורות אלו זוהו כתשלום/סילוק לחברת כרטיס אשראי בחשבון העובר-ושב.
            אם קובץ כרטיס האשראי יובא בנפרד, יתכן ספירה כפולה של ההוצאות.
            אשר את הסיווג כ-credit_card_payment ו-pnl_impact=no לפני הייבוא.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={expanded ? "כווץ" : "הרחב"}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
      </div>

      {expanded && (
        <div className="overflow-x-auto rounded-xl border border-amber-500/30 bg-amber-500/4">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-amber-500/8 text-xs text-muted-foreground">
              <tr className="border-b border-amber-500/20">
                <th className="px-3 py-2 text-start font-medium">tx #</th>
                <th className="px-3 py-2 text-start font-medium">תאריך</th>
                <th className="px-3 py-2 text-start font-medium">תיאור</th>
                <th className="px-3 py-2 text-end font-medium">סכום</th>
                <th className="px-3 py-2 text-start font-medium">מנפיק מזוהה</th>
                <th className="px-3 py-2 text-start font-medium">financial_nature</th>
                <th className="px-3 py-2 text-start font-medium">pnl_impact</th>
                <th className="px-3 py-2 text-start font-medium">סיבה</th>
                <th className="px-3 py-2 text-center font-medium">ביטחון</th>
                <th className="px-3 py-2 text-start font-medium">קובץ כרטיס</th>
                <th className="px-3 py-2 text-start font-medium">needs_review</th>
              </tr>
            </thead>
            <tbody>
              {cardRows.map(({ tx, issuer, reason, confidence, isRefund }) => (
                <tr
                  key={tx.id}
                  className="border-b border-amber-500/15 last:border-0 hover:bg-amber-500/8"
                >
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    #{tx.id}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                    {tx.date}
                  </td>
                  <td className="max-w-[260px] px-3 py-2">
                    <div className="truncate font-medium" title={tx.description}>
                      {tx.cleanDescription ?? tx.description}
                    </div>
                    {tx.importBatchId != null && (
                      <div className="text-[10px] text-muted-foreground">
                        batch #{tx.importBatchId}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-end font-mono font-medium tabular-nums">
                    {moneyFormatter.format(tx.chargedAmount)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="secondary" className="font-mono text-xs">
                      {issuer}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {isRefund ? "refund" : "credit_card_payment"}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant="outline"
                      className="border-emerald-500/35 bg-emerald-500/8 text-xs text-emerald-800 dark:text-emerald-300"
                    >
                      {isRefund ? "maybe" : "no"}
                    </Badge>
                  </td>
                  <td className="max-w-[220px] px-3 py-2 text-xs text-muted-foreground">
                    {reason}
                  </td>
                  <td className="px-3 py-2 text-center font-mono text-xs">
                    {Math.round(confidence * 100)}%
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    בדוק ידנית
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant="outline"
                      className="border-amber-500/40 bg-amber-500/8 text-xs text-amber-800 dark:text-amber-300"
                    >
                      נדרש
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
