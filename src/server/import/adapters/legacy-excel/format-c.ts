/**
 * Parser for Format-C Excel files: the classified workbooks covering 2023-2025.
 *
 * Handles two sheets only (Phase 1 scope):
 *   - הכנסות  (income transactions)
 *   - הוצאות  (expense transactions)
 *
 * All other sheets are ignored.  The parser returns raw structured rows;
 * the caller is responsible for inserting them into import_rows.
 */

import * as XLSX from "xlsx";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FormatCRow {
  rawRowNumber: number;
  rawDate: string;
  rawAmount: string;
  rawDescription: string;
  rawAccount: string | null;
  rawBalance: null;
  rawMetadata: {
    year: number;
    month: number;
    hebrewCategory: string;
    grossAmount?: number;
    notes?: string;
    sheetName: "הכנסות" | "הוצאות";
  };
  // Pre-normalised — safe to promote directly to import_rows normalised layer
  date: string;
  amount: number;
  direction: "income" | "expense";
  counterparty: string | null;
  cleanDescription: string;
  hebrewCategory: string;
}

export interface FormatCParseResult {
  incomeRows: FormatCRow[];
  expenseRows: FormatCRow[];
  skippedIncome: number;
  skippedExpense: number;
}

// ── Date utility ──────────────────────────────────────────────────────────────

function excelSerialToIso(serial: unknown): string | null {
  if (typeof serial !== "number" || serial < 1) return null;
  // Excel epoch offset to Unix epoch (days): 25569 = days from 1900-01-01 to 1970-01-01
  // The famous Excel leap-year bug means we subtract 1 for dates after 1900-02-28.
  const days = serial > 59 ? serial - 25569 : serial - 25568;
  const date = new Date(days * 86400 * 1000);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ── Income sheet parser ───────────────────────────────────────────────────────
// Columns: שנה | חודש | סיווג | תאריך זיכוי | פירוט | סכום נטו | סכום ברוטו

function parseIncomeSheet(ws: XLSX.WorkSheet): { rows: FormatCRow[]; skipped: number } {
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  const rows: FormatCRow[] = [];
  let skipped = 0;

  for (let i = 1; i < raw.length; i++) {
    const r = raw[i] as unknown[];
    const year = r[0];
    const month = r[1];
    const category = r[2]?.toString().trim() ?? "";
    const dateSerial = r[3];
    const description = r[4]?.toString().trim() ?? "";
    const amount = r[5];

    if (typeof year !== "number" || year < 2000 || !description || typeof amount !== "number") {
      skipped++;
      continue;
    }

    const isoDate = excelSerialToIso(dateSerial);
    if (!isoDate) {
      skipped++;
      continue;
    }

    const grossAmount = typeof r[6] === "number" ? r[6] : undefined;

    rows.push({
      rawRowNumber: i,
      rawDate: isoDate,
      rawAmount: String(amount),
      rawDescription: description,
      rawAccount: null,
      rawBalance: null,
      rawMetadata: {
        year: year as number,
        month: month as number,
        hebrewCategory: category,
        grossAmount,
        sheetName: "הכנסות",
      },
      date: isoDate,
      amount: Math.abs(amount),
      direction: "income",
      counterparty: description,
      cleanDescription: description,
      hebrewCategory: category,
    });
  }

  return { rows, skipped };
}

// ── Expense sheet parser ──────────────────────────────────────────────────────
// Row 0: header  (שנה | חודש | מועד חיוב | שם בית עסק | כרטיס | סכום חיוב | פירוט | פירוט לפי אינדקס | null | הערות)
// Row 1: subheader (שנה | חודש | תאריך | נושא | null | סכום חיוב | סיבה | הערות)
// Rows 2+: data

function parseExpenseSheet(ws: XLSX.WorkSheet): { rows: FormatCRow[]; skipped: number } {
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  const rows: FormatCRow[] = [];
  let skipped = 0;

  // data starts at index 2
  for (let i = 2; i < raw.length; i++) {
    const r = raw[i] as unknown[];
    const year = r[0];
    const month = r[1];
    const dateSerial = r[2];
    const merchantName = r[3]?.toString().trim() ?? "";
    const card = r[4]?.toString().trim() || null;
    const amount = r[5];
    const category = r[6]?.toString().trim() ?? r[7]?.toString().trim() ?? "";
    const notes = r[9]?.toString().trim() || undefined;

    if (typeof year !== "number" || year < 2000 || !merchantName || typeof amount !== "number") {
      skipped++;
      continue;
    }

    const isoDate = excelSerialToIso(dateSerial);
    if (!isoDate) {
      skipped++;
      continue;
    }

    rows.push({
      rawRowNumber: i,
      rawDate: isoDate,
      rawAmount: String(amount),
      rawDescription: merchantName,
      rawAccount: card,
      rawBalance: null,
      rawMetadata: {
        year: year as number,
        month: month as number,
        hebrewCategory: category,
        notes,
        sheetName: "הוצאות",
      },
      date: isoDate,
      amount: Math.abs(amount),
      direction: "expense",
      counterparty: merchantName,
      cleanDescription: merchantName,
      hebrewCategory: category,
    });
  }

  return { rows, skipped };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Detects whether the workbook is Format C by checking for the required sheets.
 */
export function isFormatC(wb: XLSX.WorkBook): boolean {
  return wb.SheetNames.includes("הכנסות") && wb.SheetNames.includes("הוצאות");
}

/**
 * Parses both transaction sheets from a Format-C workbook.
 * Throws if the required sheets are missing.
 */
export function parseFormatC(filePath: string): FormatCParseResult {
  const wb = XLSX.readFile(filePath, { cellDates: false });

  if (!isFormatC(wb)) {
    throw new Error(
      'Format C requires sheets "הכנסות" and "הוצאות" — workbook does not match'
    );
  }

  const income = parseIncomeSheet(wb.Sheets["הכנסות"]);
  const expense = parseExpenseSheet(wb.Sheets["הוצאות"]);

  return {
    incomeRows: income.rows,
    expenseRows: expense.rows,
    skippedIncome: income.skipped,
    skippedExpense: expense.skipped,
  };
}
