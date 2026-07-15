import type { Insertable, Selectable, Updateable } from 'kysely';
import type { Nullable } from './column-types';

// Customers are a shared core entity (referenced by assets, bookings and orders), not
// owned by any single feature module.
export interface CustomersTable {
    id: string;
    tenant_id: string;
    name: string;
    phone: Nullable<string>;
    email: Nullable<string>;
    address: Nullable<string>;
    notes: Nullable<string>; // staff-facing institutional memory (migration 0026)
    created_at: number;
    updated_at: number;
    deleted_at: Nullable<number>; // soft-delete (migration 0028) — hidden from directory/pickers
}

export type Customer = Selectable<CustomersTable>;
export type NewCustomer = Insertable<CustomersTable>;
export type CustomerUpdate = Updateable<CustomersTable>;
