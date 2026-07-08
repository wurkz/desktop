import { create } from "zustand";

// BACK-4 prep: live cloud-link status for the UI. The sync engine + backend are parked, so this
// only ever reflects connectivity — the app never depends on it (stays fully local-first).
export type CloudStatus = "off" | "connecting" | "connected" | "error";

interface CloudSyncState {
    status: CloudStatus;
    detail: string;
    set: (status: CloudStatus, detail?: string) => void;
}

export const useCloudSyncStore = create<CloudSyncState>((set) => ({
    status: "off",
    detail: "",
    set: (status, detail = "") => set({ status, detail }),
}));
