import { api } from "./api";
import type { Customer } from "@zorviz/db";

export function searchCustomers(query: string): Promise<Customer[]> {
    return api.get<Customer[]>(`/api/customers?q=${encodeURIComponent(query)}`);
}

export function createCustomer(input: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
}): Promise<Customer> {
    return api.post<Customer>("/api/customers", input);
}

// Bulk CSV import (rows already parsed client-side). Dedupes by name+phone server-side
// (against the DB and within the batch). skipped_rows are display-only, never persisted.
export interface CustomerImportResult {
    imported: number;
    skipped: number;
    skipped_rows: Record<string, string>[]; // name, phone, email, address, reason
}

export function importCustomers(
    customers: { name: string; phone?: string; email?: string; address?: string }[]
): Promise<CustomerImportResult> {
    return api.post<CustomerImportResult>("/api/customers/import", { customers });
}

export function deleteCustomer(id: string): Promise<{ ok: boolean }> {
    return api.del<{ ok: boolean }>(`/api/customers/${id}`);
}
