-- Tracks each manual file import through the review/commit pipeline.
-- Kept separate from sync_runs (bank scraper batches) so the two flows
-- never interfere with each other.
CREATE TABLE import_batches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  source_filename TEXT NOT NULL,
  source_type     TEXT NOT NULL DEFAULT 'excel'
    CHECK(source_type IN ('excel', 'csv')),

  -- Column mapping saved after the user confirms the mapping step.
  -- Stored as JSON: {"date":"D","amount":"F","description":"E",...}
  column_mapping TEXT,

  -- Earliest and latest dates found in the file (ISO 8601).
  -- Used to narrow duplicate-detection scans to the relevant window.
  date_range_start TEXT,
  date_range_end   TEXT,

  -- Row counters kept in sync as the batch moves through the pipeline.
  total_rows        INTEGER NOT NULL DEFAULT 0,
  imported_rows     INTEGER NOT NULL DEFAULT 0,
  skipped_rows      INTEGER NOT NULL DEFAULT 0,
  duplicate_rows    INTEGER NOT NULL DEFAULT 0,
  needs_review_rows INTEGER NOT NULL DEFAULT 0,

  -- Pipeline state machine:
  --   pending -> mapped -> classified -> reviewing -> committed | failed
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN (
      'pending',    -- file uploaded, columns not yet mapped
      'mapped',     -- column mapping confirmed, rows normalised
      'classified', -- rules engine and/or AI have run
      'reviewing',  -- user is reviewing flagged rows
      'committed',  -- approved rows written to transactions
      'failed'
    )),

  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  committed_at TEXT
);

CREATE INDEX idx_import_batches_workspace
  ON import_batches(workspace_id, created_at DESC);
