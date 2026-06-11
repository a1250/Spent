/**
 * Reads the legacy Excel index sheets (אינדקס הכנסות + אינדקס הוצאות) and
 * seeds `classification_rules` with `created_from = 'seed'`.
 *
 * This file is the ONLY place that knows about the Hebrew category names
 * from the legacy Excel format.  All downstream code uses the generic
 * FinancialNature / PnlImpact types only.
 *
 * Safe to re-run: uses INSERT OR IGNORE so existing seed rules are never
 * overwritten.
 */

import * as XLSX from "xlsx";
import type { FinancialNature, PnlImpact, TransactionDirection } from "@/lib/types";
import { bulkInsertSeedRules } from "@/server/db/queries/classification-rules";

// ── Hebrew category → financial intelligence mapping ─────────────────────────

interface CategoryMapping {
  financialNature: FinancialNature;
  pnlImpact: PnlImpact;
}

const INCOME_CATEGORY_MAP: Record<string, CategoryMapping> = {
  "העברה מחשבון מכבסה":         { financialNature: "internal_transfer",  pnlImpact: "no"    },
  "העברות מהחשבון של המכבסה":   { financialNature: "internal_transfer",  pnlImpact: "no"    },
  "הלוואה":                      { financialNature: "loan_received",       pnlImpact: "no"    },
  "אמא הלוואה":                  { financialNature: "loan_received",       pnlImpact: "no"    },
  "מניות":                       { financialNature: "investment",          pnlImpact: "no"    },
  "SHARE":                       { financialNature: "investment",          pnlImpact: "no"    },
  "השקעות":                      { financialNature: "investment",          pnlImpact: "no"    },
  "הפקדה":                       { financialNature: "owner_deposit",       pnlImpact: "no"    },
  "ADVANCE":                     { financialNature: "working_capital",     pnlImpact: "maybe" },
  "מזומן חוזר":                  { financialNature: "receivable_collection",pnlImpact: "maybe"},
  "מזומן חוזר/זיכויים":          { financialNature: "receivable_collection",pnlImpact: "maybe"},
  "משכורת":                      { financialNature: "operating_income",    pnlImpact: "yes"   },
  "שכירות":                      { financialNature: "operating_income",    pnlImpact: "yes"   },
  "החזר ביטוחים":                { financialNature: "operating_income",    pnlImpact: "yes"   },
  "זיכויים":                     { financialNature: "operating_income",    pnlImpact: "yes"   },
  "כללי":                        { financialNature: "operating_income",    pnlImpact: "yes"   },
  "מכבסה":                       { financialNature: "operating_income",    pnlImpact: "yes"   },
  "גזיבו":                       { financialNature: "operating_income",    pnlImpact: "yes"   },
  "חשבונות דיזיגנוף":           { financialNature: "operating_income",    pnlImpact: "yes"   },
};

const EXPENSE_CATEGORY_MAP: Record<string, CategoryMapping> = {
  "השקעות":                      { financialNature: "investment",          pnlImpact: "no"    },
  "הלוואת":                      { financialNature: "loan_repayment",      pnlImpact: "no"    },
  "הלוואה":                      { financialNature: "loan_repayment",      pnlImpact: "no"    },
  "ADVANCE":                     { financialNature: "working_capital",     pnlImpact: "maybe" },
  "משיכת מזומן":                 { financialNature: "working_capital",     pnlImpact: "maybe" },
  "מזומן חוזר":                  { financialNature: "working_capital",     pnlImpact: "maybe" },
  "ארנונה":                      { financialNature: "tax",                 pnlImpact: "yes"   },
  "מס הכנסה/ביטוח לאומי":        { financialNature: "tax",                 pnlImpact: "yes"   },
  "בריאות":                      { financialNature: "operating_expense",   pnlImpact: "yes"   },
  "בגדים":                       { financialNature: "operating_expense",   pnlImpact: "yes"   },
  "ריהוט לבית":                  { financialNature: "operating_expense",   pnlImpact: "yes"   },
  "שכירות":                      { financialNature: "operating_expense",   pnlImpact: "yes"   },
  "כללי":                        { financialNature: "operating_expense",   pnlImpact: "yes"   },
  "בנק":                         { financialNature: "operating_expense",   pnlImpact: "yes"   },
  "אוכל חוץ":                    { financialNature: "operating_expense",   pnlImpact: "yes"   },
  "נסיעות":                      { financialNature: "operating_expense",   pnlImpact: "yes"   },
  "אפליקציות /שירים - בידור":    { financialNature: "operating_expense",   pnlImpact: "yes"   },
  "סלולר":                       { financialNature: "operating_expense",   pnlImpact: "yes"   },
  "סופר":                        { financialNature: "operating_expense",   pnlImpact: "yes"   },
  "בילויים":                     { financialNature: "operating_expense",   pnlImpact: "yes"   },
  "אינטרנט /נטפליקס":            { financialNature: "operating_expense",   pnlImpact: "yes"   },
  "בית קניות":                   { financialNature: "operating_expense",   pnlImpact: "yes"   },
  "כדורגל":                      { financialNature: "operating_expense",   pnlImpact: "yes"   },
  "חופשה":                       { financialNature: "operating_expense",   pnlImpact: "yes"   },
  "מתנות/תרומות":                { financialNature: "operating_expense",   pnlImpact: "yes"   },
  "קנסות":                       { financialNature: "operating_expense",   pnlImpact: "yes"   },
  "חשמל":                        { financialNature: "operating_expense",   pnlImpact: "yes"   },
  "אבא בית/הוצאות מכבסה":        { financialNature: "operating_expense",   pnlImpact: "yes"   },
  "לימוד":                       { financialNature: "operating_expense",   pnlImpact: "yes"   },
  "PLAYGROUND":                  { financialNature: "operating_expense",   pnlImpact: "yes"   },
  "מים":                         { financialNature: "operating_expense",   pnlImpact: "yes"   },
  "קניות ברשת":                  { financialNature: "operating_expense",   pnlImpact: "yes"   },
  "MYTIV":                       { financialNature: "operating_expense",   pnlImpact: "yes"   },
};

