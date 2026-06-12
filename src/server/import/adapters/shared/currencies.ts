const CURRENCY_CODES: Record<string, string> = {
  "₪": "ILS",
  "שח": "ILS",
  "ש\"ח": "ILS",
  ILS: "ILS",
  "$": "USD",
  USD: "USD",
  "€": "EUR",
  EUR: "EUR",
  "£": "GBP",
  GBP: "GBP",
};

export function normalizeCurrency(value: unknown): string | null {
  const text = String(value ?? "")
    .replace(/\u200e|\u200f|\u202a|\u202b|\u202c/g, "")
    .trim()
    .toUpperCase();
  return CURRENCY_CODES[text] ?? (text || null);
}

export function extractOriginalAmountFromNotes(
  notes: string | null
): { amount: number; currency: string } | null {
  if (!notes) return null;
  const match = notes.match(
    /סכום\s+העסקה\s+הוא\s*([+-]?\d+(?:[.,]\d+)?)\s*(₪|ש["״]?ח|\$|€|£|[A-Za-z]{3})/i
  );
  if (!match) return null;
  const amount = Number(match[1].replace(",", "."));
  const currency = normalizeCurrency(match[2]);
  if (!Number.isFinite(amount) || !currency) return null;
  return { amount: Math.abs(amount), currency };
}

export function calculateFxRate(
  chargedAmount: number,
  chargedCurrency: string | null,
  originalAmount: number | null,
  originalCurrency: string | null
): number | null {
  if (
    !originalAmount ||
    !originalCurrency ||
    !chargedCurrency ||
    originalCurrency === chargedCurrency
  ) {
    return null;
  }
  return Math.round((Math.abs(chargedAmount) / Math.abs(originalAmount)) * 1e6) / 1e6;
}
