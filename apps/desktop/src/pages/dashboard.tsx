import { useEffect, useState } from "react";
import { useAuthStore } from "../stores/auth";
import { useAppConfigStore } from "../stores/app-config";
import { Button } from "@zorviz/ui";
import { useNavigate } from "react-router-dom";
import { formatMoney } from "@zorviz/core";
import { ServerStatus } from "../components/server-status";
import { CloudStatus } from "../components/cloud-status";
import { Wrench, Package, Settings, ChevronRight, Car, ClipboardList, TrendingUp, DatabaseBackup, Users, CalendarDays } from "lucide-react";
import { BackupDialog } from "../features/backup/BackupDialog";
import { api } from "../lib/api";
import { logoUrl } from "../lib/logo-api";
import { useRoleLabel } from "../lib/roles";

interface DashboardStats {
    active_jobs: number;
    pending_estimates: number;
    low_stock: number;
    month_revenue: number;
}

// Abbreviated money for the compact mobile KPI strip (e.g. ₱6.4k) so 4 cells fit ~360px.
function compactMoney(centavos: number, symbol: string): string {
    const n = Math.round(centavos) / 100;
    if (Math.abs(n) >= 1000) {
        const k = n / 1000;
        return `${symbol}${k.toFixed(k % 1 === 0 ? 0 : 1)}k`;
    }
    return `${symbol}${Math.round(n)}`;
}

type StatItem = {
    key: string;
    label: string;
    short: string;
    value: string;
    valueShort?: string;
    valueClass?: string;
    iconWrap: string;
    iconColor: string;
    Icon: typeof Car;
};

