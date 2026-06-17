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

## Future functionality

### Forecast is required future functionality
A spending forecast / budget pace feature is on the product roadmap but has not been built yet.

### Multi-user / auth is out of scope for Phase 1
The app is single-workspace for Phase 1. Multi-user support is deferred.
