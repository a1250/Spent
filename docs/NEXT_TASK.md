# Next Task

## P1 V1 Acceptance Fix - Optional integration onboarding

Status: COMPLETE (local, pending commit/push approval)

Delivered:
- Removed forced setup redirects from primary app routes so fresh and existing workspaces can
  open the dashboard without connecting a bank or service.
- Added equal entry paths for Continue to Dashboard, Connect Bank or Service, Upload and Import
  Files, and manual transaction management.
- Added import access from the dashboard, empty transactions state, Settings > Bank, and main
  navigation.
- Added Import History and Bank / Services to the main nav.
- Made Settings > Bank an optional connection center with provider availability/status messaging,
  dashboard continuation, and file-import fallback.
- Made setup bank selection explicitly skippable.
- Added `scripts/test-v1-entry-navigation.sh` for fresh-workspace, redirect, import, optional
  connection, and connected/no-transaction navigation coverage.

QA:
- `scripts/test-v1-entry-navigation.sh "$(./scripts/qa-sandbox.sh)"` PASS.
- `npx tsc --noEmit` PASS.
- focused eslint on touched source files PASS, with only existing sidebar `<img>` warnings.
- `npm run build` PASS.
- Live DB baseline unchanged.

Recommended next:
- Commit the optional-onboarding fix, acceptance script, and documentation locally.
- Push only after explicit user approval.
- No Phase 2 package is approved automatically.

---

## Final V1 Closure Sprint

Status: COMPLETE (local, pending commit/push approval)

Delivered:
- CSV exports with UTF-8 BOM for filtered transactions, Monthly Breakdown, P&L Preview,
  and Cash Flow Preview.
- Export buttons added to the corresponding product pages.
- Verified local backup download from Settings > Data with known-file validation,
  traversal rejection, safe filename, and integrity/FK verification before streaming.
- Acceptance probes completed across transactions, imports, reports, forecast, and backups.

QA:
- `npx tsc --noEmit` PASS
- focused eslint on touched files PASS
- `npm run build` PASS
- `scripts/test-backup-restore.sh "$(./scripts/qa-sandbox.sh)"` PASS 8/8
- `npx tsx scripts/test-forecast-detection.ts` PASS 34/34
- `npx tsx scripts/verify-cross-adapter-dedup.ts` PASS 8/8
- Live DB baseline unchanged: 1095 transactions, 1924 import_rows, 8 import_batches,
  55 categories, 652 active rules, 704 manually_approved, 10 auto_classified,
  381 needs_review, 12 business_units, 0 recurring_patterns, 0 voided.

Recommended next:
- Review the closure sprint diff, then commit locally if approved.
- Push only after explicit user approval.

---

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

Status: COMPLETE (local, not yet pushed)

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

### Deliverables

1. URL filter hydration on /transactions (month, categoryId, businessUnit, classificationStatus,
   financialNature, accountId, search, kind) via useSearchParams + router.replace.
   Suspense wrapper on TransactionsPage.

2. Coverage indicator: needs-review count pill on /transactions, clicking filters to that status.

3. Monthly breakdown drilldown: category rows, nature rows, BU rows, needs-review links.

4. P&L report MoM delta column + drilldown link per month row.

5. Business unit dashboard: "View all transactions" per unit.

6. GET /api/import/history + /import/history page + "Import history" link from /import.

7. Integration type extended with lastImportAt. Settings > Bank shows last import date + history link.

### QA

- tsc PASS, build PASS, learning-policy 36/36
- Baseline 1095 / 1924 / 8 / 652 unchanged
- 0 transactions mutated

### Prohibited

- Do not auto-classify any needs_review transactions
- Do not push without explicit approval

---

## Package 4 - Forecast / Expected Cash Movements

Status: COMPLETE (local, not yet pushed) — awaiting push approval

### Checkpoint 2 (complete, commit 697b790)

- Migration 038: `recurring_patterns` table
- Detection service: read-only, returns suggestions, never persists
- Pattern CRUD: GET/POST /api/forecast/patterns, PATCH /api/forecast/patterns/[id]
- Forecast month: GET /api/forecast?month=YYYY-MM (separated P&L/non-P&L/uncertain/installment)
- Detection endpoint: POST /api/forecast/detect (returns high/medium/low/rejected bands)
- 34 detection tests passing
- Backup: data/backups/pre-038-20260618-102456.db

### Checkpoint 3 (complete, local)

- `/reports/forecast` page: month navigation, forecast vs actual summary cards, items
  grouped by P&L income/expense, non-P&L cash in/out, uncertain, installment advisory
