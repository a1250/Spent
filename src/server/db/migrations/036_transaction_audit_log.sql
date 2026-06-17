-- Add user-facing note field to transactions
ALTER TABLE transactions ADD COLUMN note TEXT;

-- Audit log for all transaction mutations
CREATE TABLE IF NOT EXISTS transaction_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  changed_by TEXT,
  context TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_log_workspace
  ON transaction_audit_log(workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_transaction
  ON transaction_audit_log(transaction_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at
  ON transaction_audit_log(changed_at);
