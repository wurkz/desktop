// Role display labels. The role KEY ('mechanic' etc.) is stable in the DB/API; only the
// label shown in the UI is configurable — a shop can call its mechanics "Technicians",
// "Agents", "Workers", ... (Settings → mechanic role name; null → "Mechanic").
import { useAppConfigStore } from "../stores/app-config";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function roleLabel(role: string, mechanicLabel?: string | null): string {
    if (role === "mechanic") return mechanicLabel?.trim() || "Mechanic";
    return cap(role);
}

// Hook form: returns a (role) => label function bound to the current config.
export function useRoleLabel(): (role: string) => string {
    const mechanicLabel = useAppConfigStore((s) => s.config?.mechanic_label);
    return (role: string) => roleLabel(role, mechanicLabel);
}
