import { api } from "./api";

// Master-data clients: customers and suppliers as first-class records with money aggregates.

export interface CustomerRow {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    jobs: number;
    lifetime_paid: number;
    balance: number; // open balance across done jobs
    created_at: number;
}

export function customerDirectory(q = "", limit = 100, offset = 0): Promise<CustomerRow[]> {
    return api.get<CustomerRow[]>(`/api/customers/all?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`);
}

export interface CustomerRecord {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
    created_at: number;
}

export interface CustomerJob {
    id: string;
    job_order_no: string | null;
    receipt_number: string | null;
    status: string;
    total: number;
    paid: number;
    balance: number; // open balance (done jobs only)
    asset_id: string;
    created_at: number;
}

export interface CustomerAsset {
    id: string;
    type: string;
    specs: string; // JSON
    created_at: number;
}

export interface CustomerDetail {
    customer: CustomerRecord;
    assets: CustomerAsset[];
    jobs: CustomerJob[];
    balance: number;
    lifetime_paid: number;
}

export function customerDetail(id: string): Promise<CustomerDetail> {
    return api.get<CustomerDetail>(`/api/customers/${id}/detail`);
}

export interface UpdateCustomerInput {
    name: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    notes?: string | null;
}

export function updateCustomer(id: string, input: UpdateCustomerInput): Promise<CustomerRecord> {
    return api.put<CustomerRecord>(`/api/customers/${id}`, input);
}

export interface Supplier {
    id: string;
    name: string;
    contact_person: string | null;
    phone: string | null;
    address: string | null;
    notes: string | null;
    created_at: number;
    updated_at: number;
}

export interface SupplierRow extends Supplier {
    owed: number; // outstanding payable balance
    last_receive_at: number | null;
}

export function listSupplierRecords(): Promise<SupplierRow[]> {
    return api.get<SupplierRow[]>("/api/suppliers");
}

export interface SupplierInput {
    name: string;
    contact_person?: string | null;
    phone?: string | null;
    address?: string | null;
    notes?: string | null;
}

export function createSupplier(input: SupplierInput): Promise<Supplier> {
    return api.post<Supplier>("/api/suppliers", input);
}

export function updateSupplier(id: string, input: SupplierInput): Promise<Supplier> {
    return api.put<Supplier>(`/api/suppliers/${id}`, input);
}

// Bulk CSV import (rows already parsed client-side). Dedupes by name (case-insensitive)
// server-side (against the DB and within the batch). skipped_rows are display-only.
export interface SupplierImportResult {
    imported: number;
    skipped: number;
    skipped_rows: Record<string, string>[]; // name, contact_person, phone, address, notes, reason
}

export function importSuppliers(suppliers: SupplierInput[]): Promise<SupplierImportResult> {
    return api.post<SupplierImportResult>("/api/suppliers/import", { suppliers });
}

export interface SupplierReceive {
    id: string;
    item_name: string;
    sku: string;
    delta: number;
    total_cost: number | null;
    paid: number;
    balance: number; // remaining owed (0 when settled/paid up front)
    on_account: number;
    expense_id: string | null;
    note: string | null;
    created_at: number;
}

export interface SupplierDetail {
    supplier: Supplier;
    receives: SupplierReceive[];
    owed: number;
}

export function supplierDetail(id: string): Promise<SupplierDetail> {
    return api.get<SupplierDetail>(`/api/suppliers/${id}`);
}
