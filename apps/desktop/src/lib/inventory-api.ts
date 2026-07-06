import { api } from "./api";

export interface Part {
    id: string;
    sku: string;
    name: string;
    description: string | null;
    stock_on_hand: number;
    reorder_point: number;
    unit_cost: number; // centavos
    unit_price: number; // centavos
}

export function searchInventory(query: string): Promise<Part[]> {
    return api.get<Part[]>(`/api/inventory?q=${encodeURIComponent(query)}`);
}

export function createInventory(input: {
    name: string;
    sku?: string;
    description?: string | null;
    stock_on_hand?: number;
    reorder_point?: number;
    unit_price?: number; // centavos
    unit_cost?: number; // centavos
}): Promise<Part> {
    return api.post<Part>("/api/inventory", input);
}

// Full inventory list (optionally only items at/below their reorder point).
export function listInventory(lowOnly = false): Promise<Part[]> {
    return api.get<Part[]>(`/api/inventory/all${lowOnly ? "?low=1" : ""}`);
}

export function updateInventory(
    id: string,
    input: {
        name: string;
        sku: string;
        description: string | null;
        reorder_point: number;
        unit_cost: number; // centavos
        unit_price: number; // centavos
    }
): Promise<Part> {
    return api.put<Part>(`/api/inventory/${id}`, input);
}

// Hard delete; throws ApiError(409) when the part is used on job lines.
export function deleteInventory(id: string): Promise<{ ok: boolean }> {
    return api.del<{ ok: boolean }>(`/api/inventory/${id}`);
}

export type AdjustmentType = "receive" | "correction" | "writeoff";

export interface StockAdjustment {
    id: string;
    item_id: string;
    type: AdjustmentType;
    delta: number;
    note: string | null;
    author: string | null;
    created_at: number;
}

// Manual stock adjustment (delta is signed; logged with the acting user).
export function adjustStock(id: string, input: { type: AdjustmentType; delta: number; note?: string | null }): Promise<Part> {
    return api.post<Part>(`/api/inventory/${id}/adjust`, input);
}

export function listAdjustments(id: string): Promise<StockAdjustment[]> {
    return api.get<StockAdjustment[]>(`/api/inventory/${id}/adjustments`);
}

// Bulk CSV import (rows already parsed client-side). Dedupes by SKU/name server-side.
export function importInventory(items: {
    name: string;
    sku?: string;
    description?: string;
    stock?: number;
    reorder_point?: number;
    unit_cost?: number; // centavos
    unit_price?: number; // centavos
}[]): Promise<{ imported: number; skipped: number }> {
    return api.post<{ imported: number; skipped: number }>("/api/inventory/import", { items });
}
