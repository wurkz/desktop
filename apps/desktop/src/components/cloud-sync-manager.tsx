import { useEffect } from "react";
import { useAppConfigStore } from "../stores/app-config";
import { useCloudSyncStore } from "../stores/cloud-sync";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const HEALTHY_INTERVAL = 60_000; // recheck a good connection every 60s
const TIMEOUT = 8_000;

// BACK-4 prep: cloud-link lifecycle. Activates ONLY when sync is enabled and a URL + token are set;
// otherwise it's completely idle. It polls the backend's /health with the device token and reports
// status. Every failure mode (no backend, unreachable, timeout, bad token) is caught and backed off
// — it NEVER throws, blocks, or affects local operation. The actual push/pull is a guarded stub:
// it only runs once connected (which can't happen until the backend exists), so a mistaken "enable"
// with no backend simply shows "can't reach cloud" and changes nothing else. Renders nothing.
export function CloudSyncManager() {
    const config = useAppConfigStore((s) => s.config);
    const setStatus = useCloudSyncStore((s) => s.set);

    const enabled = config?.sync_enabled === 1;
    const url = (config?.cloud_url ?? "").trim();
    const token = (config?.device_token ?? "").trim();

    useEffect(() => {
        // Inactive unless fully configured on the desktop app.
        if (!isTauri || !enabled) {
            setStatus("off");
            return;
        }
        if (!url || !token) {
            setStatus("error", !url ? "No backend URL set" : "No device token set");
            return;
        }

        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let failures = 0;
        const base = url.replace(/\/+$/, "");

        const check = async () => {
            if (cancelled) return;
            setStatus("connecting");
            const ctrl = new AbortController();
            const to = setTimeout(() => ctrl.abort(), TIMEOUT);
            try {
                const res = await fetch(`${base}/health`, {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: ctrl.signal,
                });
                if (cancelled) return;
                if (res.ok) {
                    failures = 0;
                    setStatus("connected", "Cloud reachable");
                    // TODO(backend): once connected, run the sync engine push/pull here.
                    // Parked until the cloud API exists so we don't lock in a wire format.
                } else if (res.status === 401 || res.status === 403) {
                    failures++;
                    setStatus("error", "Device token rejected");
                } else {
                    failures++;
                    setStatus("error", `Backend error (${res.status})`);
                }
            } catch {
                if (cancelled) return;
                failures++;
                setStatus("error", "Can't reach cloud backend");
            } finally {
                clearTimeout(to);
                if (!cancelled) {
                    // Backoff on failure (30s → capped ~5min) so a mistaken enable never hammers.
                    const delay =
                        failures === 0
                            ? HEALTHY_INTERVAL
                            : Math.min(30_000 * 2 ** Math.min(failures - 1, 4), 300_000);
                    timer = setTimeout(check, delay);
                }
            }
        };

        check();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [enabled, url, token, setStatus]);

    return null;
}
