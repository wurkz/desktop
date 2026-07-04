-- Zorviz v1 initial schema (BACK-0-002 consolidated migration).
-- Squashes the earlier drizzle-generated migrations into one clean baseline.
-- Conventions:
--   * All timestamps are INTEGER milliseconds (Date.now()), supplied by the app. No unixepoch() defaults.
--   * All MONEY columns are INTEGER minor units (centavos). Format for display only (see @zorviz/core money helpers).
--   * Rates (e.g. tax_rate) and quantities/stock remain REAL.

CREATE TABLE users (
    id            TEXT PRIMARY KEY NOT NULL,
    email         TEXT NOT NULL,
    role          TEXT NOT NULL,
    password_hash TEXT,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
);

CREATE TABLE customers (
    id         TEXT PRIMARY KEY NOT NULL,
    tenant_id  TEXT NOT NULL,
    name       TEXT NOT NULL,
    phone      TEXT,
    email      TEXT,
    address    TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE app_config (
    id                  TEXT PRIMARY KEY NOT NULL,
    tenant_id           TEXT NOT NULL,
    branch_id           TEXT NOT NULL,
    device_name         TEXT NOT NULL,
    currency_symbol     TEXT NOT NULL DEFAULT '$',
    locale              TEXT NOT NULL DEFAULT 'en-US',
    tax_rate            REAL,
    address             TEXT,
    contact_phone       TEXT,
    contact_email       TEXT,
    logo_path           TEXT,
    tax_registration_id TEXT,
    custom_fields       TEXT,
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL
);

CREATE TABLE assets (
    id         TEXT PRIMARY KEY NOT NULL,
    tenant_id  TEXT NOT NULL,
    owner_id   TEXT,
    type       TEXT NOT NULL,
    specs      TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (owner_id) REFERENCES customers(id)
);

CREATE TABLE bookings (
    id             TEXT PRIMARY KEY NOT NULL,
    asset_id       TEXT NOT NULL,
    customer_id    TEXT NOT NULL,
    scheduled_time INTEGER NOT NULL,
    status         TEXT NOT NULL DEFAULT 'pending',
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL,
    FOREIGN KEY (asset_id) REFERENCES assets(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE orders (
    id                   TEXT PRIMARY KEY NOT NULL,
    booking_id           TEXT,
    asset_id             TEXT NOT NULL,
    customer_id          TEXT,
    status               TEXT NOT NULL DEFAULT 'triage',
    customer_complaint   TEXT,
    assigned_mechanic_id TEXT,
    receipt_number       TEXT,
    approval_proof       TEXT,
    subtotal             INTEGER NOT NULL DEFAULT 0,
    tax                  INTEGER NOT NULL DEFAULT 0,
    discount             INTEGER NOT NULL DEFAULT 0,
    total                INTEGER NOT NULL DEFAULT 0,
    created_at           INTEGER NOT NULL,
    updated_at           INTEGER NOT NULL,
    FOREIGN KEY (booking_id) REFERENCES bookings(id),
    FOREIGN KEY (asset_id) REFERENCES assets(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (assigned_mechanic_id) REFERENCES users(id)
);

CREATE TABLE order_items (
    id          TEXT PRIMARY KEY NOT NULL,
    order_id    TEXT NOT NULL,
    type        TEXT NOT NULL,
    description TEXT NOT NULL,
    quantity    REAL NOT NULL DEFAULT 1,
    unit_price  INTEGER NOT NULL DEFAULT 0,
    total       INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE inventory (
    id            TEXT PRIMARY KEY NOT NULL,
    sku           TEXT NOT NULL,
    name          TEXT NOT NULL,
    description   TEXT,
    stock_on_hand REAL NOT NULL DEFAULT 0,
    reorder_point REAL NOT NULL DEFAULT 5,
    unit_cost     INTEGER NOT NULL DEFAULT 0,
    unit_price    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE sync_metadata (
    id             TEXT PRIMARY KEY NOT NULL,
    table_name     TEXT NOT NULL,
    record_id      TEXT NOT NULL,
    last_synced_at INTEGER,
    sync_hash      TEXT
);

CREATE UNIQUE INDEX users_email_unique ON users (email);
CREATE UNIQUE INDEX inventory_sku_unique ON inventory (sku);
CREATE INDEX customers_phone_idx ON customers (phone);
CREATE INDEX assets_owner_idx ON assets (owner_id);
CREATE INDEX orders_asset_idx ON orders (asset_id);
CREATE INDEX orders_status_idx ON orders (status);
CREATE INDEX orders_mechanic_idx ON orders (assigned_mechanic_id);
CREATE INDEX bookings_scheduled_idx ON bookings (scheduled_time);
