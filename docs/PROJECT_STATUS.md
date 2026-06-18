# Project Status

Last updated: 2026-06-18

## Branch

`feature/legacy-excel-import-phase-1`

## Latest pushed commit

`df85507` - feat: add expected cash movements dashboard (pushed 2026-06-18)

## Verified baseline (as of f9bff71)

| Metric | Count |
|--------|-------|
| transactions | 1095 |
| import_rows | 1924 |
| categories | 55 |
| import_batches | 8 |
| classification_rules (active) | 652 |
| manually_approved | 704 |
| auto_classified | 10 |
| needs_review | 381 |
| business_units | 12 |

## Completed milestones

### Phase 2U - Import pipeline and adapters
- Legacy Excel import adapter (bank checking format)
- Credit card import adapters: Isracard, CAL
- Hebrew bank checking import adapter (Bank Hapoalim)
- Cross-adapter dedup with hash fallback (verify-cross-adapter-dedup.ts 8/8)
- Card settlement guard (batch 7 excluded, tx 959/960 excluded)
- Duplicate review flow for legacy imports

### Phase 2P - Classification and learning policy
- User-approved learning rules
- Migration 029: rule_source, created_from_import_row_id, created_from_transaction_id columns
- Learning-rules service (src/server/classification/learning-rules.ts)
- Transaction learning dialog (UI opt-in)
- qa-learning-policy.sh 36/36 passing

### Phase 2V - Monthly breakdown report
- Monthly P&L breakdown by category and business unit
- /reports/monthly page
- Business unit dashboard (/api/reports/business-units)

### Phase 2W - Category Management (commit 953fc7b)
- Migration 034: is_archived column on categories
- Category rename, archive, restore via /settings/categories
- Usage counts (lifetime tx count, active rule count)
- Category detail sheet

### Phase 2W.1 - Telecom & Internet split (commit fadee06)
- Category 86 "Telecom & Internet" created (parent: Operations/38)
- 32 transactions moved from Utilities & Energy (57) to Telecom & Internet (86)
- Vendors moved: סלקום, HOT, פלאפון, פרטנר, טלזר, בזק standing orders
- Period: 2025-02 through 2026-02
- Total: ILS 2,723.91

### Phase 2Y - Business Unit Management (commit f9bff71)
- Migration 035: description column on business_units
- /settings/business-units page: list, create, rename, description, color, archive/restore
- CRUD API: GET (with includeCounts, includeInactive), POST, PATCH /[id]
- Usage counts per unit
- Inactive unit support
- Reserved-slug guard: unknown, other, personal cannot be deactivated
- DEFAULT_UNITS trimmed to generic only: personal, shared, other, unknown
- Settings sidebar: Business Units under Categories group

### Phase 2Y.1 - Business Unit Inventory and Analysis (docs commit 5dd826e, no data mutation)

Deep inventory of all 12 business units and analysis of `other` and `unknown` pools.

Key finding: ALL 40 `other` transactions and all 18 `unknown` transactions are there due to
explicit user-approved rules (rules 638-654 for `other`, rules 626-627 for `unknown`). The user
deliberately classified each one. Zero deterministic candidates for reassignment were found.
No data was mutated.

5 business units have zero transaction usage: umino, paseo, topsoccer, cctv360, shared.
These exist in the DB registry from prior seeding but have no transactions tagged to them.

QA confirmed clean: dedup 8/8, learning-policy 36/36, tsc pass, build pass.

### Phase 2Z - Dynamic Transaction Management (commit 369b6b2)

- Migration 036: `transaction_audit_log` table + `note TEXT` column on transactions
- Extend `queryTransactions` with businessUnit/classificationStatus/financialNature/cashFlowType/pnlImpact/minAmount/maxAmount filters
- GET /api/transactions/[id] (single transaction fetch)
- POST /api/transactions (manual transaction creation, provider='manual')
- PATCH /api/transactions/[id] with `edit` body (general field editing, audit logged)
- PATCH /api/transactions/bulk (bulk update: category/BU/financialNature/cashFlowType/pnlImpact/status)
- TransactionDetailSheet: right-side sheet for editing any transaction field
- TransactionCreateDialog: dialog for creating manual transactions
- TransactionsTable: row click opens detail sheet, checkbox bulk selection, floating BulkEditBar
- TransactionsPage: BU and status filter dropdowns, "Add" button, select-rows toggle
- All mutations write to transaction_audit_log

