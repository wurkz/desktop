-- Estimate line items can reference an inventory part (BACK-2-005 / BACK-3-006).
-- Nullable: service lines and free-text parts have no inventory link. Stock deduction on
-- approval is handled later (BACK-3-006).
ALTER TABLE order_items ADD COLUMN inventory_item_id TEXT;
