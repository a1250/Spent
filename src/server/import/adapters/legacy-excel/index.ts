import type { ImportAdapter, ParsedImportRow } from "../types";
import { parseFormatCWorkbook, isFormatC } from "./format-c";
import { seedClassificationRulesFromWorkbook } from "./index-seeder";
import { countSeedRules } from "@/server/db/queries/classification-rules";

export const legacyExcelAdapter: ImportAdapter = {
  key: "legacy-excel",
  sourceType: "legacy_excel",
  label: "Legacy Excel",
  detect: isFormatC,
  beforeStage: ({ workbook, workspaceId }) => {
    const hasIndexes =
      workbook.SheetNames.includes("אינדקס הכנסות") &&
      workbook.SheetNames.includes("אינדקס הוצאות");
    if (hasIndexes && countSeedRules(workspaceId) === 0) {
      seedClassificationRulesFromWorkbook(workbook, workspaceId);
    }
  },
  parse: (workbook) => {
    const result = parseFormatCWorkbook(workbook);
    const rows: ParsedImportRow[] = [
      ...result.incomeRows,
      ...result.expenseRows,
    ].map((row) => ({
      rawRowNumber: row.rawRowNumber,
      rawDate: row.rawDate,
      rawAmount: row.rawAmount,
      rawDescription: row.rawDescription,
      rawAccount: row.rawAccount,
      rawBalance: row.rawBalance,
      rawMetadata: row.rawMetadata,
      date: row.date,
      amount: row.amount,
      direction: row.direction,
      account: row.rawAccount,
      counterparty: row.counterparty,
      cleanDescription: row.cleanDescription,
      sourceType: "legacy_excel",
      sourceSection: row.direction === "income" ? "income" : "expenses",
      billingDate: null,
      cardLast4: null,
      digitalWalletCardId: null,
      voucherNumber: null,
      originalAmount: row.amount,
      originalCurrency: "ILS",
      fxRate: null,
      transactionType: null,
      paymentChannel: null,
      sourceCategory: row.hebrewCategory || null,
      currency: "ILS",
      transactionStatus: "completed",
      notes:
        typeof row.rawMetadata.notes === "string"
          ? row.rawMetadata.notes
          : null,
      legacyCategory: row.hebrewCategory || null,
      sourceSheetName: row.rawMetadata.sheetName,
    }));

    return {
      rows,
      skipped: result.skippedIncome + result.skippedExpense,
    };
  },
};