export default function DashboardPage() {
    const { user, logout } = useAuthStore();
    const { config, fetchConfig } = useAppConfigStore();
    const navigate = useNavigate();
    const roleLabel = useRoleLabel();
    const [backupOpen, setBackupOpen] = useState(false);
    const [stats, setStats] = useState<DashboardStats | null>(null);
    // Role gates (BACK-2-015): mechanics don't see financial revenue, the front-desk
    // Repair Shop entry point, or backup/restore (that's admin/advisor work).
    const isMechanic = user?.role === "mechanic";
    const isStaff = user?.role === "owner" || user?.role === "admin" || user?.role === "advisor";

    useEffect(() => {
        fetchConfig();
        api.get<DashboardStats>("/api/stats").then(setStats).catch(() => {});
    }, [fetchConfig]);

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    const modules = [
        ...(isStaff
            ? [{
                title: "Repair Shop",
                description: "Manage assets, jobs, and estimates",
                icon: Wrench,
                href: "/repair",
                color: "from-blue-500 to-blue-600",
            }]
            : []),
        ...(user?.role === "mechanic"
            ? [{
                title: "My Jobs",
                description: "Jobs assigned to you",
                icon: ClipboardList,
                href: "/jobs",
                color: "from-amber-500 to-amber-600",
            }]
            : []),
        ...(user?.role === "admin" || user?.role === "owner" || user?.role === "advisor"
            ? [{
                title: "Jobs",
                description: "All jobs & statuses",
                icon: ClipboardList,
                href: "/jobs",
                color: "from-amber-500 to-amber-600",
            }]
            : []),
        ...(user?.role === "admin" || user?.role === "owner" || user?.role === "advisor"
            ? [{
                title: "Bookings",
                description: "Call-aheads & schedule",
                icon: CalendarDays,
                href: "/bookings",
                color: "from-cyan-500 to-cyan-600",
            }]
            : []),
        ...(user?.role === "admin" || user?.role === "owner"
            ? [{
                title: "Staff",
                description: "Manage staff logins",
                icon: Users,
                href: "/users",
                color: "from-violet-500 to-violet-600",
            }]
            : []),
        ...(user?.role === "admin" || user?.role === "owner" || user?.role === "advisor"
            ? [{
                title: "Inventory",
                description: "Parts, stock levels & CSV import",
                icon: Package,
                href: "/inventory",
                color: "from-emerald-500 to-emerald-600",
            }]
            : []),
        {
            title: "Settings",
            description: "Shop profile, currency & tax",
            icon: Settings,
            href: "/settings",
            color: "from-slate-500 to-slate-600",
        },
    ];

    const currencySym = config?.currency_symbol ?? "";
    // KPI strip (BACK-2-019): one compact row on mobile, comfortable cards on desktop.
    // Degrades cleanly when a role sees fewer stats (mechanic has no revenue — BACK-2-015).
    const statItems: StatItem[] = [
        { key: "active", label: "Active Jobs", short: "Jobs", value: String(stats?.active_jobs ?? 0), iconWrap: "bg-blue-100 dark:bg-blue-900/30", iconColor: "text-blue-600 dark:text-blue-400", Icon: Car },
        { key: "pending", label: "Pending Estimates", short: "Estimates", value: String(stats?.pending_estimates ?? 0), iconWrap: "bg-amber-100 dark:bg-amber-900/30", iconColor: "text-amber-600 dark:text-amber-400", Icon: ClipboardList },
        { key: "low", label: "Low Stock", short: "Low Stock", value: String(stats?.low_stock ?? 0), valueClass: "text-destructive", iconWrap: "bg-red-100 dark:bg-red-900/30", iconColor: "text-red-600 dark:text-red-400", Icon: Package },
        ...(!isMechanic
            ? [{ key: "month", label: "This Month", short: "Month", value: formatMoney(stats?.month_revenue ?? 0, currencySym), valueShort: compactMoney(stats?.month_revenue ?? 0, currencySym), iconWrap: "bg-emerald-100 dark:bg-emerald-900/30", iconColor: "text-emerald-600 dark:text-emerald-400", Icon: TrendingUp }]
            : []),
    ];

    return (
        <div className="min-h-screen bg-background">
            <header className="border-b p-4 flex items-center justify-between bg-card/50 backdrop-blur-sm">
                <div className="flex items-center gap-4">
                    {config?.logo_path && (
                        <img src={logoUrl(config.updated_at)} alt="" className="h-8 max-w-[120px] object-contain" />
                    )}
                    <h1 className="font-bold text-xl bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">{config?.shop_name || "Zorviz"}</h1>
                    <ServerStatus />
                    <CloudStatus />
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">{user?.name} ({user ? roleLabel(user.role) : ""})</span>
                    <Button variant="outline" size="sm" onClick={handleLogout}>Logout</Button>
                </div>
            </header>
            <main className="p-4 sm:p-8 space-y-5 sm:space-y-8">
                <div>
                    <h2 className="text-2xl sm:text-3xl font-bold">Welcome back, {user?.name || 'User'}</h2>
                    <p className="text-sm sm:text-base text-muted-foreground mt-1">Here's what's happening today</p>
                </div>

                {/* Stats Cards — compact one-row strip on mobile (BACK-2-019) */}
                <div className={`grid gap-2 sm:gap-4 ${isMechanic ? "grid-cols-3" : "grid-cols-4"}`}>
                    {statItems.map(({ key, label, short, value, valueShort, valueClass, iconWrap, iconColor, Icon }) => (
                        <div key={key} className="p-2.5 sm:p-5 border rounded-xl bg-card shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-3 text-center sm:text-left">
                                <div className={`p-1.5 sm:p-2 rounded-lg shrink-0 ${iconWrap}`}>
                                    <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${iconColor}`} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[10px] leading-tight sm:text-sm text-muted-foreground truncate">
                                        <span className="sm:hidden">{short}</span>
                                        <span className="hidden sm:inline">{label}</span>
                                    </p>
                                    <p className={`text-base sm:text-2xl font-bold ${valueClass ?? ""}`}>
                                        {valueShort ? (
                                            <>
                                                <span className="sm:hidden">{valueShort}</span>
                                                <span className="hidden sm:inline">{value}</span>
                                            </>
                                        ) : (
                                            value
                                        )}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Module Navigation */}
                <div>
                    <h3 className="text-lg font-semibold mb-4">Quick Access</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {modules.map((module) => (
                            <button
                                key={module.title}
                                onClick={() => navigate(module.href)}
                                className="group p-6 border rounded-xl bg-card text-left transition-all hover:shadow-lg hover:border-primary/50"
                            >
                                <div className="flex items-start justify-between">
                                    <div className={`p-3 rounded-xl bg-gradient-to-br ${module.color} text-white shadow-lg`}>
                                        <module.icon className="w-6 h-6" />
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                                </div>
                                <h4 className="font-semibold text-lg mt-4">{module.title}</h4>
                                <p className="text-sm text-muted-foreground mt-1">{module.description}</p>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Data (backup). Appearance/theme moved to Settings — BACK-2-018. */}
                {isStaff && (
                    <div className="border rounded-xl p-6 bg-card max-w-sm">
                        <h3 className="font-semibold mb-2">Data</h3>
                        <p className="text-sm text-muted-foreground mb-4">Back up your shop's data or restore from a backup.</p>
                        <Button variant="outline" onClick={() => setBackupOpen(true)}>
                            <DatabaseBackup className="w-4 h-4 mr-2" /> Backup &amp; Restore
                        </Button>
                    </div>
                )}
            </main>

            <BackupDialog open={backupOpen} onOpenChange={setBackupOpen} />
        </div>
    );
}
