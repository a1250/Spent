import type { FinancialNature, PnlImpact } from "./types";

export type CardPaymentIssuer = "MAX" | "CAL" | "Isracard" | "Visa" | "generic";

export interface CardPaymentDetection {
  detected: boolean;
  issuer: CardPaymentIssuer | null;
  confidence: number;
  reason: string;
  isRefund: boolean;
  suggestedFinancialNature: FinancialNature;
  suggestedPnlImpact: PnlImpact;
  suggestedCategoryId: number | null;
}

interface IssuerPattern {
  issuer: CardPaymentIssuer;
  patterns: RegExp[];
}

// Ordered by specificity: more specific issuers first, generic last.
const ISSUER_PATTERNS: IssuerPattern[] = [
  {
    issuer: "MAX",
    patterns: [/מקס\s+איט/, /MAX\s+IT/i],
  },
  {
    issuer: "CAL",
    patterns: [
      /כ\.א\.ל/,
      /מכאל\s*\d{4}/,
      /\bCAL\b/i,
    ],
  },
  {
    issuer: "Isracard",
    patterns: [/ישראכרט/, /\bIsracard\b/i],
  },
  {
    issuer: "Visa",
    patterns: [/ויזה\s*\d{4}/, /חיוב\s+לכרטיס\s+ויזה/],
  },
  {
    issuer: "generic",
    patterns: [/חיוב\s+לכרטיס/, /כרטיסי\s+אשראי/],
  },
];

// Seeded category IDs (stable — defined in 001_initial.sql and never renumbered).
const CATEGORY_CREDIT_CARD_PAYMENT = 79;
const CATEGORY_REFUNDS_CREDITS = 47;

/**
 * Detects whether a bank-account description line represents a credit-card
 * settlement payment (or a refund flowing back). Pure function — no DB calls.
 *
 * @param description  The raw description string from the bank row.
 * @param signedAmount Signed amount: negative = debit (payment), positive = credit (refund).
 */
export function detectCardPayment(
  description: string,
  signedAmount: number
): CardPaymentDetection {
  const isCredit = signedAmount > 0;

  for (const { issuer, patterns } of ISSUER_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(description)) {
        if (isCredit) {
          return {
            detected: true,
            issuer,
            confidence: 0.80,
            reason: `Credit refund back from ${issuer} card issuer`,
            isRefund: true,
            suggestedFinancialNature: "refund",
            suggestedPnlImpact: "maybe",
            suggestedCategoryId: CATEGORY_REFUNDS_CREDITS,
          };
        }

        return {
          detected: true,
          issuer,
          confidence: 0.90,
          reason: `Credit card settlement payment to ${issuer}`,
          isRefund: false,
          suggestedFinancialNature: "credit_card_payment",
          suggestedPnlImpact: "no",
          suggestedCategoryId: CATEGORY_CREDIT_CARD_PAYMENT,
        };
      }
    }
  }

  return {
    detected: false,
    issuer: null,
    confidence: 0,
    reason: "",
    isRefund: false,
    suggestedFinancialNature: "unknown",
    suggestedPnlImpact: "maybe",
    suggestedCategoryId: null,
  };
}
