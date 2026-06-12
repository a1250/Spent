import * as XLSX from "xlsx";
import type { AdapterParseResult, ParsedImportRow } from "../types";
import { normalizeCurrency } from "../shared/currencies";
import { parseImportDate } from "../shared/dates";
import { normalizeHeader } from "../shared/headers";

export const ISRACARD_SHEET = "פירוט עסקאות";
const PENDING_SECTION = "עסקאות שטרם נקלטו";
const BILLED_SECTION = "עסקאות למועד חיוב";

function asText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function findRowWithValue(rows: unknown[][], value: string): number {
  return rows.findIndex((row) => row.some((cell) => normalizeHeader(cell) === value));
}

function extractCardLast4(rows: unknown[][]): string | null {
  for (const row of rows.slice(0, 12)) {
    for (const cell of row) {
      const match = String(cell ?? "").match(/-\s*(\d{4})\s*$/);
      if (match) return match[1];
    }
  }
  return null;
}

function parseSection(
  rawRows: unknown[][],
  sectionRowIndex: number,
  section: "pending_transactions" | "billed_transactions",
  cardLast4: string | null
): { rows: ParsedImportRow[]; skipped: number } {
  const headerIndex = sectionRowIndex + 1;
  const headers = rawRows[headerIndex].map(normalizeHeader);
  const indexOf = (header: string) => headers.indexOf(header);
  const dateIndex = indexOf("תאריך רכישה");
  const merchantIndex = indexOf("שם בית עסק");
  const originalAmountIndex = indexOf("סכום עסקה");
  const originalCurrencyIndex = indexOf("מטבע עסקה");
  const chargedAmountIndex = indexOf("סכום חיוב");
  const chargedCurrencyIndex = indexOf("מטבע חיוב");
  const voucherIndex = indexOf("מס' שובר");
  const notesIndex = indexOf("פירוט נוסף");

  const rows: ParsedImportRow[] = [];
  let skipped = 0;

  for (let index = headerIndex + 1; index < rawRows.length; index++) {
    const raw = rawRows[index];
    const rowValues = raw.map(normalizeHeader);
    if (
      rowValues.includes(PENDING_SECTION) ||
      rowValues.includes(BILLED_SECTION) ||
      rowValues.some((value) => value.startsWith("תנאים משפטיים"))
    ) {
      break;
    }

    const date = parseImportDate(raw[dateIndex]);
    const merchant = asText(raw[merchantIndex]);
    const originalRaw = raw[originalAmountIndex];
    const chargedRaw =
      chargedAmountIndex >= 0 ? raw[chargedAmountIndex] : originalRaw;
    const amount =
      typeof chargedRaw === "number"
        ? chargedRaw
        : typeof originalRaw === "number"
          ? originalRaw
          : null;

    if (!date || !merchant || amount == null || merchant.startsWith('סה"כ')) {
      if (raw.some((value) => value != null && String(value).trim())) skipped++;
      continue;
    }

    const originalAmount =
      typeof originalRaw === "number" ? Math.abs(originalRaw) : Math.abs(amount);
    const originalCurrency =
      normalizeCurrency(raw[originalCurrencyIndex]) ?? "ILS";
    const currency =
      normalizeCurrency(
        chargedCurrencyIndex >= 0 ? raw[chargedCurrencyIndex] : null
      ) ?? originalCurrency;
    const isPending = section === "pending_transactions";
    const isRefund = amount < 0;

    rows.push({
      rawRowNumber: index + 1,
      rawDate: String(raw[dateIndex] ?? ""),
      rawAmount: String(amount),
      rawDescription: merchant,
      rawAccount: cardLast4,
      rawBalance: null,
      rawMetadata: {
        sheetName: ISRACARD_SHEET,
        sourceRow: raw,
      },
      date,
      amount: Math.abs(amount),
      direction: isRefund ? "income" : "expense",
      account: cardLast4,
      counterparty: merchant,
      cleanDescription: merchant,
      sourceType: "credit_card_isracard",
      sourceSection: section,
      billingDate: null,
      cardLast4,
      digitalWalletCardId: null,
      voucherNumber: asText(raw[voucherIndex]),
      originalAmount,
      originalCurrency,
      fxRate: null,
      transactionType: null,
      paymentChannel: null,
      sourceCategory: null,
      currency,
      transactionStatus: isPending ? "pending" : "completed",
      notes: asText(raw[notesIndex]),
      financialNature: isRefund ? "refund" : "unknown",
      cashFlowType: isPending
        ? "pending"
        : isRefund
          ? "real_cash_in"
          : "real_cash_out",
      pnlImpact: "maybe",
      isRefund,
      legacyCategory: null,
      sourceSheetName: ISRACARD_SHEET,
    });
  }

  return { rows, skipped };
}

export function isIsracardWorkbook(workbook: XLSX.WorkBook): boolean {
  const sheet = workbook.Sheets[ISRACARD_SHEET];
  if (!sheet) return false;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });
  return (
    findRowWithValue(rows, PENDING_SECTION) >= 0 &&
    findRowWithValue(rows, BILLED_SECTION) >= 0
  );
}

export function parseIsracardWorkbook(
  workbook: XLSX.WorkBook
): AdapterParseResult {
  const sheet = workbook.Sheets[ISRACARD_SHEET];
  if (!sheet) throw new Error(`Missing sheet "${ISRACARD_SHEET}"`);

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });
  const cardLast4 = extractCardLast4(rawRows);
  const pendingIndex = findRowWithValue(rawRows, PENDING_SECTION);
  const billedIndex = findRowWithValue(rawRows, BILLED_SECTION);
  if (pendingIndex < 0 || billedIndex < 0) {
    throw new Error("Isracard transaction sections were not found");
  }

  const pending = parseSection(
    rawRows,
    pendingIndex,
    "pending_transactions",
    cardLast4
  );
  const billed = parseSection(
    rawRows,
    billedIndex,
    "billed_transactions",
    cardLast4
  );

  return {
    rows: [...pending.rows, ...billed.rows],
    skipped: pending.skipped + billed.skipped,
  };
}