- Run Detection sheet: scans history, shows candidates by confidence band (high/medium/low),
  income advisory warning, confirm candidate dialog, rejected candidates collapsible
- Confirm candidate dialog: pre-fills from candidate, income advisory, all accounting fields
- Add pattern manually: create dialog with all fields and optional immediate confirmation
- `/settings/recurring` page: list patterns (confirmed/pending/all filter), edit sheet,
  toggle active/confirmed, deactivate, create new
- App sidebar nav: Forecast added under reports section
- Reports hub: Forecast card with confirmed pattern count
- Settings sidebar: Recurring Patterns added under Categories group
- Translations: forecast + recurringPatterns keys in en.json and he.json

### QA

- tsc PASS, build PASS
- /reports/forecast and /settings/recurring visible in build output
- 0 live recurring_patterns rows (no patterns created during testing)
- All 10 DB baselines intact

---

## Package 5 - Product Readiness

Status: COMPLETE (local, pending push approval)

---

## Local-first product milestone: COMPLETE

All planned packages are complete. The workspace supports continuous import, classification,
reporting, forecast, and data management without manual DB access.

Completed packages:
- Package 1 (Phase 2Z polish + void): commit 5d2ac62
- Package 2+3 (report drilldown + import history): commit 25bbea4
- Package 4 (forecast / recurring patterns): commits 697b790 + df85507
- Package 5 (backup management + product readiness): commit fd8df04

Branch: feature/legacy-excel-import-phase-1
Ahead of remote by 4 commits (fd8df04, 5ab4df6 is the remote HEAD).
Push requires explicit user approval.

---

### Deliverables

1. Backup/restore infrastructure
   - `src/server/db/backup.ts`: WAL-safe backup module, `createUserBackup()`, `listBackups()`,
     `restoreFromBackup()` with integrity check, FK check, path-traversal guard, auto pre-restore
   - `GET /api/data/backups` (list) + `POST /api/data/backups` (create)
   - `POST /api/data/restore` with confirmation payload ("restore database"), returns
     requiresRestart: true
   - BackupRecord type + API client functions in `src/lib/api.ts`

2. Backup management UI at /settings/data
   - New BackupCard above DangerZone: lists manual and system backups, Create backup button,
     restore confirmation dialog with typed confirmation, post-restore restart warning

3. Error framework pages
   - `src/app/error.tsx`: global error boundary
   - `src/app/not-found.tsx`: 404 page (uses render prop for Link — no asChild)

4. Empty state audit
   - Transactions, reports, dashboard, settings: all have existing empty states
   - Import page: has clear upload CTA as primary state
   - Fresh workspace: seeded categories load, APIs 200, 0 transactions correct

5. Backup/restore test script
   - `scripts/test-backup-restore.sh`: 8 checks (create, list, bad confirmation, path
     traversal, actual restore, pre-restore backup creation)

### QA

- tsc PASS, build PASS
- dedup 8/8, learning-policy 36/36, forecast detection 34/34
- Baselines intact: 1095 tx, 704 manually_approved, 381 needs_review, 10 auto_classified
- 0 live transactions mutated, 0 classification rules created
- Fresh workspace: all APIs return correct responses, no hardcoded IDs

### Prohibited

- Do not auto-classify any needs_review transactions
- Do not push without explicit approval
- Do not invoke live restore during automated execution

---

## Future optional work — AWAITING PRIORITIZATION

No future package is automatically approved. Each item below requires explicit user approval
before any implementation begins.

- **BU seed cleanup**: Remove workspace-specific slugs (umino, paseo, topsoccer, cctv360,
  gazebo, mytiv, advance, playground) from migration 030. Fresh workspaces should start
  with only the 4 generic defaults (personal, shared, other, unknown). Requires data migration
  to handle existing workspaces that have transactions tagged to these slugs.

- **Category 86 extraction**: Telecom & Internet (cat 86) was created via a data mutation,
  not a seed migration. Move it into the seed if it should be available to all workspaces.

- **Multi-user / auth**: Out of scope for Phase 1. Deferred indefinitely.

- **Hebrew UI**: English only for Phase 1. Deferred.

- **Repo-wide lint cleanup**: `npm run lint` still fails on pre-existing issues outside the
  touched closure-sprint files, including React compiler `set-state-in-effect` findings,
  forecast test `any` types, unused imports, and existing `<img>` warnings. Focused lint on
  closure-sprint files passes.

- **OFX export**: CSV exports are complete for V1. OFX remains optional future work.

- **Mobile app**: Phase 2. Not planned.

- **Budgets and alerts**: Out of scope for Phase 1.

- **MAX credit card rich adapter**: Out of scope. File B must not be imported (100% dupes).
