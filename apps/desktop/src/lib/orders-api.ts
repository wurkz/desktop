import { api } from "./api";
import type { OrderStatus } from "@zorviz/db";

export interface InspectionItem {
    item: string;
    status: "ok" | "issue" | "na";
    note: string;
}

export interface OrderItem {
    id: string;
    order_id: string;
    type: "service" | "part";
    description: string;
    quantity: number;
    unit_price: number; // centavos
    total: number; // centavos
    inventory_item_id: string | null;
}

export interface JobTicket {
    id: string;
    asset_id: string;
    customer_id: string | null;
    status: OrderStatus;
    customer_complaint: string | null;
    inspection: InspectionItem[] | null;
    subtotal: number;
    tax: number;
    discount: number;
    total: number;
    created_at: number;
    updated_at: number;
    asset?: { id: string; type: string; specs: Record<string, unknown> };
    customer?: { id: string; name: string; phone: string | null } | null;
    items?: OrderItem[];
}

export interface EstimateItemInput {
    type: "service" | "part";
    description: string;
    quantity: number;
    unit_price: number; // centavos
    inventory_item_id?: string | null;
}

export function saveEstimate(
    orderId: string,
    input: { items: EstimateItemInput[]; discount: number }
): Promise<JobTicket> {
    return api.put<JobTicket>(`/api/orders/${orderId}/estimate`, input);
}

export function createOrder(input: {
    asset_id: string;
    customer_complaint?: string;
    inspection?: InspectionItem[];
}): Promise<JobTicket> {
    return api.post<JobTicket>("/api/orders", input);
}

export function getOrder(id: string): Promise<JobTicket> {
    return api.get<JobTicket>(`/api/orders/${id}`);
}
