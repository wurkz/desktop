// HTTP client for the shared Rust/axum API (D23, single path).
// In the desktop Tauri webview the API is at localhost:3030; when the app is served
// over LAN to a phone/tablet it is same-origin, so the base URL is empty.

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const API_BASE = isTauri ? "http://localhost:3030" : "";

export class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
        this.name = "ApiError";
    }
}

let authToken: string | null = null;
export function setAuthToken(token: string | null) {
    authToken = token;
}

// Called when any request comes back 401 (e.g. a session expired or the server
// restarted and dropped its in-memory sessions). The auth store registers a logout.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
    onUnauthorized = fn;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

    const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
        onUnauthorized?.();
    }
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new ApiError(res.status, text || res.statusText);
    }

    if (res.status === 204) return undefined as T;
    const contentType = res.headers.get("content-type") ?? "";
    return (contentType.includes("application/json") ? await res.json() : await res.text()) as T;
}

export const api = {
    get: <T>(path: string) => request<T>("GET", path),
    post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
    put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
    del: <T>(path: string) => request<T>("DELETE", path),
};
