# Project Status

Last updated: 2026-07-19

## Branch

`feature/legacy-excel-import-phase-1`

## Latest pushed commit

`b61e92f` - docs: record optional integration onboarding rule

## Verified baseline (as of this session, live DB untouched)

| Metric | Count |
|--------|-------|
| transactions | 1188 |
| import_rows | 2018 |
| categories | 55 |
| import_batches | 9 |
| classification_rules (active) | 652 |
| manually_approved | 704 |
| auto_classified | 51 |
| needs_review | 433 |
| business_units | 12 |
| recurring_patterns | 0 |
| voided transactions | 0 |

Note: this baseline grows over time from real bank syncs. Don't hardcode it into
QA script assertions as a fixed constant (`qa-learning-policy.sh` did this and
had to be fixed to derive its baseline dynamically) — see the V1 Self-Test
milestone below.

## Completed milestones

### V1 Self-Test and Acceptance Audit (local, pending commit/push approval)

Full "act like a real user" walkthrough of entry/navigation, import, import
review, transactions, reports/drilldowns, forecast, exports, backups, and a
genuinely fresh (non-copied) workspace DB, plus the full automated QA suite
run sequentially. Live DB was never mutated; all mutation tests ran against
sandbox copies.

Found and fixed:
- **P0**: `is_excluded` (void) was not filtered in 6 report/dashboard query
  modules (`pnl-preview.ts`, `monthly-breakdown.ts`, `cash-flow-preview.ts`,
  `business-unit-dashboard.ts`, `data-quality-dashboard.ts`, `data-quality.ts`),
  even though the transactions list/export already filtered it correctly.
  Voided transactions kept counting in P&L, Cash Flow, Monthly Breakdown,
  Business Unit, and Data Quality totals. Fixed by adding `is_excluded = 0`
  to every relevant WHERE clause; verified the fix shifts totals by exactly
  the voided transaction's amount and unvoid restores them. Live voided count
  was 0 throughout, so this never corrupted a real report — it was latent.
- **P2**: CSV export formula injection guard added to `csvEscape` (string
  values starting with `=+-@`/tab/CR get a leading-apostrophe guard; numeric
  amounts are untouched).
- **QA script fix**: `qa-learning-policy.sh` asserted against a stale
  hardcoded 1095-tx baseline; rewrote it to assert only "unchanged
  before/after the sandbox run" against a freshly-read live baseline.

Deferred (already tracked, unchanged by this session, needs explicit approval):
- BU seed cleanup (workspace-specific slugs on fresh DBs) — requires a live
  data migration, out of scope for a "low-risk and localized" fix.
- `ENVIRONMENT_FALLBACK` stderr noise on cold `next start` — internal Next.js
  16 SSR chunk, not reproducible from app source, requests still return 200.

QA: tsc PASS, focused eslint PASS, build PASS, v1-entry-navigation PASS,
import-review-classification 7/7 PASS, backup-restore 8/8 PASS, forecast
detection 34/34 PASS, cross-adapter dedup 8/8 PASS, learning-policy 36/36 PASS
(post-fix). Live DB integrity/FK/hash unchanged throughout.

### P1 V1 Import Review Classification Fix (local, pending commit)

- Import Review rows now expose a visible, touch-accessible `Edit / Classify`
  action. Category editing no longer depends on hidden row-click behavior.
- Each pending import row shows the current category, or `No category / ללא קטגוריה`
  when unset. The category pill is also clickable and opens the same editor.
- Added a searchable active-category picker. Archived categories are excluded by default.
- Added explicit Save / Apply and Cancel actions. Cancel closes the editor without mutation.
- Added row checkboxes, select-all-visible, and bulk Edit / Classify. Bulk classification
  applies only to selected rows and uses row-only patches; it does not create learning rules.
- The action and checkbox columns are sticky in the RTL import table so tablet-width users
  keep the primary action visible while horizontally scrolling.

Durable rule:
- Import Review must always expose an explicit, touch-accessible Edit/Classify action for
  every pending row. Category selection may not depend on hidden row-click behavior.

Acceptance/QA:
- `scripts/test-import-review-classification.sh "$(./scripts/qa-sandbox.sh)"` PASS.
- Sandbox verified: no-category row can be classified, selected category is visible after
  save, Cancel is a no-op, archived categories are excluded, source linkage is preserved,
  no learning rule is created automatically, and bulk edit affects selected rows only.
- No live DB mutation was performed.

### P1 V1 Acceptance Fix - Optional integration onboarding (local, pending commit)

- Removed forced `/setup` redirects from the dashboard, transactions, budget, and settings
  entry points. Existing and fresh workspaces can open the product without connecting a bank
  or external data service.
- Added equal first-screen entry paths on the dashboard: Continue to Dashboard, Connect Bank
  or Service, Upload and Import Files, and Add Manual Transaction.
- Added direct import access from the empty transactions state and main navigation.
- Added main navigation entries for Import History and Bank / Services.
- Reworked Settings > Bank as an optional data-source page with connected / available /
  manual / coming-later status, plus Continue to Dashboard and Import a file instead actions.
- Made setup bank selection explicitly skippable and linked to dashboard/import paths.
- Added a fresh-workspace navigation smoke script that verifies no setup redirect loop,
  dashboard/import/transactions/settings access, optional integration failure behavior, and
  connected-integration/no-transaction behavior.

Acceptance/QA:
- `scripts/test-v1-entry-navigation.sh "$(./scripts/qa-sandbox.sh)"` PASS.
- Fresh sandbox with no transactions and no integrations reached dashboard, import,
  transactions, and optional bank/service setup without being forced through an integration.
- Unsupported provider test failure did not block dashboard or file import access.
- Existing-workspace regression with a sandbox credential and no transactions remained
  navigable.
