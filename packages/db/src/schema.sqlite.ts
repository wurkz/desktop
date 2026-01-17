import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// --- Users ---
export const users = sqliteTable('users', {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    role: text('role', { enum: ['admin', 'advisor', 'mechanic', 'customer'] }).notNull(),
    passwordHash: text('password_hash'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// --- Assets ---
export const assets = sqliteTable('assets', {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').references(() => users.id),
    type: text('type', { enum: ['vehicle', 'gadget', 'appliance'] }).notNull(),
    // Store generic specs as JSON string
    specs: text('specs', { mode: 'json' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
});

// --- Bookings ---
export const bookings = sqliteTable('bookings', {
    id: text('id').primaryKey(),
    assetId: text('asset_id').references(() => assets.id).notNull(),
    customerId: text('customer_id').references(() => users.id).notNull(),
    scheduledTime: integer('scheduled_time', { mode: 'timestamp' }).notNull(),
    status: text('status', { enum: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'] }).notNull().default('pending'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// --- Orders ---
export const orders = sqliteTable('orders', {
    id: text('id').primaryKey(),
    bookingId: text('booking_id').references(() => bookings.id),
    assetId: text('asset_id').references(() => assets.id).notNull(),
    status: text('status', { enum: ['estimate', 'approved', 'in_progress', 'completed', 'billed'] }).notNull().default('estimate'),
    approvalProof: text('approval_proof'), // URI or JSON

    // Financials
    subtotal: real('subtotal').notNull().default(0),
    tax: real('tax').notNull().default(0),
    discount: real('discount').notNull().default(0),
    total: real('total').notNull().default(0),

    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// --- Order Items ---
export const orderItems = sqliteTable('order_items', {
    id: text('id').primaryKey(),
    orderId: text('order_id').references(() => orders.id).notNull(),
    type: text('type', { enum: ['service', 'part'] }).notNull(),
    description: text('description').notNull(),
    quantity: real('quantity').notNull().default(1),
    unitPrice: real('unit_price').notNull().default(0),
    total: real('total').notNull().default(0),
});

// --- Inventory ---
export const inventory = sqliteTable('inventory', {
    id: text('id').primaryKey(),
    sku: text('sku').notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    stockOnHand: real('stock_on_hand').notNull().default(0),
    reorderPoint: real('reorder_point').notNull().default(5),
    unitCost: real('unit_cost').notNull().default(0),
    unitPrice: real('unit_price').notNull().default(0),
});

// --- Sync Metadata ---
export const syncMetadata = sqliteTable('sync_metadata', {
    id: text('id').primaryKey(),
    tableName: text('table_name').notNull(),
    recordId: text('record_id').notNull(),
    lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
    syncHash: text('sync_hash'),
});
