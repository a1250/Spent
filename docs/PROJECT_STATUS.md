# Project Status

Last updated: 2026-06-17

## Branch

`feature/legacy-excel-import-phase-1`

## Latest pushed commit

`f9bff71` - feat: add business unit management

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

## Known pending items

- 381 transactions remain needs_review
- business_unit = NULL on all 381 needs_review transactions
- ~40 transactions tagged `other`, ~18 tagged `unknown` (candidates for Phase 2Y.1 cleanup)
- No forecast feature yet
- No MAX credit card rich adapter
- File B must not be imported (confirmed 100% duplicates)
