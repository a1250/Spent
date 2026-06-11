/**
 * Normaliser: converts the raw fields of an ImportRow into the normalised layer.
 *
 * For Format-C rows the parser already pre-computes most normalised fields, so
 * this module mostly validates and canonicalises them.  For future adapters the
 * normaliser will do heavier lifting (currency conversion, description cleaning).
 */

import type { TransactionDirection } from "@/lib/types";

export interface NormalisedFields {
  date: string;
  amount: number;
  direction: TransactionDirection;
  account: string | null;
  counterparty: string | null;
  cleanDescription: string;
}

// ── Description cleaning ──────────────────────────────────────────────────────

// Strips common bank noise: account numbers, reference IDs, trailing/leading
// whitespace, and duplicate spaces.
const BANK_NOISE_PATTERNS = [
  /\b\d{8,}\b/g,           // long numeric sequences (account / ref numbers)
  /\s{2,}/g,               // multiple spaces → single space
];

export function cleanDescription(raw: string): string {
  let s = raw.trim();
  for (const pattern of BANK_NOISE_PATTERNS) {
    s = s.replace(pattern, " ").trim();
  }
  return s;
}

// ── Date validation ───────────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateIsoDate(date: string): boolean {
  if (!ISO_DATE_RE.test(date)) return false;
  const d = new Date(date);
  return !isNaN(d.getTime());
}

// ── Direction inference ───────────────────────────────────────────────────────

export function inferDirection(
  amount: number,
  rawDirection?: string | null
): TransactionDirection {
  if (rawDirection === "income") return "income";
  if (rawDirection === "expense") return "expense";
  if (rawDirection === "transfer") return "transfer";
  // Fall back to sign convention
  if (amount > 0) return "income";
  if (amount < 0) return "expense";
  return "unknown";
}

// ── Public normalise function ─────────────────────────────────────────────────

export interface RawInput {
  rawDate: string | null;
  rawAmount: string | null;
  rawDescription: string | null;
  rawAccount: string | null;
  // Optional pre-normalised hints from the adapter (skip heavy processing if present)
  date?: string | null;
  amount?: number | null;
  direction?: TransactionDirection | null;
  counterparty?: string | null;
  cleanDescription?: string | null;
}

export function normalise(raw: RawInput): NormalisedFields | null {
  // Use pre-normalised date from adapter if valid, otherwise parse raw
  const date = (raw.date && validateIsoDate(raw.date))
    ? raw.date
    : raw.rawDate && validateIsoDate(raw.rawDate)
      ? raw.rawDate
      : null;

  if (!date) return null;

  // Amount
  const amount = raw.amount != null
    ? Math.abs(raw.amount)
    : raw.rawAmount != null
      ? Math.abs(parseFloat(raw.rawAmount))
      : NaN;

  if (isNaN(amount)) return null;

  // Direction
  const direction = inferDirection(amount, raw.direction);

  // Description
  const desc = raw.cleanDescription || cleanDescription(raw.rawDescription ?? "");
  if (!desc) return null;

  return {
    date,
    amount,
    direction,
    account: raw.rawAccount ?? null,
    counterparty: raw.counterparty ?? desc,
    cleanDescription: desc,
  };
}
