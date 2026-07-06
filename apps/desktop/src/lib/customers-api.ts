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

// Bulk CSV import (rows already parsed client-side). Dedupes by name+phone server-side.
export function importCustomers(
    customers: { name: string; phone?: string; email?: string; address?: string }[]
): Promise<{ imported: number; skipped: number }> {
    return api.post<{ imported: number; skipped: number }>("/api/customers/import", { customers });
}