- No live DB mutation was performed; live baseline remained unchanged.

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

### Package 4 — Forecast (pushed as df85507)

Checkpoint 2 (commit 697b790):
- Migration 038: `recurring_patterns` table (direction, amount_min/max, bimonthly frequency)
- Detection service: read-only, groups by (clean_description, direction), bimonthly frequency tier
- Pattern CRUD API + forecast month API (P&L/non-P&L/uncertain/installment advisory)
- 34 detection tests passing

Checkpoint 3 (commit df85507):
- `/reports/forecast` page: month nav, summary cards, P&L/non-P&L/uncertain sections,
  installment advisory, detection sheet with confidence bands, confirm/create dialogs
- `/settings/recurring` page: pattern list, filter by confirmed/pending, edit sheet,
  toggle active/confirmed, create new
- App sidebar nav: Forecast entry
- Reports hub: Forecast card
- Settings sidebar: Recurring Patterns entry
- Translations: en.json + he.json

QA: tsc PASS, build PASS. 0 live recurring_patterns. All baselines intact.

### Package 5 — Product Readiness (local, pending commit)

- `src/server/db/backup.ts`: WAL-safe backup/restore module using better-sqlite3 `.backup()`
  API. `createUserBackup()` writes `backup-YYYY-MM-DD-HHmmss.db`, runs integrity_check
  and foreign_key_check, returns metadata. `restoreFromBackup()` verifies source, creates
  automatic pre-restore backup, then restores.
- `GET/POST /api/data/backups`: list all backups, create a new user backup
- `POST /api/data/restore`: restore with typed confirmation ("restore database"),
  path-traversal guard, auto pre-restore backup, returns requiresRestart: true
- `BackupRecord` and `listBackupsApi/createBackup/restoreFromBackup` added to `src/lib/api.ts`
- `/settings/data` page: new `BackupCard` component above DangerZone — lists manual and
  system backups, create button, restore confirmation dialog with typed confirmation
- `src/app/error.tsx`: global error boundary with AlertTriangle icon and "Try again"
- `src/app/not-found.tsx`: 404 page with "Go to dashboard" link
- `scripts/test-backup-restore.sh`: sandbox-only backup/restore integration test (8 checks)
- Fresh workspace: categories seeded, APIs return 200, 0 transactions correct, no hardcoded IDs

QA: tsc PASS, build PASS, dedup 8/8, learning-policy 36/36, forecast 34/34.
All baselines intact (1095 tx, 704 manually_approved, 381 needs_review, 10 auto_classified).
0 live transactions mutated. No classification rules created.

### Final V1 Closure Sprint (local, pending commit)

- Added user-facing CSV exports with UTF-8 BOM:
  - `GET /api/export/transactions` for filtered transaction lists
  - `GET /api/export/monthly` for Monthly Breakdown
  - `GET /api/export/pl` for P&L Preview
  - `GET /api/export/cashflow` for Cash Flow Preview
- Added Export CSV buttons to `/transactions`, `/reports/monthly`, `/reports/pl`,
  and `/reports/cashflow`. Exports respect current date/filter state and use safe filenames.
- Added verified backup download:
  - `GET /api/data/backups/[filename]/download`
  - only known backup filenames are accepted
  - path traversal is rejected
  - integrity and foreign-key checks must pass before download
  - no raw server path is exposed
- Backup list metadata now includes verified integrity, foreign-key status, and transaction count.
- Monthly Breakdown removed a state-copy effect by deriving the displayed month from the report
  response, satisfying focused lint on touched files.

Acceptance/QA:
- Preflight passed on branch `feature/legacy-excel-import-phase-1`, clean start state,
  HEAD `27331d5`.
- Live DB `PRAGMA integrity_check` passed and `PRAGMA foreign_key_check` returned no rows
  before and after work.
- Baseline unchanged: 1095 transactions, 1924 import_rows, 8 import_batches, 55 categories,
  652 active rules, 704 manually_approved, 10 auto_classified, 381 needs_review,
  12 business_units, 0 recurring_patterns, 0 voided.
- Export endpoint probes passed: all four CSVs returned 200, safe `Content-Disposition`,
  `text/csv; charset=utf-8`, and UTF-8 BOM bytes.
- Backup download probe passed: downloaded backup opened with SQLite, integrity `ok`,
  FK check clean, 1095 transactions; traversal attempt rejected.
- Sandbox transaction workflow passed: search/filter/sort, manual create, single edit,
  bulk edit, void/unvoid, and audit history; disposable records cleaned up from sandbox.
- Import malformed-file probe returned clear 400 message.
- Report/import/forecast API probes returned 200 valid JSON.
- `scripts/test-backup-restore.sh "$(./scripts/qa-sandbox.sh)"` PASS 8/8.
- `npx tsx scripts/test-forecast-detection.ts` PASS 34/34.
- `npx tsx scripts/verify-cross-adapter-dedup.ts` PASS 8/8.
- `npx tsc --noEmit` PASS.
- `npm run build` PASS. Existing Next warning: `middleware` convention is deprecated in favor
  of `proxy`.
- Focused eslint on touched files PASS. Repo-wide `npm run lint` still fails on pre-existing
  lint debt in unrelated files/scripts.

## Known pending items

- 381 transactions remain needs_review (business_unit = NULL on all 381)
- 40 transactions tagged `other` via user-approved rules - deliberate, not gaps
- 18 transactions tagged `unknown` via user-approved rules - deliberate, not gaps
- 5 business units with zero usage: umino, paseo, topsoccer, cctv360, shared
- No MAX credit card rich adapter
- File B must not be imported (confirmed 100% duplicates)
- Repo-wide lint backlog remains outside this sprint; touched files pass focused eslint.
