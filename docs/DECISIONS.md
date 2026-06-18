# Durable Decisions

Last updated: 2026-06-17

## Import and data model

### Card purchases vs bank settlements
Card transactions appear twice in Israeli bank data: once as a card purchase (positive debit from card account) and once as a bank settlement (monthly lump-sum debit from checking account). These are NOT the same transaction and must NOT be merged or deduplicated across accounts. The card purchase is the granular record; the bank settlement is a cash-flow event. Both must be preserved.

### File B must not be imported
File B was confirmed 100% duplicate of already-imported data. Do not attempt to re-import it under any circumstances.

### Batch 7 / transactions 959 and 960
These are protected. Do not modify classification, category, business_unit, or any other field on transactions 959 and 960. Do not re-process batch 7.

### Legacy category auto-mapping
`legacy_category` on import_rows must not be auto-mapped to category_id. Mapping requires explicit user review and approval.

## Business units

### Meaning of reserved slugs
- `personal` - personal/household expenses not attributable to any specific business
- `shared` - expenses shared across multiple businesses or contexts
- `other` - known but unclassified; the transaction's owner is uncertain or mixed
- `unknown` - truly unknown origin; typically auto-classified or imported with no context

### Reserved slugs cannot be deactivated
The slugs `unknown`, `other`, and `personal` are protected at the API level. They may not be deactivated via PATCH /api/business-units/[id]. This is enforced server-side, not just in UI.

### Workspace-specific units are user-managed
Business units beyond the four generic defaults (personal, shared, other, unknown) are workspace-specific and must be created and managed by the user through the UI. They must NOT be hardcoded in source code.

### business_unit is a TEXT slug, not a foreign key
`transactions.business_unit` stores the slug string directly. It is not a foreign key to the business_units table. This means inactive or deleted units remain on historical transactions. This is intentional for historical integrity.

## Categories

### Categories are user-configurable
Categories are a product feature, not a hardcoded taxonomy. The seeded set (from migrations) is a default starting point. Users can create, rename, archive, and organize them.

### Two-level hierarchy only
The category tree is strictly two levels: parent groups and leaf children. Parents cannot be children; leaves cannot have children. Enforced at the DB query layer.

### Archived categories remain resolvable
Archiving a category does NOT unassign its transactions. The category remains in the DB and is resolvable by ID. The archive flag hides it from pickers but not from historical data.

### Utilities & Energy vs Telecom & Internet split
- Category 57: Utilities & Energy (parent: Operations/38) - electricity, gas, water
- Category 86: Telecom & Internet (parent: Operations/38) - mobile, internet, landline
- "בזק ENERGY (בזק ג'ן)" is an energy reseller, assigned to Utilities & Energy, NOT Telecom
- Standard "בזק הוראות קבע" is telecom, assigned to Telecom & Internet

## Accounting

### Net P&L is preserved across cleanup operations
Business unit reassignment must not change any financial totals. Only `business_unit` (and `updated_at`) may change during a BU cleanup. Financial nature, cash flow type, P&L impact, and category must not change.

### No dedicated reassignment audit table
There is currently no category-reassignment or business-unit-reassignment audit log table in the schema. Mutations are tracked only through git commit messages and the updated_at timestamp on transactions.

### `other` and `unknown` are deliberate classifications, not gaps
All 40 `other` and 18 `unknown` transactions were assigned via user-approved rules (rules
638-654 for `other`; rules 626-627 for `unknown`) or through the manual review UI. These
pools reflect genuine ambiguity (mixed ownership, unclear business attribution) that the user
intentionally left as-is. Do not treat them as cleanup targets without explicit user direction.

### Business unit assignments from user-approved rules are authoritative
When a user-approved classification rule sets `business_unit`, that assignment is the user's
explicit decision. Do not override it via bulk reassignment even if the merchant name appears
to match another business unit. Rule 641 (GOOGLE*WORKSPACE MYTIV → other) is an example:
despite "MYTIV" appearing in the name, the user explicitly approved `other` as the assignment.

## Transaction management

