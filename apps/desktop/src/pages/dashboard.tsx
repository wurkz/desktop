import { useEffect } from "react";
import { useAuthStore } from "../stores/auth";
import { useAppConfigStore } from "../stores/app-config";
import { Button, ThemeSwitcher } from "@zorviz/ui";
import { useNavigate } from "react-router-dom";
import { ServerStatus } from "../components/server-status";
import { Wrench, Package, Settings, ChevronRight, Car, ClipboardList, TrendingUp } from "lucide-react";

export default function DashboardPage() {
    const { user, logout } = useAuthStore();
    const { config, fetchConfig } = useAppConfigStore();
    const navigate = useNavigate();

    useEffect(() => {
        fetchConfig();
    }, [fetchConfig]);

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    const modules = [
        {
            title: "Repair Shop",
            description: "Manage assets, jobs, and estimates",
            icon: Wrench,
            href: "/repair",
            color: "from-blue-500 to-blue-600",
        },
        {
            title: "My Jobs",
            description: "Jobs assigned to you",
            icon: ClipboardList,
            href: "/jobs",
            color: "from-amber-500 to-amber-600",
        },
        {
            title: "Inventory",
            description: "Track parts and stock levels",
            icon: Package,
            href: "/inventory",
            color: "from-emerald-500 to-emerald-600",
            disabled: true,
        },
        {
            title: "Settings",
            description: "Configure app preferences",
            icon: Settings,
            href: "/settings",
            color: "from-slate-500 to-slate-600",
            disabled: true,
        },
    ];

    return (
        <div className="min-h-screen bg-background">
            <header className="border-b p-4 flex items-center justify-between bg-card/50 backdrop-blur-sm">
                <div className="flex items-center gap-4">
                    <h1 className="font-bold text-xl bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">{config?.shop_name || "Zorviz"}</h1>
                    <ServerStatus />
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">{user?.name} ({user?.role})</span>
                    <Button variant="outline" size="sm" onClick={handleLogout}>Logout</Button>
                </div>
            </header>
            <main className="p-8 space-y-8">
                <div>
                    <h2 className="text-3xl font-bold">Welcome back, {user?.name || 'User'}</h2>
                    <p className="text-muted-foreground mt-1">Here's what's happening today</p>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="p-5 border rounded-xl bg-card shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                                <Car className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Active Jobs</p>
                                <p className="text-2xl font-bold">12</p>
                            </div>
                        </div>
                    </div>
                    <div className="p-5 border rounded-xl bg-card shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                                <ClipboardList className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Pending Estimates</p>
                                <p className="text-2xl font-bold">5</p>
                            </div>
                        </div>
                    </div>
                    <div className="p-5 border rounded-xl bg-card shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                                <Package className="w-5 h-5 text-red-600 dark:text-red-400" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Low Stock</p>
                                <p className="text-2xl font-bold text-destructive">3</p>
                            </div>
                        </div>
                    </div>
                    <div className="p-5 border rounded-xl bg-card shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                                <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">This Month</p>
                                <p className="text-2xl font-bold">{config?.currency_symbol || '$'}24.5k</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Module Navigation */}
                <div>
                    <h3 className="text-lg font-semibold mb-4">Quick Access</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {modules.map((module) => (
                            <button
                                key={module.title}
                                onClick={() => !module.disabled && navigate(module.href)}
                                disabled={module.disabled}
                                className={`group p-6 border rounded-xl bg-card text-left transition-all hover:shadow-lg hover:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:border-border`}
                            >
                                <div className="flex items-start justify-between">
                                    <div className={`p-3 rounded-xl bg-gradient-to-br ${module.color} text-white shadow-lg`}>
                                        <module.icon className="w-6 h-6" />
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                                </div>
                                <h4 className="font-semibold text-lg mt-4">{module.title}</h4>
                                <p className="text-sm text-muted-foreground mt-1">{module.description}</p>
                                {module.disabled && (
                                    <span className="inline-block mt-2 text-xs px-2 py-1 bg-muted rounded-full">Coming Soon</span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Theme Switcher */}
                <div className="border rounded-xl p-6 bg-card max-w-sm">
                    <h3 className="font-semibold mb-4">Appearance</h3>
                    <ThemeSwitcher />
                </div>
            </main>
        </div>
    );
}
