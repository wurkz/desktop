// Typed client for the repair data endpoints (single path — data lives in the Rust API).
import { api } from "./api";
import type { AssetWithHistory, CreateAssetInput } from "@zorviz/feature-repair";
import type { OrderStatus } from "@zorviz/db";

export function searchAssets(query: string): Promise<AssetWithHistory[]> {
    return api.get<AssetWithHistory[]>(`/api/assets?q=${encodeURIComponent(query)}`);
}

export function createAsset(input: CreateAssetInput): Promise<AssetWithHistory> {
    return api.post<AssetWithHistory>("/api/assets", {
        type: input.type,
        specs: input.specs,
        owner_id: input.ownerId ?? null,
    });
}

export interface ServiceHistoryItem {
    id: string;
    status: OrderStatus;
    total: number; // centavos
    created_at: number;
    receipt_number: string | null;
    customer_complaint: string | null;
}

export interface AssetDetail {
    id: string;
    type: string;
    specs: Record<string, unknown>;
    owner?: { id: string; name: string; phone: string | null } | null;
    history: ServiceHistoryItem[];
}

export function getAsset(id: string): Promise<AssetDetail> {
    return api.get<AssetDetail>(`/api/assets/${id}`);
}

// Edit an asset's specs + owner. Type is immutable (fixed per shop) and not sent.
export function updateAsset(
    id: string,
    input: { specs: Record<string, string>; ownerId?: string | null }
): Promise<AssetDetail> {
    return api.put<AssetDetail>(`/api/assets/${id}`, {
        specs: input.specs,
        owner_id: input.ownerId ?? null,
    });
}

// Soft-delete an asset. Throws ApiError(409) if it still has open job tickets.
export function deleteAsset(id: string): Promise<{ ok: boolean }> {
    return api.del<{ ok: boolean }>(`/api/assets/${id}`);
}
