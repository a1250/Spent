import * as XLSX from "xlsx";
import type { AdapterParseResult, ParsedImportRow } from "../types";
import {
  calculateFxRate,
  extractOriginalAmountFromNotes,
} from "../shared/currencies";
import { parseImportDate } from "../shared/dates";
import { findHeaderRow, normalizeHeader } from "../shared/headers";

export const CAL_SHEET = "פירוט עסקאות וזיכויים";
export const CAL_HEADERS = [
  "תאריך עסקה",
  "שם בית עסק",
  'סכום בש"ח',
  "מועד חיוב",
];

function asText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function cardLast4FromTitle(value: unknown): string | null {
  const match = String(value ?? "").match(/כרטיס\s+\S+\s+(\d{4})\s*$/);
  return match?.[1] ?? null;
}

export function isCalWorkbook(workbook: XLSX.WorkBook): boolean {
  const sheet = workbook.Sheets[CAL_SHEET];
  if (!sheet) return false;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });
  return findHeaderRow(rows, CAL_HEADERS) >= 0;
}

export function parseCalWorkbook(workbook: XLSX.WorkBook): AdapterParseResult {
  const sheet = workbook.Sheets[CAL_SHEET];
  if (!sheet) throw new Error(`Missing sheet "${CAL_SHEET}"`);

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });
  const headerIndex = findHeaderRow(rawRows, CAL_HEADERS);
  if (headerIndex < 0) throw new Error("CAL transaction headers were not found");

  const headers = rawRows[headerIndex].map(normalizeHeader);
  const indexOf = (header: string) => headers.indexOf(header);
  const dateIndex = indexOf("תאריך עסקה");
  const merchantIndex = indexOf("שם בית עסק");
  const amountIndex = indexOf('סכום בש"ח');
  const billingDateIndex = indexOf("מועד חיוב");
  const transactionTypeIndex = indexOf("סוג עסקה");
  const walletIndex = indexOf("מזהה כרטיס בארנק דיגילטי");
  const notesIndex = indexOf("הערות");
  const cardLast4 = cardLast4FromTitle(rawRows[0]?.[0]);

  const rows: ParsedImportRow[] = [];
  let skipped = 0;

  for (let index = headerIndex + 1; index < rawRows.length; index++) {
    const raw = rawRows[index];
    const date = parseImportDate(raw[dateIndex]);
    const merchant = asText(raw[merchantIndex]);
    const chargedAmount = raw[amountIndex];

    if (!date || !merchant || typeof chargedAmount !== "number") {
      if (raw.some((value) => value != null && String(value).trim())) skipped++;
      continue;
    }

    const transactionType = asText(raw[transactionTypeIndex]);
    const notes = asText(raw[notesIndex]);
    const isRefund =
      chargedAmount < 0 || Boolean(transactionType?.includes("זיכוי"));
    const foreign = extractOriginalAmountFromNotes(notes);
    const currency = "ILS";
    const originalAmount = foreign?.amount ?? Math.abs(chargedAmount);
    const originalCurrency = foreign?.currency ?? currency;

    rows.push({
      rawRowNumber: index + 1,
      rawDate: String(raw[dateIndex] ?? ""),
      rawAmount: String(chargedAmount),
      rawDescription: merchant,
      rawAccount: cardLast4,
      rawBalance: null,
      rawMetadata: {
        sheetName: CAL_SHEET,
        sourceRow: raw,
      },
      date,
      amount: Math.abs(chargedAmount),
      direction: isRefund ? "income" : "expense",
      account: cardLast4,
      counterparty: merchant,
      cleanDescription: merchant,
      sourceType: "credit_card_cal",
      sourceSection: "billed_transactions",
      billingDate: parseImportDate(raw[billingDateIndex]),
      cardLast4,
      digitalWalletCardId: asText(raw[walletIndex]),
      voucherNumber: null,
      originalAmount,
      originalCurrency,
      fxRate: calculateFxRate(
        chargedAmount,
        currency,
        originalAmount,
        originalCurrency
      ),
      transactionType,
      paymentChannel: null,
      sourceCategory: null,
      currency,
      transactionStatus: "completed",
      notes,
      financialNature: isRefund ? "refund" : "unknown",
      cashFlowType: isRefund ? "real_cash_in" : "real_cash_out",
      pnlImpact: "maybe",
      isRefund,
      legacyCategory: null,
      sourceSheetName: CAL_SHEET,
    });
  }

  return { rows, skipped };
}
