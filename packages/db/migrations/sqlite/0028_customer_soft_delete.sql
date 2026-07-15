-- BACK-3-020: customer soft-delete (sync has no hard deletes — same pattern as assets.deleted_at).
-- Deleted customers are hidden from the directory and pickers; historical jobs keep the reference.
ALTER TABLE customers ADD COLUMN deleted_at INTEGER;
