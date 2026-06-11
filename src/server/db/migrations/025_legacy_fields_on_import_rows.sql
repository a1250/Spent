-- Adds explicit legacy-tracking columns to import_rows so the UI can display
-- and query them without parsing rawMetadata JSON.
--
-- These columns are populated ONLY by the legacy-excel adapter; rows coming
-- from future adapters (bank scraper, CSV) will leave them NULL.
--
-- legacy_category      : Hebrew category string from the source Excel file
--                        (e.g. "מכבסה", "השקעות").  Displayed in the UI as
--                        "קטגוריה מקורית מהאקסל" — NOT the final category.
--
-- legacy_rule_category : The classification_rules match_value that fired, if
--                        the row was classified via a seed rule.  Useful for
--                        audit: shows which index entry triggered the suggestion.
--
-- source_sheet_name    : Which sheet inside the Excel the row came from
--                        (e.g. "הכנסות", "הוצאות").
--
-- notes                : Free-text annotation field, writable by the user in
--                        the import-review UI and later in the transactions UI.

ALTER TABLE import_rows ADD COLUMN legacy_category TEXT;
ALTER TABLE import_rows ADD COLUMN legacy_rule_category TEXT;
ALTER TABLE import_rows ADD COLUMN source_sheet_name TEXT;
ALTER TABLE import_rows ADD COLUMN notes TEXT;

-- Allows the review UI to quickly fetch rows that have a legacy category set.
CREATE INDEX idx_import_rows_legacy_category
  ON import_rows(workspace_id, legacy_category)
  WHERE legacy_category IS NOT NULL;
