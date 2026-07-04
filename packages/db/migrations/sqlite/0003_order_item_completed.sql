-- Mechanic execution (BACK-2-007): mechanics check off line items as they complete work.
ALTER TABLE order_items ADD COLUMN completed INTEGER NOT NULL DEFAULT 0;
