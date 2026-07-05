// Client for the shop logo (BACK-0-013, single-path HTTP API).
import { api, API_BASE } from "./api";

// URL for the current logo. Pass a version (e.g. config.updated_at) to bust the cache
// after an upload/replace.
export function logoUrl(version?: number | string): string {
    return `${API_BASE}/api/logo${version ? `?v=${version}` : ""}`;
}

export function uploadLogo(dataBase64: string, ext: string): Promise<{ ok: boolean; logo_path: string }> {
    return api.post("/api/logo", { data: dataBase64, ext });
}

export function deleteLogo(): Promise<{ ok: boolean }> {
    return api.del("/api/logo");
}

// Fetch the logo as a data URL (for embedding in the jsPDF invoice). Null if none/error.
export async function fetchLogoDataUrl(): Promise<string | null> {
    try {
        const res = await fetch(logoUrl(Date.now()));
        if (!res.ok) return null;
        const blob = await res.blob();
        return await new Promise((resolve) => {
            const r = new FileReader();
            r.onloadend = () => resolve(typeof r.result === "string" ? r.result : null);
            r.onerror = () => resolve(null);
            r.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}