### Phase 3A - Transaction Management Polish + Void Support (commit 5d2ac62, pushed)

- Migration 037: `void_reason TEXT` column on transactions
- BU/status/financialNature filters upgraded to multi-select (TransactionMultiFilter components)
- Inactive business units excluded from filter dropdown and detail sheet
- Void/unvoid transactions: sets is_excluded=1 + void_reason, audit logged, reversible
- Amount editing for manual transactions only (imported amounts are read-only)
- Audit log viewer at /settings/data (paginated, shows all field-level changes)
- GET /api/audit-log endpoint
- Empty state on /transactions when no results in current month

QA: dedup 8/8, learning-policy 36/36, tsc PASS, build PASS. Baseline 1095 tx intact.
0 live transactions voided. Financial totals unchanged.

### Package 2+3 - Report Drilldown + Import History (local, not yet committed)

- URL-driven filter hydration on /transactions: `month`, `categoryId`, `businessUnit`,
  `classificationStatus`, `financialNature`, `accountId`, `search`, `kind` all round-trip
  via URL search params. Back/forward and bookmark support via useSearchParams + router.replace.
  Wrapped TransactionsPage in Suspense for Next.js App Router compatibility.
- Classification coverage indicator on /transactions: amber pill showing needs-review count,
  clicking it filters to needs_review status.
- Monthly breakdown drilldown: category rows link to /transactions?month=...&categoryId=...,
  income/non-P&L nature rows link by financialNature, BU rows link by businessUnit,
  needs-review card and coverage warning link to filtered transactions.
- P&L report drilldown: each month row has a view-transactions icon link. New "vs Prior"
  MoM delta column shows absolute delta + percentage vs prior month.
- Business unit dashboard drilldown: "View all transactions" link per unit inside the
  expanded detail panel.
- GET /api/import/history: paginated import batch history endpoint.
- /import/history page: full history table with batch id, adapter, status, date range,
  row counts (total / imported / dupes / needs-review), committed date, "View batch" links.
  Accessible from /import via "Import history" link.
- Extended Integration type with `lastImportAt: string | null` (workspace-level, most
  recent committed import batch).
- Settings > Bank page shows "Last import: [date]" and "View history" link.

QA: tsc PASS, build PASS, learning-policy 36/36. Baseline unchanged.

### Package 4 — Forecast (local, not yet pushed)

Checkpoint 2 (commit 697b790):
- Migration 038: `recurring_patterns` table (direction, amount_min/max, bimonthly frequency)
- Detection service: read-only, groups by (clean_description, direction), bimonthly frequency tier
- Pattern CRUD API + forecast month API (P&L/non-P&L/uncertain/installment advisory)
- 34 detection tests passing

Checkpoint 3 (local):
- `/reports/forecast` page: month nav, summary cards, P&L/non-P&L/uncertain sections,
  installment advisory, detection sheet with confidence bands, confirm/create dialogs
- `/settings/recurring` page: pattern list, filter by confirmed/pending, edit sheet,
  toggle active/confirmed, create new
- App sidebar nav: Forecast entry
- Reports hub: Forecast card
- Settings sidebar: Recurring Patterns entry
- Translations: en.json + he.json

QA: tsc PASS, build PASS. 0 live recurring_patterns. All baselines intact.

## Known pending items

- 381 transactions remain needs_review (business_unit = NULL on all 381)
- 40 transactions tagged `other` via user-approved rules - deliberate, not gaps
- 18 transactions tagged `unknown` via user-approved rules - deliberate, not gaps
- 5 business units with zero usage: umino, paseo, topsoccer, cctv360, shared
- Forecast UI not yet built (Checkpoint 3 pending)
- No MAX credit card rich adapter
- File B must not be imported (confirmed 100% duplicates)
