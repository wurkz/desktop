import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { useCloudSyncStore } from "../stores/cloud-sync";
import { useAppConfigStore } from "../stores/app-config";

// Small cloud-link status pill (shown only when cloud sync is turned on), so a mistaken enable
// with no backend reads clearly as "can't reach cloud" rather than failing silently.
export function CloudStatus() {
    const status = useCloudSyncStore((s) => s.status);
    const detail = useCloudSyncStore((s) => s.detail);
    const enabled = useAppConfigStore((s) => s.config?.sync_enabled === 1);
    if (!enabled) return null;

    const view = {
        off: { text: "Cloud off", cls: "text-muted-foreground bg-muted border-border", Icon: CloudOff, spin: false },
        connecting: { text: "Cloud: connecting…", cls: "text-blue-600 bg-blue-500/10 border-blue-500/20", Icon: RefreshCw, spin: true },
        connected: { text: "Cloud: connected", cls: "text-green-600 bg-green-500/10 border-green-500/20", Icon: Cloud, spin: false },
        error: { text: `Cloud: ${detail || "not connected"}`, cls: "text-amber-600 bg-amber-500/10 border-amber-500/20", Icon: CloudOff, spin: false },
    }[status];

    return (
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${view.cls}`}>
            <view.Icon className={`w-3 h-3 ${view.spin ? "animate-spin" : ""}`} />
            <span>{view.text}</span>
        </div>
    );
}
