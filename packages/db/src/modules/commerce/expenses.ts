import type { Selectable } from 'kysely';
import type { Nullable } from '../../core/column-types';

// BACK-3-010: money-out log. Immutable; mistakes are soft-voided (voided = 1), never deleted,
// so the append-friendly sync protocol propagates corrections.
export interface ExpensesTable {
    id: string;
    category: string; // 'parts' | 'salary' | 'utilities' | 'rent' | 'misc'
    amount: number; // centavos
    note: Nullable<string>;
    paid_from_drawer: number; // 1 = cash out of the drawer (counts in reconciliation)
    author: Nullable<string>;
    voided: number;
    voided_by: Nullable<string>;
    receive_id: Nullable<string>; // on-account receive this payment settles (partial allowed)
    created_at: number;
    updated_at: number;
}

export type Expense = Selectable<ExpensesTable>;
