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
