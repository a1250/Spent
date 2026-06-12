import * as XLSX from "xlsx";
import type { AdapterParseResult, ParsedImportRow } from "../types";
import { parseImportDate } from "../shared/dates";
import { findHeaderRow, normalizeHeader } from "../shared/headers";

export const BANK_CHECKING_SHEET = "עובר ושב";
export const BANK_CHECKING_HEADERS = [
  "תאריך",
  "יום ערך",
  "תיאור התנועה",
  "₪ זכות/חובה",
  "₪ יתרה",
  "אסמכתה",
  "ערוץ ביצוע",
];

const FUTURE_SECTION = "תנועות עתידיות";

interface AccountMetadata {
  label: string | null;
  maskedNumber: string | null;
}

function asText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function extractAccountMetadata(rows: unknown[][]): AccountMetadata {
  for (const row of rows.slice(0, 8)) {
    for (const cell of row) {
      const match = String(cell ?? "").match(
        /חשבון:\s*(\d+)(?:\s*\|\s*(.+))?/
      );
      if (!match) continue;
      const digits = match[1];
      return {
        label: match[2]?.trim() || null,
        maskedNumber:
          digits.length >= 4 ? `••••${digits.slice(-4)}` : "••••",
      };
    }
  }
  return { label: null, maskedNumber: null };
}

function findFutureSection(rows: unknown[][]): number {
  return rows.findIndex((row) =>
    row.some((cell) => normalizeHeader(cell) === FUTURE_SECTION)
  );
}

function indexStartingWith(headers: string[], prefix: string): number {
  return headers.findIndex((header) => header.startsWith(prefix));
}

function parseRows(
  rawRows: unknown[][],
  headerIndex: number,
  endIndex: number,
  section: "checking_transactions" | "future_transactions",
  account: AccountMetadata
): AdapterParseResult {
  const headers = rawRows[headerIndex].map(normalizeHeader);
  const dateIndex = headers.indexOf("תאריך");
  const valueDateIndex = headers.indexOf("יום ערך");
  const descriptionIndex = headers.indexOf("תיאור התנועה");
  const amountIndex = indexStartingWith(headers, "₪ זכות/חובה");
  const balanceIndex = indexStartingWith(headers, "₪ יתרה");
  const referenceIndex = headers.indexOf("אסמכתה");
  const futureNotesIndex = headers.indexOf("הערות");
  const feeNoteIndex = headers.indexOf("עמלה");
  const executionChannelIndex = headers.indexOf("ערוץ ביצוע");
  const rows: ParsedImportRow[] = [];
  let skipped = 0;

  for (let index = headerIndex + 1; index < endIndex; index++) {
    const raw = rawRows[index];
    const date = parseImportDate(raw[dateIndex]);
    const valueDate = parseImportDate(raw[valueDateIndex]);
    const description = asText(raw[descriptionIndex]);
    const signedAmount = raw[amountIndex];
    const balanceAfter = raw[balanceIndex];

    if (!date || !description || typeof signedAmount !== "number") {
      if (raw.some((value) => value != null && String(value).trim())) skipped++;
      continue;
    }

    const isPending = section === "future_transactions";
    const direction = signedAmount < 0 ? "expense" : "income";
    const reference =
      referenceIndex >= 0 ? asText(raw[referenceIndex]) : null;
    const feeOrChannelNote =
      feeNoteIndex >= 0
        ? asText(raw[feeNoteIndex])
        : futureNotesIndex >= 0
          ? asText(raw[futureNotesIndex])
          : null;
    const executionChannel =
      executionChannelIndex >= 0
        ? asText(raw[executionChannelIndex])
        : null;

    rows.push({
      rawRowNumber: index + 1,
      rawDate: String(raw[dateIndex] ?? ""),
      rawAmount: String(signedAmount),
      rawDescription: description,
      rawAccount: account.maskedNumber,
      rawBalance:
        typeof balanceAfter === "number" ? String(balanceAfter) : null,
      rawMetadata: {
        sheetName: BANK_CHECKING_SHEET,
        sourceSection: section,
        accountLabel: account.label,
        accountNumberMasked: account.maskedNumber,
        sourceRow: raw,
      },
      date,
      amount: Math.abs(signedAmount),
      direction,
      account: account.maskedNumber,
      counterparty: description,
      cleanDescription: description,
      sourceType: "bank_checking_account",
      sourceSection: section,
      billingDate: null,
      cardLast4: null,
      digitalWalletCardId: null,
      voucherNumber: null,
      originalAmount: Math.abs(signedAmount),
      originalCurrency: "ILS",
      fxRate: null,
      transactionType: null,
      paymentChannel: executionChannel,
      sourceCategory: null,
      currency: "ILS",
      transactionStatus: isPending ? "pending" : "completed",
      notes: feeOrChannelNote,
      financialNature: "unknown",
      cashFlowType: isPending
        ? "pending"
        : direction === "income"
          ? "real_cash_in"
          : "real_cash_out",
      pnlImpact: "maybe",
      legacyCategory: null,
      sourceSheetName: BANK_CHECKING_SHEET,
      valueDate,
      balanceAfter:
        typeof balanceAfter === "number" ? balanceAfter : null,
      reference,
      bankAccountLabel: account.label,
      bankAccountNumberMasked: account.maskedNumber,
      sourceBank: null,
    });
  }

  return { rows, skipped };
}

export function isBankCheckingHebrewWorkbook(
  workbook: XLSX.WorkBook
): boolean {
  const sheet = workbook.Sheets[BANK_CHECKING_SHEET];
  if (!sheet) return false;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });
  return findHeaderRow(rows, BANK_CHECKING_HEADERS) >= 0;
}

export function parseBankCheckingHebrewWorkbook(
  workbook: XLSX.WorkBook
): AdapterParseResult {
  const sheet = workbook.Sheets[BANK_CHECKING_SHEET];
  if (!sheet) throw new Error(`Missing sheet "${BANK_CHECKING_SHEET}"`);

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });
  const headerIndex = findHeaderRow(rawRows, BANK_CHECKING_HEADERS);
  if (headerIndex < 0) {
    throw new Error("Hebrew bank checking headers were not found");
  }

  const account = extractAccountMetadata(rawRows);
  const futureSectionIndex = findFutureSection(rawRows);
  const regular = parseRows(
    rawRows,
    headerIndex,
    futureSectionIndex >= 0 ? futureSectionIndex : rawRows.length,
    "checking_transactions",
    account
  );

  if (futureSectionIndex < 0) return regular;

  const futureHeaderIndex = rawRows.findIndex(
    (row, index) =>
      index > futureSectionIndex &&
      row.map(normalizeHeader).includes("תיאור התנועה") &&
      row.map(normalizeHeader).some((header) =>
        header.startsWith("₪ זכות/חובה")
      )
  );
  if (futureHeaderIndex < 0) {
    return { rows: regular.rows, skipped: regular.skipped + 1 };
  }

  const future = parseRows(
    rawRows,
    futureHeaderIndex,
    rawRows.length,
    "future_transactions",
    account
  );
  return {
    rows: [...regular.rows, ...future.rows],
    skipped: regular.skipped + future.skipped,
  };
}
