import type * as XLSX from "xlsx";
import type {
  CashFlowType,
  FinancialNature,
  ImportAdapterKey,
  ImportRowSourceType,
  PnlImpact,
  TransactionDirection,
} from "@/lib/types";

export interface ParsedImportRow {
  rawRowNumber: number;
  rawDate: string | null;
  rawAmount: string | null;
  rawDescription: string | null;
  rawAccount: string | null;
  rawBalance: string | null;
  rawMetadata: Record<string, unknown> | null;

  date: string;
  amount: number;
  direction: TransactionDirection;
  account: string | null;
  counterparty: string | null;
  cleanDescription: string;

  sourceType: ImportRowSourceType;
  sourceSection: string | null;
  billingDate: string | null;
  cardLast4: string | null;
  digitalWalletCardId: string | null;
  voucherNumber: string | null;
  originalAmount: number | null;
  originalCurrency: string | null;
  fxRate: number | null;
  transactionType: string | null;
  paymentChannel: string | null;
  sourceCategory: string | null;
  currency: string | null;
  transactionStatus: "completed" | "pending";
  notes: string | null;
  valueDate?: string | null;
  balanceAfter?: number | null;
  reference?: string | null;
  bankAccountLabel?: string | null;
  bankAccountNumberMasked?: string | null;
  sourceBank?: string | null;

  financialNature?: FinancialNature;
  cashFlowType?: CashFlowType;
  pnlImpact?: PnlImpact;
  isRefund?: boolean;

  legacyCategory?: string | null;
  sourceSheetName?: string | null;
}

export interface AdapterParseResult {
  rows: ParsedImportRow[];
  skipped: number;
}

export interface ImportAdapter {
  key: ImportAdapterKey;
  sourceType: ImportRowSourceType;
  label: string;
  detect(workbook: XLSX.WorkBook): boolean;
  parse(workbook: XLSX.WorkBook): AdapterParseResult;
  beforeStage?: (context: {
    filePath: string;
    workbook: XLSX.WorkBook;
    workspaceId: number;
  }) => void;
}
