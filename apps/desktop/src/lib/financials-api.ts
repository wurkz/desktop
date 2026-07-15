import { api } from "./api";

// BACK-3-010/011: expenses log + cash-drawer sessions.

export interface Expense {
    id: string;
    category: string; // 'parts' | 'salary' | 'utilities' | 'rent' | 'misc'
    amount: number; // centavos
    note: string | null;
    paid_from_drawer: number; // 1 = cash out of the drawer
    author: string | null;
    voided: number;
    voided_by: string | null;
    created_at: number;
    updated_at: number;
}

export const EXPENSE_CATEGORIES = [
    { key: "parts", label: "Parts purchase" },
    { key: "salary", label: "Salary / wages" },
    { key: "utilities", label: "Utilities" },
    { key: "rent", label: "Rent" },
    { key: "misc", label: "Miscellaneous" },
] as const;

export function listExpenses(opts: { from?: number; to?: number; limit?: number; offset?: number } = {}): Promise<Expense[]> {
    const p = new URLSearchParams();
    if (opts.from != null) p.set("from", String(opts.from));
    if (opts.to != null) p.set("to", String(opts.to));
    p.set("limit", String(opts.limit ?? 100));
    p.set("offset", String(opts.offset ?? 0));
    return api.get<Expense[]>(`/api/expenses?${p}`);
}

export function createExpense(input: {
    category: string;
    amount: number; // centavos
    note?: string | null;
    paid_from_drawer: boolean;
    receive_adjustment_id?: string | null; // BACK-3-016: settles an on-account stock receive
}): Promise<Expense> {
    return api.post<Expense>("/api/expenses", input);
}

export function voidExpense(id: string): Promise<Expense> {
    return api.post<Expense>(`/api/expenses/${id}/void`);
}

// Recent live parts expenses not yet linked to a receive (BACK-3-016 picker).
export function listLinkableExpenses(): Promise<Expense[]> {
    return api.get<Expense[]>("/api/expenses/linkable");
}

export interface DrawerSession {
    id: string;
    opening_float: number; // centavos
    expected_cash: number | null;
    counted_cash: number | null;
    over_short: number | null; // negative = short
    opened_by: string | null;
    closed_by: string | null;
    opened_at: number;
    closed_at: number | null;
    created_at: number;
    updated_at: number;
}

export interface DrawerMovement {
    id: string;
    type: string; // 'cash_in' | 'cash_drop'
    amount: number; // centavos
    note: string | null;
    author: string | null;
    created_at: number;
}

export function drawerStatus(): Promise<{
    open: DrawerSession | null;
    last_closed: DrawerSession | null;
    movements: DrawerMovement[];
}> {
    return api.get("/api/drawer");
}

// Mid-day paid-in/paid-out (BACK-3-017). Not an expense: profit untouched, only the drawer.
export function drawerMovement(type: "cash_in" | "cash_drop", amount: number, note?: string | null): Promise<DrawerMovement> {
    return api.post<DrawerMovement>("/api/drawer/movement", { type, amount, note });
}

export function openDrawer(openingFloat: number): Promise<DrawerSession> {
    return api.post<DrawerSession>("/api/drawer/open", { opening_float: openingFloat });
}

export function closeDrawer(countedCash: number): Promise<DrawerSession> {
    return api.post<DrawerSession>("/api/drawer/close", { counted_cash: countedCash });
}
