import { create } from "zustand";
import { api } from "../lib/api";
import type { AppConfig } from "@zorviz/db";

export interface UpdateConfigInput {
    shop_name: string;
    device_name: string;
    currency_symbol: string;
    locale: string;
    tax_rate: number | null;
    address: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    tax_registration_id: string | null;
    custom_fields: Record<string, string> | null;
}

interface AppConfigState {
    config: AppConfig | null;
    isChecked: boolean; // has the initial setup check completed?
    isSetup: boolean; // does an app_config row exist?
    isLoading: boolean;
    fetchConfig: () => Promise<void>;
    updateConfig: (input: UpdateConfigInput) => Promise<void>;
}

export const useAppConfigStore = create<AppConfigState>((set) => ({
    config: null,
    isChecked: false,
    isSetup: false,
    isLoading: false,
    fetchConfig: async () => {
        set({ isLoading: true });
        try {
            const config = await api.get<AppConfig | null>("/api/config");
            set({
                config: config ?? null,
                isSetup: !!config,
                isChecked: true,
                isLoading: false,
            });
        } catch (e) {
            console.error("Failed to fetch app config:", e);
            // A failure (e.g. server not ready) is treated as "checked, not set up".
            set({ isChecked: true, isLoading: false });
        }
    },
    updateConfig: async (input) => {
        const config = await api.put<AppConfig>("/api/config", input);
        set({ config, isSetup: true });
    },
}));
