-- Taxonomy small fixes discovered during Phase 1.9 manual classification pilot.
-- Adds two new Personal leaf categories and the playground business unit.
-- Safe to re-run: all inserts use INSERT OR IGNORE.
-- Does NOT touch transactions, import_rows, or classification_rules.

-- ── Personal → Donations & Charity ───────────────────────────────────────────

INSERT OR IGNORE INTO categories
  (workspace_id, parent_id, name, kind, color, icon, budget_mode, description)
SELECT w.id,
       (SELECT c.id FROM categories c
        WHERE c.workspace_id = w.id AND c.parent_id IS NULL AND c.name = 'Personal'
        LIMIT 1),
       'Donations & Charity', 'expense', '#C87EB8', 'heart-handshake', 'budgeted',
       'Charitable donations, nonprofit support, and giving.'
FROM workspaces w
WHERE EXISTS (
  SELECT 1 FROM categories
  WHERE workspace_id = w.id AND parent_id IS NULL AND name = 'Personal'
);

-- ── Personal → Personal Insurance ────────────────────────────────────────────
-- Named "Personal Insurance" (not "Insurance") to avoid collision with the
-- existing Operations → Insurance category (UNIQUE(workspace_id, name)).

INSERT OR IGNORE INTO categories
  (workspace_id, parent_id, name, kind, color, icon, budget_mode, description)
SELECT w.id,
       (SELECT c.id FROM categories c
        WHERE c.workspace_id = w.id AND c.parent_id IS NULL AND c.name = 'Personal'
        LIMIT 1),
       'Personal Insurance', 'expense', '#D9A3C7', 'shield', 'budgeted',
       'Personal insurance payments such as car, health, or other private coverage.'
FROM workspaces w
WHERE EXISTS (
  SELECT 1 FROM categories
  WHERE workspace_id = w.id AND parent_id IS NULL AND name = 'Personal'
);

-- ── playground business unit ──────────────────────────────────────────────────

INSERT OR IGNORE INTO business_units (workspace_id, slug, label, color, sort_order)
SELECT w.id, 'playground', 'Playground', '#8BBBB8', 45
FROM workspaces w;
