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

// ---- Tier 2 ----

export interface FinancialSummary {
    revenue: number;
    payments_by_method: { method: string; n: number; total: number }[];
    expenses_by_category: { category: string; total: number }[];
    expenses_total: number;
    vat_collected: number; // pro-rata per payment
    cogs: number; // pro-rata per payment
    discounts_given: number; // pro-rata per payment
    exempt_collections: number; // senior/PWD (VAT-exempt) collections
}

export function financialSummary(from: number, to: number): Promise<FinancialSummary> {
    return api.get<FinancialSummary>(`/api/reports/financial-summary?from=${from}&to=${to}`);
}

export interface SeniorPwdRow {
    id: string;
    receipt_number: string | null;
    senior_pwd_type: string;
    senior_pwd_id: string | null;
    senior_pwd_name: string | null;
    subtotal: number;
    senior_discount: number;
    total: number;
    paid_at: number;
}

export function seniorPwdReport(from: number, to: number): Promise<SeniorPwdRow[]> {
    return api.get<SeniorPwdRow[]>(`/api/reports/senior-pwd?from=${from}&to=${to}`);
}

export interface MechanicRow {
    assigned_mechanic_id: string;
    name: string | null;
    jobs: number;
    avg_ms: number;
    total_ms: number;
    revenue: number;
}

export function mechanicReport(from: number, to: number): Promise<MechanicRow[]> {
    return api.get<MechanicRow[]>(`/api/reports/mechanics?from=${from}&to=${to}`);
}