### Void uses is_excluded + void_reason, not a status value
Voided transactions use `is_excluded=1` (existing column) plus a new `void_reason TEXT` column
(migration 037). The alternative of using `classification_status='voided'` was rejected because
the status CHECK constraint was not designed for this and it conflates classification state with
exclusion intent. Voided transactions remain in the DB and audit log but are excluded from all
financial aggregates and report totals. Unvoid restores them by clearing both fields.

### Amount editing is restricted to manual transactions
The `charged_amount` field is editable only when `provider='manual'`. Imported transaction
amounts are treated as immutable source data. Any edit goes through `updateManualTransactionAmount`
and is audit logged. This preserves the integrity of the import record.

### Filter multi-select uses arrays via repeated query params
BU, classificationStatus, and financialNature filters accept multiple values via repeated
URL params (e.g. `?businessUnit=a&businessUnit=b`). The server uses `IN (...)` SQL with
special handling for the `none` sentinel (maps to `IS NULL`). Single-value usage still works.

## Report drilldown and URL filters

### Filter state round-trips via URL search params
`/transactions` uses `useSearchParams()` (lazy initializer) to hydrate state on mount and
`useEffect + router.replace` to keep the URL in sync. This enables bookmarkable filter
combinations and browser back/forward navigation. The `useSearchParams` hook requires the
component to be wrapped in `<Suspense>` per Next.js App Router requirements.

### lastImportAt is workspace-level, not per-credential
The `Import.lastImportAt` field returned by `GET /api/integrations` is the most recent
`committed_at` from `import_batches` for the workspace. It is the same value for every
credential in the list. Direct batch-to-credential mapping was not implemented because
the `adapter_key` values do not reliably map to provider slugs. This is documented and
acceptable for the current use case.

## Forecast

### Forecast is advisory — never alters actual data
Forecast data lives in `recurring_patterns` and forecast API responses. It never writes to `transactions`, `classification_rules`, or any financial aggregate table. Actual P&L and cash-flow totals are unchanged by any forecast operation.

### Only user-confirmed patterns enter primary forecast totals
`recurring_patterns.is_user_confirmed = 1` is the gate. Auto-detected candidates returned by `POST /api/forecast/detect` are never persisted automatically. They are returned as a response payload for user review. The user must explicitly create a pattern via `POST /api/forecast/patterns` with `isUserConfirmed: true`.

### Income detection is advisory-only
Any recurring income candidate from detection is flagged `isIncomeAdvisoryOnly: true`. Income transfers may represent salary, owner deposit, reimbursement, or operating income — the system cannot infer which. The user must explicitly set `financialNature` and `pnlImpact` when confirming an income pattern.

### Grouping key: clean_description + direction
Recurring detection groups by `(clean_description, direction)` where direction = income|expense. This prevents an expense and income with the same description from merging into one candidate.

### Frequency model includes bimonthly
Frequency is inferred from median gap between occurrences: monthly (20-50 days), bimonthly (50-75 days), quarterly (75-110 days), annual (330-400 days), irregular (otherwise). Municipal taxes (arnona) in Israel often recur every two months; `bimonthly` ensures these are not silently classified as `irregular`.

### Installment projection requires populated sequence fields
The live DB has 2 installment transactions with NULL `installment_number` and `installment_total`. Until import adapters populate these fields, installment projection returns `dataQualitySufficient: false` and no projections are generated. The API shape is ready for when data quality improves.

### Detection exclusions
The following financial_nature values are excluded from recurring-expense P&L detection: `credit_card_payment`, `internal_transfer`, `owner_deposit`, `owner_draw`, `loan_received`, `loan_repayment`, `refund`. Additionally: `needs_review`, voided (`is_excluded=1`), and `kind=transfer` rows are excluded.

## Future functionality

### Forecast UI is pending Checkpoint 3 approval
The forecast backend (migration 038, detection service, API) is complete. The forecast dashboard (/reports/forecast), pattern management (/settings/recurring), and forecast-vs-actual overlay are pending explicit approval to build.

### Multi-user / auth is out of scope for Phase 1
The app is single-workspace for Phase 1. Multi-user support is deferred.
