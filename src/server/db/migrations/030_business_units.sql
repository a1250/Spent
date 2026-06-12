-- Business units configuration table.
-- Stores the slug (written to transactions/import_rows) and display label separately
-- so the list is editable via UI without code changes.
-- No FK from transactions.business_unit to this table intentionally: keeping
-- business_unit as a free TEXT avoids rebuilding the large transaction table and
-- preserves backward compat with any existing string values.

CREATE TABLE IF NOT EXISTS business_units (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  slug         TEXT NOT NULL,
  label        TEXT NOT NULL,
  color        TEXT,
  is_active    INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 100,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_business_units_workspace
  ON business_units(workspace_id, is_active, sort_order);

-- Seed default units for every existing workspace.
INSERT OR IGNORE INTO business_units (workspace_id, slug, label, color, sort_order)
SELECT w.id, bu.slug, bu.label, bu.color, bu.sort_order
FROM workspaces w
CROSS JOIN (
  SELECT 'personal'   AS slug, 'Personal'    AS label, '#A2ABBB' AS color, 10  AS sort_order UNION ALL
  SELECT 'umino',              'Umino',                '#7D90CA',           20               UNION ALL
  SELECT 'paseo',              'Paseo',                '#E7A875',           30               UNION ALL
  SELECT 'topsoccer',          'Top Soccer',           '#7BB36B',           40               UNION ALL
  SELECT 'mytiv',              'Mytiv',                '#E499A4',           50               UNION ALL
  SELECT 'cctv360',            'CCTV 360',             '#65C1D1',           60               UNION ALL
  SELECT 'gazebo',             'Gazebo',               '#D692BF',           70               UNION ALL
  SELECT 'advance',            'Advance',              '#C0D582',           80               UNION ALL
  SELECT 'shared',             'Shared',               '#A4C386',           90               UNION ALL
  SELECT 'other',              'Other',                '#DBC27F',           95               UNION ALL
  SELECT 'unknown',            'Unknown',              '#C9C9C9',           100
) AS bu;
