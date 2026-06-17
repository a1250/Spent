# Next Task

## Phase 2Z - Dynamic Transaction Management

Status: COMPLETE (commit 369b6b2, not pushed)

All 6 deliverables implemented and QA verified (tsc PASS, build PASS, dedup 8/8,
learning-policy 36/36). Baseline 1095 transactions intact.

---

## Phase 3A - Transaction Management Polish + Void Support

Status: COMPLETE (local, not pushed)

### Deliverables

1. Filter UX: BU, status, and financialNature filters now use TransactionMultiFilter
   (multi-select popover). Inactive business units excluded from filters and detail sheet.

2. Void/unvoid: migration 037 adds void_reason TEXT. PATCH /api/transactions/[id] with
   body `{void: {reason}}` or `{unvoid: true}`. TransactionDetailSheet shows "Void
   transaction" button with confirmation UI and reason input. Voided transactions show
   "Voided" badge and are excluded from all financial totals via is_excluded=1.

3. Amount editing: TransactionDetailSheet shows editable amount field only when
   provider='manual'. Imported transaction amounts are read-only (with explanation).
   Amount edits are audit logged via updateManualTransactionAmount.

4. Audit log viewer: GET /api/audit-log?limit=N&offset=N. /settings/data page shows
   a "Transaction History" section with paginated table (action, field, old, new, when).

5. Empty states: /transactions shows an empty-state card with "Add transaction" CTA
   when no transactions exist in the current month.

### QA results

- tsc PASS, build PASS
- dedup 8/8, learning-policy 36/36
- 0 live transactions voided
- DB baseline: 1095 transactions, 1924 import_rows, 652 rules, 704 manually_approved,
  381 needs_review, 12 business_units
- Backup: data/backups/pre-037-20260617-111603.db (3.5MB, verified)
- Void/unvoid tested on sandbox - correct DB state and audit log
- Multi-filter tested: financialNature, classificationStatus, businessUnit arrays all work
- Financial totals confirmed excluded voided transactions
- No rules created, no learning triggered, no existing transactions mutated

---

## Package 2 + 3 - Report Drilldown and Import History

Status: AWAITING APPROVAL

### Objective

Make reports interactive (click category/BU/month -> see filtered transactions) and add
import history page with per-credential "last imported" dates.

### Package 2: Report Drilldown

1. URL-based filter hydration
   - TransactionsPage reads `month`, `categoryId`, `businessUnit` from URL search params
   - Next.js `useSearchParams()` hydrates initial filter state

2. Monthly report drilldown
   - Category rows in `/reports/monthly` navigate to `/transactions?month=...&categoryId=...`

3. P&L report drilldown
   - BU column rows navigate to `/transactions?month=...&businessUnit=...`
   - Add month-over-month delta column (client-side, from existing data)

4. Business unit dashboard drilldown
   - "View all" link to `/transactions?businessUnit=slug`

5. Coverage gauge
   - Inline indicator on TransactionsPage: X% classified, Y needs review

### Package 3: Import History

1. GET /api/import/history — import batches with row counts
2. Import history page at /import/history (or tab)
3. Settings > Bank: show "Last import: date" per credential
4. GET /api/integrations extended with lastImportAt

### Prohibited

- Do not auto-classify any needs_review transactions
- Do not push without explicit approval

### Dependencies

Phase 3A commit required before starting.
