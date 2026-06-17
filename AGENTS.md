<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Durable Agent Rules for Spent

## Preflight checklist (run at the top of every session)

1. `pwd` - must be inside the budgetwise repo
2. `git branch --show-current` - must be `feature/legacy-excel-import-phase-1`
3. `git log --oneline -5` - confirm HEAD matches last known pushed commit
4. `git status` - must be clean; if not, stop and report

If any check fails, stop and report. Do not reset, repair, or rebase automatically.

## Hard constraints (all sessions)

- Do NOT push unless explicitly approved by the user
- Do NOT merge any branch
- Do NOT deploy
- Do NOT work on `main`
- Do NOT drop, truncate, or reset the live database
- Do NOT replace the database with a copy
- Do NOT auto-commit unless explicitly approved

## Live database rules

- Live DB is `data/spent.db`
- Always run `PRAGMA integrity_check;` and `PRAGMA foreign_key_check;` before and after any mutation
- For ANY mutation to live data: create a timestamped hot backup first using SQLite `.backup` into `data/backups/`
- Do NOT use `cp` to back up the DB (WAL mode requires `.backup`)
- After mutation: verify all baseline counts remain at expected values before committing
- SQLite BOOLEAN columns return 0/1 integers - always coerce to JS boolean in query results

## Classification and learning constraints

- Do NOT auto-create user-approved classification rules
- Save-as-rule must remain strictly opt-in
- Do NOT classify needs_review rows from page views or background jobs
- Do NOT change classification_status except through the explicit review/approval flow
- Do NOT change financial_nature, cash_flow_type, or pnl_impact on existing transactions unless explicitly approved

## Hardcoding constraints (open-source project)

- Do NOT hardcode workspace-specific business names, merchants, or accounts in source code
- DEFAULT_UNITS contains only generic entries: personal, shared, other, unknown
- Categories, business units, and rules are user-configurable product features
- System must remain workspace-ready for any user who self-hosts

## Accounting separation rules

- Card purchases and bank settlements are separate transaction types
- Do NOT conflate or merge them
- Financial totals (net P&L, operating expenses, operating revenue) must not change from business_unit reassignment
- Only `business_unit` (and `updated_at`) may change during a BU cleanup

## Archived/inactive entities

- Archived categories and inactive business units remain historically resolvable
- Do NOT hard-delete categories or business units that have transaction history
- Reserved BU slugs (unknown, other, personal) cannot be deactivated

## Import rules

- Do NOT import File B (confirmed 100% duplicates)
- Do NOT build the MAX rich adapter (out of scope)
- Do NOT touch batch 7 or transactions 959/960
- Do NOT auto-map legacy_category
- Every import must go through explicit duplicate review before marking imported

## After every work package

1. Update `docs/PROJECT_STATUS.md` with new baseline
2. Update `docs/NEXT_TASK.md` with status of completed package and recommended next
3. Update `docs/DECISIONS.md` if a durable decision was made
4. Stop before push - push requires explicit user approval
