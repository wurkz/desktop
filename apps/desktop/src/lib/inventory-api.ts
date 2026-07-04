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
    unit_price?: number; // centavos
    unit_cost?: number; // centavos
}): Promise<Part> {
    return api.post<Part>("/api/inventory", input);
}
