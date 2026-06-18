import "server-only";

import { getDb } from "../db";
import type {
  DetectionResult,
  DetectionWindow,
  DetectionCandidate,
  RejectedCandidate,
  InstallmentAdvisory,
  FinancialNature,
  CashFlowType,
  PnlImpact,
  RecurringFrequency,
  ConfidenceBand,
} from "@/lib/types";
import { getInstallmentAdvisory } from "../db/queries/forecast";

// ── Grouping key ─────────────────────────────────────────────────────────────
// Candidates are grouped by (clean_description, direction) where direction is
// derived from transaction kind: income -> 'income', expense/transfer -> 'expense'.
// This prevents an expense and income with the same description from merging.
export const DETECTION_GROUPING_KEY = "clean_description + direction";

// ── Exclusions ───────────────────────────────────────────────────────────────
// These financial_nature values are excluded from P&L recurring detection.
// They represent non-operating or non-P&L cash movements that should not appear
// as recurring subscription/income candidates.
const EXCLUDED_NATURES: ReadonlySet<string> = new Set([
  "credit_card_payment",
  "internal_transfer",
  "owner_deposit",
  "owner_draw",
  "loan_received",
  "loan_repayment",
  "refund", // refunds must not appear as recurring operating income by default
]);

// ── Detection window ─────────────────────────────────────────────────────────

function computeDetectionWindow(workspaceId: number): DetectionWindow | null {
  const now = new Date();
  // The current calendar month may be incomplete; exclude it from the window.
  const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const rows = getDb()
    .prepare(
      `SELECT DISTINCT strftime('%Y-%m', date) as month
       FROM transactions
       WHERE workspace_id = ?
         AND is_excluded = 0
         AND classification_status IN ('manually_approved', 'auto_classified')
         AND strftime('%Y-%m', date) != ?
       ORDER BY month`
    )
    .all(workspaceId, currentYearMonth) as { month: string }[];

  // Require at least 3 months to form a meaningful window
  if (rows.length < 3) return null;

  const startMonth = rows[0].month;
  const endMonth = rows[rows.length - 1].month;

  const [sy, sm] = startMonth.split("-").map(Number);
  const [ey, em] = endMonth.split("-").map(Number);
  const monthsInWindow = (ey - sy) * 12 + (em - sm) + 1;

  return { startMonth, endMonth, monthsInWindow };
}

// ── Gap analysis ─────────────────────────────────────────────────────────────

function medianGapDays(dates: string[]): number {
  if (dates.length < 2) return 0;
  const sorted = [...dates].sort();
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const a = new Date(sorted[i - 1]).getTime();
    const b = new Date(sorted[i]).getTime();
    gaps.push(Math.round((b - a) / 86_400_000));
  }
  // Compute median from sorted gaps (each occurrence can have multiple same-month
  // entries; use only one per distinct month gap to avoid inflation)
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const mid = Math.floor(sortedGaps.length / 2);
  return sortedGaps.length % 2 !== 0
    ? sortedGaps[mid]
    : Math.round((sortedGaps[mid - 1] + sortedGaps[mid]) / 2);
}

function inferFrequency(
  medianGap: number
): { frequency: RecurringFrequency; intervalMonths: number } {
  if (medianGap >= 20 && medianGap <= 50)
    return { frequency: "monthly", intervalMonths: 1 };
  if (medianGap > 50 && medianGap <= 75)
    return { frequency: "bimonthly", intervalMonths: 2 };
  if (medianGap > 75 && medianGap <= 110)
    return { frequency: "quarterly", intervalMonths: 3 };
  if (medianGap >= 330 && medianGap <= 400)
    return { frequency: "annual", intervalMonths: 12 };
  return { frequency: "irregular", intervalMonths: 0 };
}

// ── Confidence scoring ────────────────────────────────────────────────────────
// Score = (frequency component) + (amount consistency component)
// frequency: how often the pattern covers months in the window
// amount: how consistent the charged amount is

function computeConfidence(
  monthsSeen: number,
  monthsInWindow: number,
  variancePct: number
): { score: number; band: ConfidenceBand } {
  const freqComponent = Math.min(monthsSeen / monthsInWindow, 1.0) * 0.55;
  const amountComponent = (1 - Math.min(variancePct / 100, 1.0)) * 0.45;
  const score = Math.round((freqComponent + amountComponent) * 1000) / 1000;
  const band: ConfidenceBand =
    variancePct < 20 ? "high" : variancePct < 60 ? "medium" : "low";
  return { score, band };
}

