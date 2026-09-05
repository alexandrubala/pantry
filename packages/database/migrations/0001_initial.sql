-- Migration number: 0001
-- Harmless no-op so Wrangler can track the migration workflow.
-- Portable SQLite. Does not create Pantry application tables.
--
-- D1 enforces foreign keys by default. Do not set PRAGMA foreign_keys.
-- For future complex migrations that temporarily violate FKs, use:
--   PRAGMA defer_foreign_keys = ON;
-- then restore afterward. Verify with:
--   PRAGMA foreign_key_check;
-- (zero rows = valid)

SELECT 1;
