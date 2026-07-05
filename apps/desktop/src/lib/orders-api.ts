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
    unit: string | null; // e.g. "pc", "set", "L"
    unit_price: number; // centavos
    total: number; // centavos
    inventory_item_id: string | null;
    completed: number; // 1 = done
}

export interface JobTicket {
    id: string;
    asset_id: string;
    customer_id: string | null;
    status: OrderStatus;
    customer_complaint: string | null;
    inspection: InspectionItem[] | null;
    receipt_number: string | null;
    job_order_no: string | null;
    terms: string | null;
    subtotal: number;
    tax: number;
    discount: number;
    total: number;
    created_at: number;
    updated_at: number;
    assigned_mechanic_id: string | null;
    asset?: { id: string; type: string; specs: Record<string, unknown> };
    customer?: { id: string; name: string; phone: string | null } | null;
    mechanic?: { id: string; name: string; role: string } | null;
    items?: OrderItem[];
    approval_proof?: { approved_by: string; method: string; at: number } | null;
}

export interface JobSummary {
    id: string;
    status: OrderStatus;
    customer_complaint: string | null;
    created_at: number;
    assigned_mechanic_id: string | null;
    asset?: { type: string; specs: Record<string, unknown> };
}

export interface EstimateItemInput {
    type: "service" | "part";
    description: string;
    quantity: number;
    unit?: string | null; // e.g. "pc", "set", "L"
    unit_price: number; // centavos
    inventory_item_id?: string | null;
}

export function saveEstimate(
    orderId: string,
    input: { items: EstimateItemInput[]; discount: number }
): Promise<JobTicket> {
    return api.put<JobTicket>(`/api/orders/${orderId}/estimate`, input);
}

export function approveOrder(
    orderId: string,
    input: { approved_by: string; method: string }
): Promise<JobTicket> {
    return api.post<JobTicket>(`/api/orders/${orderId}/approve`, input);
}

export function listJobs(assignedToMe = false): Promise<JobSummary[]> {
    return api.get<JobSummary[]>(`/api/orders${assignedToMe ? "?assigned=me" : ""}`);
}

export function assignOrder(orderId: string, mechanicId: string | null): Promise<JobTicket> {
    return api.post<JobTicket>(`/api/orders/${orderId}/assign`, { mechanic_id: mechanicId });
}

export function completeItem(itemId: string, completed: boolean): Promise<JobTicket> {
    return api.put<JobTicket>(`/api/order_items/${itemId}/complete`, { completed });
}

export function markDone(orderId: string): Promise<JobTicket> {
    return api.post<JobTicket>(`/api/orders/${orderId}/done`);
}

export function billOrder(orderId: string): Promise<JobTicket> {
    return api.post<JobTicket>(`/api/orders/${orderId}/bill`);
}

export function createOrder(input: {
    asset_id: string;
    customer_complaint?: string;
    inspection?: InspectionItem[];
    job_order_no?: string | null;
    terms?: string | null;
}): Promise<JobTicket> {
    return api.post<JobTicket>("/api/orders", input);
}

export function getOrder(id: string): Promise<JobTicket> {
    return api.get<JobTicket>(`/api/orders/${id}`);
}
