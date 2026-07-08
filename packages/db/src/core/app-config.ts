import type { Insertable, Selectable, Updateable } from 'kysely';
import type { Nullable } from './column-types';

export interface AppConfigTable {
    id: string;
    tenant_id: string;
    branch_id: string;
    shop_name: string;
    device_name: string;
    currency_symbol: string;
    locale: string;
    tax_rate: Nullable<number>; // e.g. 0.12 — no baked default (region-agnostic)
    address: Nullable<string>;
    contact_phone: Nullable<string>;
    contact_email: Nullable<string>;
    logo_path: Nullable<string>;
    tax_registration_id: Nullable<string>;
    custom_fields: Nullable<string>; // JSON: { label: value }
    backup_dir: Nullable<string>; // backup destination folder (null → <data>/backups)
    // BIR-style document fields (PH market). Blank values are not printed.
    proprietor: Nullable<string>; // e.g. "Clandestine S. Palo"
    business_style: Nullable<string>; // BIR trade name
    vat_status: Nullable<string>; // 'vat' | 'non_vat' | null
    terms_and_conditions: Nullable<string>; // printed T&C block
    document_title: Nullable<string>; // printout title; null → "Invoice"
    max_discount_pct: Nullable<number>; // cap on manual discount as a fraction (null = no cap)
    mechanic_label: Nullable<string>; // display name for the mechanic role (null → "Mechanic")
    tax_inclusive: number; // BACK-3-009: 1 = entered prices include VAT; 0 = VAT added on top
    // Cloud-link config (BACK-4 prep) — opt-in, default off; the app runs fully local without these.
    cloud_url: Nullable<string>; // backend base URL (null = not linked)
    device_token: Nullable<string>; // bearer token for authenticated sync
    sync_enabled: number; // 1 = cloud sync on; 0 = off (default)
    created_at: number;
    updated_at: number;
}

export type AppConfig = Selectable<AppConfigTable>;
export type NewAppConfig = Insertable<AppConfigTable>;
export type AppConfigUpdate = Updateable<AppConfigTable>;