// ── Main detection ────────────────────────────────────────────────────────────

interface RawCandidate {
  clean_description: string;
  direction: "income" | "expense";
  financial_nature: string;
  cash_flow_type: string;
  pnl_impact: string;
  months_seen: number;
  total_count: number;
  avg_amount: number;
  min_amount: number;
  max_amount: number;
  variance_pct: number;
  avg_day: number;
  last_seen: string;
}

interface RawDateRow {
  clean_description: string;
  direction: string;
  date: string;
}

interface RawNatureRow {
  clean_description: string;
  direction: string;
  financial_nature: string;
  cash_flow_type: string;
  pnl_impact: string;
  cnt: number;
}

export function runDetection(workspaceId: number): DetectionResult {
  const window = computeDetectionWindow(workspaceId);
  if (!window) {
    return {
      window: { startMonth: "", endMonth: "", monthsInWindow: 0 },
      groupingKey: DETECTION_GROUPING_KEY,
      candidates: { high: [], medium: [], low: [], rejected: [] },
      installmentAdvisory: getInstallmentAdvisory(workspaceId),
    };
  }

  const windowFrom = `${window.startMonth}-01`;
  // Include through last day of end month
  const [ey, em] = window.endMonth.split("-").map(Number);
  const windowTo = new Date(ey, em, 0).toISOString().slice(0, 10);

  // --- Step 1: aggregate candidates ---
  const rawCandidates = getDb()
    .prepare(
      `SELECT
         clean_description,
         CASE WHEN kind = 'income' THEN 'income' ELSE 'expense' END AS direction,
         financial_nature,
         cash_flow_type,
         pnl_impact,
         COUNT(DISTINCT strftime('%Y-%m', date))            AS months_seen,
         COUNT(*)                                           AS total_count,
         ROUND(AVG(ABS(charged_amount)), 2)                 AS avg_amount,
         ROUND(MIN(ABS(charged_amount)), 2)                 AS min_amount,
         ROUND(MAX(ABS(charged_amount)), 2)                 AS max_amount,
         ROUND(
           (MAX(ABS(charged_amount)) - MIN(ABS(charged_amount)))
           / NULLIF(AVG(ABS(charged_amount)), 0) * 100, 1) AS variance_pct,
         ROUND(AVG(CAST(strftime('%d', date) AS INTEGER)), 0) AS avg_day,
         MAX(date)                                          AS last_seen
       FROM transactions
       WHERE workspace_id = ?
         AND is_excluded = 0
         AND classification_status IN ('manually_approved', 'auto_classified')
         AND kind != 'transfer'
         AND financial_nature NOT IN (
           'credit_card_payment', 'internal_transfer',
           'owner_deposit', 'owner_draw',
           'loan_received', 'loan_repayment', 'refund'
         )
         AND date >= ? AND date <= ?
       GROUP BY clean_description,
                CASE WHEN kind = 'income' THEN 'income' ELSE 'expense' END
       HAVING months_seen >= 3`
    )
    .all(workspaceId, windowFrom, windowTo) as RawCandidate[];

  if (rawCandidates.length === 0) {
    return {
      window,
      groupingKey: DETECTION_GROUPING_KEY,
      candidates: { high: [], medium: [], low: [], rejected: [] },
      installmentAdvisory: getInstallmentAdvisory(workspaceId),
    };
  }

  // --- Step 2: fetch all dates for all candidates in a single query ---
  const descList = rawCandidates.map((c) => c.clean_description);
  const placeholders = descList.map(() => "?").join(",");
  const allDates = getDb()
    .prepare(
      `SELECT
         clean_description,
         CASE WHEN kind = 'income' THEN 'income' ELSE 'expense' END AS direction,
         date
       FROM transactions
       WHERE workspace_id = ?
         AND is_excluded = 0
         AND classification_status IN ('manually_approved', 'auto_classified')
         AND kind != 'transfer'
         AND financial_nature NOT IN (
           'credit_card_payment', 'internal_transfer',
           'owner_deposit', 'owner_draw',
           'loan_received', 'loan_repayment', 'refund'
         )
         AND date >= ? AND date <= ?
         AND clean_description IN (${placeholders})
       ORDER BY clean_description, direction, date`
    )
    .all(workspaceId, windowFrom, windowTo, ...descList) as RawDateRow[];

  // --- Step 3: fetch dominant financial_nature per group ---
  const allNatures = getDb()
    .prepare(
      `SELECT
         clean_description,
         CASE WHEN kind = 'income' THEN 'income' ELSE 'expense' END AS direction,
         financial_nature, cash_flow_type, pnl_impact,
         COUNT(*) AS cnt
       FROM transactions
       WHERE workspace_id = ?
         AND is_excluded = 0
         AND classification_status IN ('manually_approved', 'auto_classified')
         AND kind != 'transfer'
         AND financial_nature NOT IN (
           'credit_card_payment', 'internal_transfer',
           'owner_deposit', 'owner_draw',
           'loan_received', 'loan_repayment', 'refund'
         )
         AND date >= ? AND date <= ?
         AND clean_description IN (${placeholders})
       GROUP BY clean_description, direction, financial_nature, cash_flow_type, pnl_impact
       ORDER BY cnt DESC`
    )
    .all(workspaceId, windowFrom, windowTo, ...descList) as RawNatureRow[];

  // Build lookup: key -> dominant nature
  const domNature = new Map<
    string,
    { financial_nature: string; cash_flow_type: string; pnl_impact: string }
  >();
  for (const n of allNatures) {
    const k = `${n.clean_description}::${n.direction}`;
    if (!domNature.has(k)) {
      domNature.set(k, {
        financial_nature: n.financial_nature,
        cash_flow_type: n.cash_flow_type,
        pnl_impact: n.pnl_impact,
      });
    }
  }

  // Build date lookup: key -> sorted dates[]
  const dateMap = new Map<string, string[]>();
  for (const d of allDates) {
    const k = `${d.clean_description}::${d.direction}`;
    if (!dateMap.has(k)) dateMap.set(k, []);
    dateMap.get(k)!.push(d.date);
  }

  // --- Step 4: score and classify ---
  const result: DetectionResult = {
    window,
    groupingKey: DETECTION_GROUPING_KEY,
    candidates: { high: [], medium: [], low: [], rejected: [] },
    installmentAdvisory: getInstallmentAdvisory(workspaceId),
  };

  for (const raw of rawCandidates) {
    const key = `${raw.clean_description}::${raw.direction}`;
    const dates = dateMap.get(key) ?? [];
    const median = medianGapDays(dates);
    const { frequency, intervalMonths } = inferFrequency(median);
    const variance = raw.variance_pct ?? 0;
    const { score, band } = computeConfidence(
      raw.months_seen,
      window.monthsInWindow,
      variance
    );

    const nat = domNature.get(key) ?? {
      financial_nature: raw.financial_nature,
      cash_flow_type: raw.cash_flow_type,
      pnl_impact: raw.pnl_impact,
    };

    const candidate: DetectionCandidate = {
      descriptionPattern: raw.clean_description,
      direction: raw.direction,
      financialNature: nat.financial_nature as FinancialNature,
      cashFlowType: nat.cash_flow_type as CashFlowType,
      pnlImpact: nat.pnl_impact as PnlImpact,
      monthsSeen: raw.months_seen,
      monthsInWindow: window.monthsInWindow,
      totalOccurrences: raw.total_count,
      avgAmount: raw.avg_amount,
      minAmount: raw.min_amount,
      maxAmount: raw.max_amount,
      variancePct: variance,
      expectedDayOfMonth: raw.avg_day,
      lastSeen: raw.last_seen,
      frequency,
      medianGapDays: median,
      confidenceScore: score,
      confidenceBand: band,
      // Income candidates require explicit user confirmation of financial_nature
      // and pnl_impact before entering any forecast totals.
      isIncomeAdvisoryOnly: raw.direction === "income",
    };

    // Reject extremely low-confidence or near-zero patterns
    if (score < 0.1 || raw.avg_amount < 0.5) {
      const rejected: RejectedCandidate = {
        descriptionPattern: raw.clean_description,
        direction: raw.direction,
        monthsSeen: raw.months_seen,
        totalOccurrences: raw.total_count,
        variancePct: variance,
        rejectionReason:
          score < 0.1 ? "confidence_too_low" : "amount_near_zero",
      };
      result.candidates.rejected.push(rejected);
      continue;
    }

    if (band === "high") result.candidates.high.push(candidate);
    else if (band === "medium") result.candidates.medium.push(candidate);
    else result.candidates.low.push(candidate);
  }

  // Sort each band by score descending
  const sortByScore = (a: DetectionCandidate, b: DetectionCandidate) =>
    b.confidenceScore - a.confidenceScore;
  result.candidates.high.sort(sortByScore);
  result.candidates.medium.sort(sortByScore);
  result.candidates.low.sort(sortByScore);

  return result;
}
