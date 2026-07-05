import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely';

/**
 * A nullable column that is also optional on insert/update (may be omitted).
 * Select => T | null, Insert => T | null | undefined, Update => T | null.
 */
type Nullable<T> = ColumnType<T | null, T | null | undefined, T | null>;

// NOTE: All MONEY columns are INTEGER minor units (centavos). Never store decimals.
// Format for display with the helpers in @zorviz/core (formatMoney). All timestamps
// are INTEGER milliseconds (Date.now()).

// ============================================
// Core Tables
// ============================================

// 'owner' is the business owner (highest privilege; primary user of the future online/remote
// dashboard). 'admin' is the on-site shop administrator. See D22.
export type UserRole = 'owner' | 'admin' | 'advisor' | 'mechanic';

export interface UsersTable {
    id: string;
    name: string;
    username: string;
    pin_hash: string;
    pin_salt: string;
    role: UserRole;
    email: Nullable<string>;
    is_active: ColumnType<number, number | undefined, number>; // 1 = active, 0 = deactivated
    created_at: number;
    updated_at: number;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;

export interface CustomersTable {
    id: string;
    tenant_id: string;
    name: string;
    phone: Nullable<string>;
    email: Nullable<string>;
    address: Nullable<string>;
    created_at: number;
    updated_at: number;
}

export type Customer = Selectable<CustomersTable>;
export type NewCustomer = Insertable<CustomersTable>;
export type CustomerUpdate = Updateable<CustomersTable>;

export interface SyncMetadataTable {
    id: string;
    table_name: string;
    record_id: string;
    last_synced_at: Nullable<number>;
    sync_hash: Nullable<string>;
}

export type SyncMetadata = Selectable<SyncMetadataTable>;
export type NewSyncMetadata = Insertable<SyncMetadataTable>;
export type SyncMetadataUpdate = Updateable<SyncMetadataTable>;

export interface AppConfigTable {
    id: string;
    tenant_id: string;
    branch_id: string;
    shop_name: string;
    device_name: string;
    currency_symbol: string;
    locale: string;
    tax_rate: Nullable<number>; // e.g. 0.12 — no baked default (region-agnostic)
    address: Nullable<string>;
    contact_phone: Nullable<string>;
    contact_email: Nullable<string>;
    logo_path: Nullable<string>;
    tax_registration_id: Nullable<string>;
    custom_fields: Nullable<string>; // JSON: { label: value }
    backup_dir: Nullable<string>; // backup destination folder (null → <data>/backups)
    created_at: number;
    updated_at: number;
}

export type AppConfig = Selectable<AppConfigTable>;
export type NewAppConfig = Insertable<AppConfigTable>;
export type AppConfigUpdate = Updateable<AppConfigTable>;

// ============================================
// Repair Module Tables
// ============================================

export interface AssetsTable {
    id: string;
    tenant_id: string;
    owner_id: Nullable<string>; // references customers(id)
    type: string; // stable asset-type key from asset_types (data-driven, BACK-1-006)
    specs: string; // JSON string
    created_at: number;
    updated_at: number;
    deleted_at: Nullable<number>;
}

export type Asset = Selectable<AssetsTable>;
export type NewAsset = Insertable<AssetsTable>;
export type AssetUpdate = Updateable<AssetsTable>;

// BACK-2-010: lightweight bookings. Contact + note + time; asset/customer are linked
// only on convert (both nullable).
export interface BookingsTable {
    id: string;
    customer_name: Nullable<string>;
    customer_phone: Nullable<string>;
    note: Nullable<string>;
    scheduled_time: number;
    status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
    asset_id: Nullable<string>;
    customer_id: Nullable<string>; // references customers(id)
    created_at: number;
    updated_at: number;
}

export type Booking = Selectable<BookingsTable>;
export type NewBooking = Insertable<BookingsTable>;
export type BookingUpdate = Updateable<BookingsTable>;

// Canonical job-ticket status flow (D19).
export type OrderStatus =
    | 'triage'
    | 'estimate'
    | 'approved'
    | 'in_progress'
    | 'done'
    | 'paid'
    | 'cancelled';

export interface OrdersTable {
    id: string;
    booking_id: Nullable<string>;
    asset_id: string;
    customer_id: Nullable<string>; // references customers(id)
    status: OrderStatus;
    customer_complaint: Nullable<string>;
    assigned_mechanic_id: Nullable<string>; // references users(id)
    receipt_number: Nullable<string>; // set at billing
    approval_proof: Nullable<string>; // who + how approved (D5)
    inspection: Nullable<string>; // JSON: intake inspection checklist
    subtotal: number; // centavos
    tax: number; // centavos
    discount: number; // centavos
    total: number; // centavos
    created_at: number;
    updated_at: number;
}

export type Order = Selectable<OrdersTable>;
export type NewOrder = Insertable<OrdersTable>;
export type OrderUpdate = Updateable<OrdersTable>;

// ============================================
// Commerce Module Tables
// ============================================

export interface OrderItemsTable {
    id: string;
    order_id: string;
    type: 'service' | 'part';
    description: string;
    quantity: number;
    unit_price: number; // centavos
    total: number; // centavos
    inventory_item_id: Nullable<string>; // set when a part is picked from inventory
    completed: ColumnType<number, number | undefined, number>; // 1 = done by mechanic
}

export type OrderItem = Selectable<OrderItemsTable>;
export type NewOrderItem = Insertable<OrderItemsTable>;
export type OrderItemUpdate = Updateable<OrderItemsTable>;

export interface InventoryTable {
    id: string;
    sku: string;
    name: string;
    description: Nullable<string>;
    stock_on_hand: number;
    reorder_point: number;
    unit_cost: number; // centavos
    unit_price: number; // centavos
}

export type InventoryItem = Selectable<InventoryTable>;
export type NewInventoryItem = Insertable<InventoryTable>;
export type InventoryItemUpdate = Updateable<InventoryTable>;

// ============================================
// Database Schema
// ============================================

// BACK-1-006: data-driven shop asset types. `fields` is a JSON string:
// [{ key, label, kind: 'text' | 'number', required: boolean }]. `key` is the stable
// slug stored in assets.type. Access is via the HTTP API (single path), not Kysely —
// this interface is kept in sync per convention.
export interface AssetTypesTable {
    id: string;
    tenant_id: string;
    key: string;
    name: string;
    icon: Nullable<string>;
    fields: string; // JSON array of field defs
    show_on_create: number; // 0 | 1
    sort_order: number;
    created_at: number;
    updated_at: number;
}
export type AssetType = Selectable<AssetTypesTable>;
export type NewAssetType = Insertable<AssetTypesTable>;
export type AssetTypeUpdate = Updateable<AssetTypesTable>;

export interface Database {
    users: UsersTable;
    customers: CustomersTable;
    sync_metadata: SyncMetadataTable;
    app_config: AppConfigTable;
    assets: AssetsTable;
    asset_types: AssetTypesTable;
    bookings: BookingsTable;
    orders: OrdersTable;
    order_items: OrderItemsTable;
    inventory: InventoryTable;
}
