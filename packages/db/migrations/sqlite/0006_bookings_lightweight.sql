-- BACK-2-010: lightweight bookings (call-aheads). A booking is a quick note —
-- customer name/phone + free-text note + time — with no asset yet. When the customer
-- arrives, an admin/advisor converts it into the normal asset + job-ticket flow.
-- The original bookings table (asset_id/customer_id NOT NULL, never used by any UI) is
-- rebuilt here; asset_id/customer_id are now nullable so they can be linked on convert.
DROP TABLE IF EXISTS bookings;

CREATE TABLE bookings (
    id             TEXT PRIMARY KEY NOT NULL,
    customer_name  TEXT,                       -- lightweight contact (no customers row required)
    customer_phone TEXT,
    note           TEXT,                       -- free description ("Toyota Vios, aircon not cold")
    scheduled_time INTEGER NOT NULL,
    status         TEXT NOT NULL DEFAULT 'pending',
    asset_id       TEXT,                       -- linked on convert (nullable)
    customer_id    TEXT,                       -- linked on convert (nullable)
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL,
    FOREIGN KEY (asset_id) REFERENCES assets(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE INDEX bookings_status_time_idx ON bookings (status, scheduled_time);
