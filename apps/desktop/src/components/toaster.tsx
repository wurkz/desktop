import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { useToastStore } from "../stores/toast";

// App-wide toast stack. Mounted once in App; fed via the `toast()` helper / toast store.
export function Toaster() {
    const toasts = useToastStore((s) => s.toasts);
    const dismiss = useToastStore((s) => s.dismiss);
    if (toasts.length === 0) return null;

    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm">
            {toasts.map((t) => {
                const Icon = t.variant === "error" ? AlertCircle : t.variant === "success" ? CheckCircle2 : Info;
                const color = t.variant === "error" ? "text-destructive" : t.variant === "success" ? "text-green-600 dark:text-green-400" : "text-primary";
                const tint =
                    t.variant === "error"
                        ? "bg-red-50 dark:bg-red-950/70 border-destructive/40"
                        : t.variant === "success"
                          ? "bg-green-50 dark:bg-green-950/70 border-green-500/40"
                          : "bg-primary/5 dark:bg-primary/10 border-primary/40";
                return (
                    <div
                        key={t.id}
                        role="status"
                        className={`flex items-start gap-2 rounded-lg border shadow-lg p-3 text-sm ${tint}`}
                    >
                        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
                        <span className="flex-1 break-words">{t.message}</span>
                        <button onClick={() => dismiss(t.id)} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
