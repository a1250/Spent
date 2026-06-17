# Next Task

## Phase 2Y.1 - Business Unit Usage Review and Safe Initial Cleanup

Status: COMPLETE (no data mutation warranted)

### Outcome

Zero deterministic candidates were found. All other/unknown assignments were via user-approved
rules or manual review. No data mutated.

---

## Phase 2Z - Dynamic Transaction Management

Status: APPROVED FOR EXECUTION

### Objective

Make BudgetWise a dynamic working system where users can add, edit, move, and manage
transactions as new data arrives. The 381 historical needs_review transactions are a backlog,
not a blocker. This phase does not address that backlog.

### Scope

1. Transaction list / management page at /transactions
   - Month/date, category, business unit, classification status, financial nature,
     cash-flow type, P&L impact, source/account filters
   - Merchant/description search
   - Min/max amount
   - Pagination
   - Sort by date and amount

2. Single transaction editing (sheet or edit page)
   - Editable: date, description, counterparty, category, business unit,
     financial_nature, cash_flow_type, pnl_impact, classification_status, note
   - Amount edit only if safe and intentional
   - Preserve: import batch linkage, import row linkage, source metadata,
     original imported values

3. Bulk editing
   - Select multiple transactions
   - Change: category, business unit, financial_nature, cash_flow_type,
     pnl_impact, classification status
   - Show selected count and confirmation
   - Update only explicitly selected fields
   - Do NOT create rules automatically
   - Do NOT change imported source metadata

4. Manual transaction creation
   - Fields: date, description, amount, direction, category, business unit,
     financial_nature, cash_flow_type, pnl_impact, optional note
   - Clearly marked as manual (not imported)
   - Use schema-consistent source marker

5. Audit history
   - Check whether audit/log table already exists
   - If missing, add migration: id, workspace_id, transaction_id, action,
     field_name/payload, old_value, new_value, changed_at, changed_by (nullable),
     source/context
   - Cover: single edit, bulk edit, creation, status change, category/BU/accounting changes

6. Report refresh compatibility
   - /reports/monthly, P&L previews, cash-flow previews, BU usage counts must
     reflect transaction changes

### Prohibited

- Hardcode merchants, businesses, or account names
- Auto-create rules from edits
- Silently overwrite import source audit fields
- Touch batch 7 or transactions 959/960
- Push without explicit approval

### Completion criteria

- All 6 features implemented and tested in browser
- QA: dedup 8/8, learning-policy 36/36, tsc PASS, build PASS
- Docs updated
- Local commit(s) only; push requires explicit approval

---

## Status: COMPLETE (local, awaiting explicit push approval)

All 6 Phase 2Z deliverables implemented:
1. Extended transaction list filters (BU, classification status, financial nature, cash flow, P&L, amount)
2. Single transaction editing via TransactionDetailSheet
3. Bulk editing via TransactionsTable checkbox selection + BulkEditBar
4. Manual transaction creation via TransactionCreateDialog (provider='manual')
5. Audit history via transaction_audit_log (migration 036)
6. All report query keys invalidated on mutation

QA: tsc PASS, build PASS, dedup 8/8, learning-policy 36/36. Baseline 1095 tx intact.
