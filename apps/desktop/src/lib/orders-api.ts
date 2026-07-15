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
    senior_pwd_type: string | null; // 'senior' | 'pwd' | null
    senior_pwd_id: string | null;
    senior_pwd_name: string | null;
    subtotal: number;
    tax: number;
    discount: number; // manual
    senior_discount: number; // computed 20%
    total: number;
    started_at: number | null;
    completed_at: number | null;
    cancel_reason: string | null;
    created_at: number;
    updated_at: number;
    assigned_mechanic_id: string | null;
    asset?: { id: string; type: string; specs: Record<string, unknown> };
    customer?: { id: string; name: string; phone: string | null } | null;
    mechanic?: { id: string; name: string; role: string } | null;
    items?: OrderItem[];
    approval_proof?: { approved_by: string; method: string; at: number } | null;
    payment?: PaymentRecord | null; // latest (kept for the PDF)
    payments?: PaymentRecord[]; // full history, oldest first (BACK-3-012)
    paid_total?: number; // centavos received so far
    balance_due?: number; // centavos outstanding (0 when settled)
}

export interface PaymentRecord {
    method: string; // 'cash' | 'gcash' | 'card'
    amount: number; // centavos — THIS payment's amount (full or partial)
    tendered: number; // centavos
    change_due: number; // centavos
    processed_by: string | null;
    created_at: number;
}

export interface PaymentInput {
    method: string; // 'cash' | 'gcash' | 'card'
    tendered: number; // centavos
    amount?: number; // BACK-3-012: partial amount; omit to pay the full remaining balance
}

export interface JobSummary {
    id: string;
    status: OrderStatus;
    customer_complaint: string | null;
    created_at: number;
    assigned_mechanic_id: string | null;
    total: number; // centavos
    receipt_number: string | null;
    asset?: { type: string; specs: Record<string, unknown> };
    customer?: { id: string; name: string; phone: string | null } | null;
}

export interface EstimateItemInput {
    type: "service" | "part";
    description: string;
    quantity: number;
    unit?: string | null; // e.g. "pc", "set", "L"
    unit_price: number; // centavos
    inventory_item_id?: string | null;
}

export type SeniorPwdType = "senior" | "pwd" | null;

export function saveEstimate(
    orderId: string,
    input: {
        items: EstimateItemInput[];
        discount: number;
        senior_pwd_type?: SeniorPwdType;
        senior_pwd_id?: string | null;
        senior_pwd_name?: string | null;
    }
): Promise<JobTicket> {
    return api.put<JobTicket>(`/api/orders/${orderId}/estimate`, input);
}

// Set manual discount + senior/PWD status on an order (admin/advisor); recomputes totals.
// Usable at the estimate stage or the final/billing stage.
export function setDiscounts(
    orderId: string,
    input: {
        discount: number;
        senior_pwd_type: SeniorPwdType;
        senior_pwd_id: string | null;
        senior_pwd_name: string | null;
    }
): Promise<JobTicket> {
    return api.post<JobTicket>(`/api/orders/${orderId}/discounts`, input);
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

// All jobs, every status (management view for admin/advisor). BACK-2-030: windowed.
export function listAllJobs(limit = 100, offset = 0): Promise<JobSummary[]> {
    return api.get<JobSummary[]>(`/api/orders?scope=all&limit=${limit}&offset=${offset}`);
}

export function assignOrder(orderId: string, mechanicId: string | null): Promise<JobTicket> {
    return api.post<JobTicket>(`/api/orders/${orderId}/assign`, { mechanic_id: mechanicId });
}

export function completeItem(itemId: string, completed: boolean): Promise<JobTicket> {
    return api.put<JobTicket>(`/api/order_items/${itemId}/complete`, { completed });
}

// Mechanic starts work: approved → in_progress (stamps started_at; claims the job if
// unassigned and the actor is a mechanic).
export function startOrder(orderId: string): Promise<JobTicket> {
    return api.post<JobTicket>(`/api/orders/${orderId}/start`);
}

export function markDone(orderId: string): Promise<JobTicket> {
    return api.post<JobTicket>(`/api/orders/${orderId}/done`);
}

// Cancel an open job (admin/advisor). A reason is required. Non-destructive; throws
// ApiError(409) if already paid/cancelled, ApiError(400) if the reason is blank.
export function cancelOrder(orderId: string, reason: string): Promise<JobTicket> {
    return api.post<JobTicket>(`/api/orders/${orderId}/cancel`, { reason });
}

export function billOrder(orderId: string, input: PaymentInput): Promise<JobTicket> {
    return api.post<JobTicket>(`/api/orders/${orderId}/bill`, input);
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
