-- BACK-3-005: manual stock adjustments (receiving, corrections, write-offs), distinct
-- from the automatic deduction/restock done by job approval/cancel. Append-only log.
CREATE TABLE inventory_adjustments (
    id         TEXT PRIMARY KEY NOT NULL,
    item_id    TEXT NOT NULL,
    type       TEXT NOT NULL,   -- 'receive' | 'correction' | 'writeoff'
    delta      REAL NOT NULL,   -- signed change applied to stock_on_hand
    note       TEXT,
    author     TEXT,            -- staff display name
    created_at INTEGER NOT NULL,
    FOREIGN KEY (item_id) REFERENCES inventory(id)
);

CREATE INDEX inventory_adjustments_item_idx ON inventory_adjustments (item_id, created_at);
