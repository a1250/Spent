# Project Status

Last updated: 2026-06-17

## Branch

`feature/legacy-excel-import-phase-1`

## Latest pushed commit

`f9bff71` - feat: add business unit management (pushed)

## Latest local commit (not pushed)

Phase 2Z - Dynamic Transaction Management (not yet committed)

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

### Phase 2Z - Dynamic Transaction Management (local, not yet committed)

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
- Baseline preserved: 1095 tx / 8/8 dedup / 36/36 learning-policy

## Known pending items

- 381 transactions remain needs_review (business_unit = NULL on all 381)
- 40 transactions tagged `other` via user-approved rules - deliberate, not gaps
- 18 transactions tagged `unknown` via user-approved rules - deliberate, not gaps
- 5 business units with zero usage: umino, paseo, topsoccer, cctv360, shared
- No forecast feature yet
- No MAX credit card rich adapter
- File B must not be imported (confirmed 100% duplicates)
