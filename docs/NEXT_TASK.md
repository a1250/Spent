# Next Task

## Phase 2Y.1 - Business Unit Usage Review and Safe Initial Cleanup

Status: COMPLETE (no data mutation warranted)

### Objective

Inventory the 12 existing business units, analyze `other` and `unknown` pools, and safely reassign only transactions whose correct unit is deterministic from repository/database evidence.

Do not try to eliminate every `other` or `unknown`. Ambiguous assignments must remain untouched.

### Scope

- Read-only inventory and analysis of all 12 business units
- Dry-run with candidate list before any mutation
- Apply ONLY deterministic reassignments (direct internal evidence required)
- Backup required before any mutation
- Verify baseline counts before and after
- QA: dedup 8/8, learning-policy 36/36, tsc, build

### Prohibited

- Import files / batches / rows / transactions
- Change categories, financial_nature, cash_flow_type, pnl_impact, classification_status
- Create classification rules
- Delete or archive business units
- Rename reserved units
- Infer ownership from personal knowledge not in DB/repository
- Push

### Evidence standard for reassignment

Must be ONE of:
- Identical recurring merchant/description consistently assigned to one unit
- Explicit account/card ownership metadata
- An existing approved rule with a specific unit assignment
- Matching historical sibling transactions consistently assigned to one unit

### Outcome

Zero deterministic candidates were found.

All 40 `other` and 18 `unknown` transactions were assigned via explicit user-approved rules
(rules 638-654 for `other`; rules 626-627 for `unknown`) or through the manual review UI.
No data was mutated.

5 business units with zero usage: umino, paseo, topsoccer, cctv360, shared. These exist
in the DB but have no transactions. No action taken (out of scope for this package).

QA: dedup 8/8, learning-policy 36/36, tsc PASS, build PASS.

---

## Recommended next package

**Phase 2Z - Business Unit Needs-Review Triage**

The 381 needs_review transactions (business_unit = NULL) are the only remaining business_unit
gaps. These require user review through the existing review UI. This is NOT an automatic
operation and should proceed one batch at a time through the review flow.

Separately, the 5 zero-usage business units (umino, paseo, topsoccer, cctv360, shared) could
be archived via the new /settings/business-units page if the user confirms they are no longer
active. This requires explicit user confirmation per unit.

Status: AWAITING APPROVAL
