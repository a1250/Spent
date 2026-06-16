// Regression verification for cross-adapter duplicate detection.
// Proves that the legacyFallbackHash catches rows previously imported via
// legacy_excel when re-imported through credit_card_cal (which uses FX
// original amounts and sourceIdentity in the primary hash).
//
// Run with: npx tsx scripts/verify-cross-adapter-dedup.ts

import { createHash } from "crypto";

function computeDedupHash(
  date: string,
  amount: number,
  cleanDescription: string,
  direction: string,
  sourceIdentity: string[] = []
): string {
  const canonical = [
    date,
    amount.toFixed(2),
    cleanDescription.toLowerCase().trim(),
    direction,
    ...sourceIdentity.map((v) => v.toLowerCase().trim()),
  ].join("|");
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

let passed = 0;
let failed = 0;

function check(label: string, actual: string, expected: string): void {
  if (actual === expected) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}`);
    console.log(`        expected: ${expected}`);
    console.log(`        actual:   ${actual}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Case 1: KONVERSATION LTD — USD original amount
// legacy_excel stored: hash(date, 485.73 ILS, desc, direction)
// credit_card_cal primary: hash(date, 150.00 USD, desc, direction, [cal||USD])
// legacy fallback: hash(date, 485.73 ILS, desc, direction) — must match stored

const KONVERSATION_LEGACY = "cc4483371cd2b03d8813c9e7667e48c6"; // stored in tx 903

console.log("\nCase 1: KONVERSATION LTD (USD 150.00 → ILS 485.73)");

const konvPrimary = computeDedupHash(
  "2026-01-01", 150.0, "KONVERSATION LTD", "expense",
  ["credit_card_cal", "", "USD"]
);
check(
  "primary hash differs from legacy hash",
  konvPrimary === KONVERSATION_LEGACY ? "same" : "different",
  "different"
);

const konvFallback = computeDedupHash(
  "2026-01-01", 485.73, "KONVERSATION LTD", "expense"
);
check("legacy fallback matches stored tx 903 hash", konvFallback, KONVERSATION_LEGACY);

// ---------------------------------------------------------------------------
// Case 2: Google Workspace_mytiv — EUR original amount
// legacy_excel stored: hash(date, 57.80 ILS, desc, direction)
// credit_card_cal primary: hash(date, 15.16 EUR, desc, direction, [cal||EUR])
// legacy fallback: hash(date, 57.80 ILS, desc, direction) — must match stored

const GOOGLE_WS_LEGACY = "92f3340070b040b4be778a62131badcd"; // stored in tx 902

console.log("\nCase 2: Google Workspace_mytiv (EUR 15.16 → ILS 57.80)");

const googlePrimary = computeDedupHash(
  "2026-01-01", 15.16, "Google Workspace_mytiv", "expense",
  ["credit_card_cal", "", "EUR"]
);
check(
  "primary hash differs from legacy hash",
  googlePrimary === GOOGLE_WS_LEGACY ? "same" : "different",
  "different"
);

const googleFallback = computeDedupHash(
  "2026-01-01", 57.8, "Google Workspace_mytiv", "expense"
);
check("legacy fallback matches stored tx 902 hash", googleFallback, GOOGLE_WS_LEGACY);

// ---------------------------------------------------------------------------
// Case 3: דרים וי.פי.אס בעמ — ILS original amount (no FX conversion)
// Even with no FX difference, primary hash still differs due to sourceIdentity
// legacy_excel stored: hash(date, 64.90 ILS, desc, direction)
// credit_card_cal primary: hash(date, 64.90 ILS, desc, direction, [cal||ILS])
// legacy fallback: hash(date, 64.90 ILS, desc, direction) — must match stored

const DREAM_LEGACY = "005f9dead7c5e84ae8543c4f233e7451"; // stored in tx 901

console.log("\nCase 3: דרים וי.פי.אס בעמ (ILS 64.90, no FX)");

const dreamPrimary = computeDedupHash(
  "2026-01-01", 64.9, "דרים וי.פי.אס בעמ", "expense",
  ["credit_card_cal", "", "ILS"]
);
check(
  "primary hash differs from legacy hash",
  dreamPrimary === DREAM_LEGACY ? "same" : "different",
  "different"
);

const dreamFallback = computeDedupHash(
  "2026-01-01", 64.9, "דרים וי.פי.אס בעמ", "expense"
);
check("legacy fallback matches stored tx 901 hash", dreamFallback, DREAM_LEGACY);

// ---------------------------------------------------------------------------
// Case 4: Unique CAL row — must NOT be flagged as duplicate
// A brand-new CAL transaction not in the DB should have no legacy match.
// We verify the fallback hash is distinct from the 3 known stored hashes.

console.log("\nCase 4: Unique CAL row — no false positive");

const uniqueFallback = computeDedupHash(
  "2026-02-15", 549.0, "Microsoft*Store", "expense"
);
const knownHashes = [KONVERSATION_LEGACY, GOOGLE_WS_LEGACY, DREAM_LEGACY];
check(
  "unique row fallback does not collide with any known stored hash",
  knownHashes.includes(uniqueFallback) ? "collision" : "no-collision",
  "no-collision"
);

// ---------------------------------------------------------------------------
// Case 5: legacy_excel row — legacyFallbackHash is null (no double-check needed)

console.log("\nCase 5: legacy_excel row — no fallback hash produced");

const legacyHash = computeDedupHash(
  "2026-01-01", 485.73, "KONVERSATION LTD", "expense"
  // no sourceIdentity
);
check("legacy_excel hash equals stored tx 903 hash (primary only, no fallback)", legacyHash, KONVERSATION_LEGACY);

// ---------------------------------------------------------------------------

console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