// ── Sheet parsing ─────────────────────────────────────────────────────────────

interface SeedRuleInput {
  matchValue: string;
  financialNature: FinancialNature;
  pnlImpact: PnlImpact;
  direction: TransactionDirection;
  hebrewCategory: string;
}

function parseIncomeIndex(ws: XLSX.WorkSheet): SeedRuleInput[] {
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
  const results: SeedRuleInput[] = [];
  for (const row of rows.slice(1)) {
    const description = (row[0] ?? "").toString().trim();
    const category = (row[1] ?? "").toString().trim();
    if (!description || !category) continue;
    const mapping = INCOME_CATEGORY_MAP[category];
    if (!mapping) continue;
    results.push({
      matchValue: description,
      financialNature: mapping.financialNature,
      pnlImpact: mapping.pnlImpact,
      direction: "income",
      hebrewCategory: category,
    });
  }
  return results;
}

function parseExpenseIndex(ws: XLSX.WorkSheet): SeedRuleInput[] {
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
  const results: SeedRuleInput[] = [];
  for (const row of rows.slice(1)) {
    const merchantName = (row[0] ?? "").toString().trim();
    const category = (row[1] ?? "").toString().trim();
    if (!merchantName || !category) continue;
    const mapping = EXPENSE_CATEGORY_MAP[category];
    if (!mapping) continue;
    results.push({
      matchValue: merchantName,
      financialNature: mapping.financialNature,
      pnlImpact: mapping.pnlImpact,
      direction: "expense",
      hebrewCategory: category,
    });
  }
  return results;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SeedResult {
  inserted: number;
  skipped: number;
  unknownCategories: string[];
}

/**
 * Reads the two index sheets from a Format-C Excel workbook and seeds
 * classification rules for the given workspace.
 *
 * @param filePath  Absolute path to the .xlsx file
 * @param workspaceId  Target workspace
 * @returns Summary of what was inserted vs. skipped
 */
export function seedClassificationRulesFromExcel(
  filePath: string,
  workspaceId: number
): SeedResult {
  const wb = XLSX.readFile(filePath, { cellDates: false });

  const incomeSheet = wb.Sheets["אינדקס הכנסות"];
  const expenseSheet = wb.Sheets["אינדקס הוצאות"];

  if (!incomeSheet) throw new Error('Sheet "אינדקס הכנסות" not found in workbook');
  if (!expenseSheet) throw new Error('Sheet "אינדקס הוצאות" not found in workbook');

  const incomeRules = parseIncomeIndex(incomeSheet);
  const expenseRules = parseExpenseIndex(expenseSheet);

  // Collect rows whose Hebrew category is not in our map (needs review)
  const allIncomeRows = XLSX.utils.sheet_to_json<string[]>(incomeSheet, { header: 1 }).slice(1);
  const allExpenseRows = XLSX.utils.sheet_to_json<string[]>(expenseSheet, { header: 1 }).slice(1);

  const unknownIncome = allIncomeRows
    .map((r) => (r[1] ?? "").toString().trim())
    .filter((cat) => cat && !INCOME_CATEGORY_MAP[cat]);
  const unknownExpense = allExpenseRows
    .map((r) => (r[1] ?? "").toString().trim())
    .filter((cat) => cat && !EXPENSE_CATEGORY_MAP[cat]);

  const unknownCategories = [...new Set([...unknownIncome, ...unknownExpense])];

  const totalRows = allIncomeRows.length + allExpenseRows.length;
  const matched = incomeRules.length + expenseRules.length;

  const rulesPayload = [...incomeRules, ...expenseRules].map((r) => ({
    matchField: "description" as const,
    matchType: "contains" as const,
    matchValue: r.matchValue,
    financialNature: r.financialNature,
    pnlImpact: r.pnlImpact,
    direction: r.direction,
    priority: 100,
    confidenceBoost: 0.45,
  }));

  const inserted = bulkInsertSeedRules(workspaceId, rulesPayload);

  return {
    inserted,
    skipped: totalRows - matched,
    unknownCategories,
  };
}
