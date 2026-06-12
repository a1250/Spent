import * as XLSX from "xlsx";
import type { ImportAdapter } from "./types";
import { legacyExcelAdapter } from "./legacy-excel";
import { creditCardIsracardAdapter } from "./credit-card-isracard";
import { creditCardCalAdapter } from "./credit-card-cal";
import { bankCheckingHebrewAdapter } from "./bank-checking-hebrew";
import { normalizeHeader } from "./shared/headers";

const ADAPTERS: ImportAdapter[] = [
  legacyExcelAdapter,
  creditCardIsracardAdapter,
  creditCardCalAdapter,
  bankCheckingHebrewAdapter,
];

export type AdapterDetectionResult =
  | { status: "supported"; adapter: ImportAdapter }
  | {
      status: "unsupported_isracard_profile";
      profileHint: string;
    }
  | { status: "unsupported" };

export class ImportDetectionError extends Error {
  constructor(
    public readonly code:
      | "unsupported_import_format"
      | "unsupported_isracard_profile",
    message: string,
    public readonly profileHint: string | null = null
  ) {
    super(message);
    this.name = "ImportDetectionError";
  }
}

function looksLikeRichIsracard(workbook: XLSX.WorkBook): boolean {
  if (
    workbook.SheetNames.includes("עסקאות במועד החיוב") ||
    workbook.SheetNames.includes('עסקאות חו"ל ומט"ח')
  ) {
    return true;
  }

  return workbook.SheetNames.some((sheetName) => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(
      workbook.Sheets[sheetName],
      { header: 1, raw: true, defval: null }
    );
    return rows.slice(0, 10).some((row) => {
      const headers = new Set(row.map(normalizeHeader));
      return (
        headers.has("4 ספרות אחרונות של כרטיס האשראי") &&
        headers.has("סכום עסקה מקורי") &&
        headers.has("מטבע עסקה מקורי")
      );
    });
  });
}

export function detectImportAdapter(
  workbook: XLSX.WorkBook
): AdapterDetectionResult {
  const matches = ADAPTERS.filter((adapter) => adapter.detect(workbook));
  if (matches.length === 1) {
    return { status: "supported", adapter: matches[0] };
  }
  if (matches.length > 1) {
    throw new Error(
      `Ambiguous import format: ${matches.map((adapter) => adapter.key).join(", ")}`
    );
  }
  if (looksLikeRichIsracard(workbook)) {
    return {
      status: "unsupported_isracard_profile",
      profileHint: "rich_transaction_export",
    };
  }
  return { status: "unsupported" };
}
