# Next Task

## Phase 2Y.1 - Business Unit Usage Review and Safe Initial Cleanup

Status: APPROVED FOR EXECUTION

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

### Completion criteria

- Deterministic candidates updated (or zero mutation if none qualify)
- Baseline counts confirmed unchanged (1095/1924/55/8/652/704/10/381/12)
- Financial totals unchanged
- QA all passing
- Docs updated
- Local commit only (no push)

---

## Recommended next package after 2Y.1

**Phase 2Z - Business Unit Needs-Review Triage**

After 2Y.1 completes the deterministic cleanup of `other`/`unknown`, the next natural step is to address the 381 needs_review transactions that currently have NULL business_unit. These need user review through the existing review UI before any business_unit assignment can happen. This is NOT an automatic operation.

Status: AWAITING APPROVAL
