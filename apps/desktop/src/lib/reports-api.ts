import { api } from "./api";
import type { DrawerSession, DrawerMovement } from "./financials-api";

// BACK-3-018: composed data for the printable reports.

export interface EodReport {
    session: DrawerSession;
    payments_by_method: { method: string; n: number; total: number }[];
    drawer_expenses: { category: string; amount: number; note: string | null; author: string | null; created_at: number }[];
    movements: DrawerMovement[];
    jobs_done: number;
}

/** End-of-Day (Z-reading) data for the most recently closed drawer session. */
export function eodReport(): Promise<EodReport> {
    return api.get<EodReport>("/api/drawer/report");
}

export interface SoaData {
    customer: { id: string; name: string; phone: string | null };
    items: {
        id: string;
        receipt_number: string | null;
        job_order_no: string | null;
        total: number;
        paid: number;
        balance: number;
        created_at: number;
    }[];
}

/** Statement of Account: the customer's outstanding balances across finished jobs. */
export function soaData(customerId: string): Promise<SoaData> {
    return api.get<SoaData>(`/api/reports/soa/${customerId}`);
}
