import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, CardContent } from "@zorviz/ui";
import { ArrowLeft } from "lucide-react";
import { formatMoney } from "@zorviz/core";
import { listJobs, listAllJobs, type JobSummary } from "../lib/orders-api";
import type { OrderStatus } from "@zorviz/db";
import { StatusBadge } from "../components/status-badge";
import { useAuthStore } from "../stores/auth";
import { useAppConfigStore } from "../stores/app-config";

function jobLabel(job: JobSummary): string {
    const s = (job.asset?.specs ?? {}) as Record<string, string>;
    return s.plateNumber || s.serialNumber || s.imei || [s.make, s.model].filter(Boolean).join(" ") || "Asset";
}

function elapsed(ms: number): string {
    const mins = Math.floor((Date.now() - ms) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const h = Math.floor(mins / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

const STATUS_ORDER: OrderStatus[] = ["triage", "estimate", "approved", "in_progress", "done", "paid", "cancelled"];

type DatePreset = "today" | "week" | "month" | "all" | "custom";

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "all", label: "All" },
    { key: "custom", label: "Custom" },
];

// Local start-of-day (ms) for a Date.
function startOfDay(d: Date): number {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Parse a yyyy-mm-dd string as a local date; null if empty/invalid.
function parseDateInput(v: string): Date | null {
    if (!v) return null;
    const [y, m, d] = v.split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
}

// Resolve a preset (+ optional custom inputs) to an inclusive [from, to] ms range,
// or null for "no date filter" (All).
function resolveRange(preset: DatePreset, customFrom: string, customTo: string): [number, number] | null {
    const now = new Date();
    const dayMs = 86400000;
    switch (preset) {
        case "all":
            return null;
        case "today":
            return [startOfDay(now), startOfDay(now) + dayMs - 1];
        case "week": {
            // Calendar week starting Monday, through end of today.
            const dow = (now.getDay() + 6) % 7; // 0 = Monday
            return [startOfDay(now) - dow * dayMs, startOfDay(now) + dayMs - 1];
        }
        case "month": {
            const first = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
            return [first, startOfDay(now) + dayMs - 1];
        }
        case "custom": {
            const from = parseDateInput(customFrom);
            const to = parseDateInput(customTo);
            if (!from && !to) return null;
            const lo = from ? startOfDay(from) : 0;
            const hi = to ? startOfDay(to) + dayMs - 1 : Number.MAX_SAFE_INTEGER;
            return [lo, hi];
        }
    }
}

export default function JobsPage() {
    const navigate = useNavigate();
    const role = useAuthStore((s) => s.user?.role);
    const currency = useAppConfigStore((s) => s.config?.currency_symbol ?? "");
    // Mechanics see their own active queue ("My Jobs"); staff see every job ("Jobs").
    const mine = role === "mechanic";

    const [jobs, setJobs] = useState<JobSummary[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [filter, setFilter] = useState<OrderStatus | "all">("all");
    // Staff Jobs defaults to today only; the mechanic queue is never date-filtered.
    const [datePreset, setDatePreset] = useState<DatePreset>("today");
    const [customFrom, setCustomFrom] = useState("");
    const [customTo, setCustomTo] = useState("");

    // BACK-2-030: the staff view is windowed (newest 100 + Load more) — it grows forever.
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    useEffect(() => {
        (mine ? listJobs(true) : listAllJobs(100, 0))
            .then((rows) => { setJobs(rows); setHasMore(!mine && rows.length === 100); })
            .catch(() => {})
            .finally(() => setLoaded(true));
    }, [mine]);
    const loadMore = async () => {
        setLoadingMore(true);
        try {
            const rows = await listAllJobs(100, jobs.length);
            setJobs((j) => [...j, ...rows]);
            setHasMore(rows.length === 100);
        } catch {
            /* leave hasMore as-is; user can retry */
        } finally {
            setLoadingMore(false);
        }
    };

    // Status filter chips (staff view) — only statuses that are actually present.
    const presentStatuses = useMemo(() => STATUS_ORDER.filter((st) => jobs.some((j) => j.status === st)), [jobs]);

    // Date range applies to the staff view only (mechanics see their live work queue as-is).
    const dateRange = useMemo(
        () => (mine ? null : resolveRange(datePreset, customFrom, customTo)),
        [mine, datePreset, customFrom, customTo]
    );

    const shown = jobs.filter((j) => {
        if (filter !== "all" && j.status !== filter) return false;
        if (dateRange && (j.created_at < dateRange[0] || j.created_at > dateRange[1])) return false;
        return true;
    });

    return (
        <div className="min-h-screen bg-background">
            <header className="px-4 py-3 bg-card shadow-sm flex items-center gap-3">
                <button onClick={() => navigate("/")} className="p-2 -ml-2 rounded-lg hover:bg-muted">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <h1 className="text-lg font-bold">{mine ? "My Jobs" : "Jobs"}</h1>
            </header>

            <main className="p-4 max-w-md mx-auto space-y-3">
                {!mine && (
                    <div className="space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                            {DATE_PRESETS.map((p) => (
                                <button
                                    key={p.key}
                                    onClick={() => setDatePreset(p.key)}
                                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                                        datePreset === p.key
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "hover:bg-muted"
                                    }`}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                        {datePreset === "custom" && (
                            <div className="flex items-center gap-2 text-xs">
                                <input
                                    type="date"
                                    value={customFrom}
                                    max={customTo || undefined}
                                    onChange={(e) => setCustomFrom(e.target.value)}
                                    className="flex-1 rounded-md border px-2 py-1 bg-background"
                                    aria-label="From date"
                                />
                                <span className="text-muted-foreground">to</span>
                                <input
                                    type="date"
                                    value={customTo}
                                    min={customFrom || undefined}
                                    onChange={(e) => setCustomTo(e.target.value)}
                                    className="flex-1 rounded-md border px-2 py-1 bg-background"
                                    aria-label="To date"
                                />
                            </div>
                        )}
                    </div>
                )}
                {!mine && jobs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {(["all", ...presentStatuses] as const).map((st) => (
                            <button
                                key={st}
                                onClick={() => setFilter(st)}
                                className={`text-xs px-2.5 py-1 rounded-full border capitalize transition-colors ${
                                    filter === st ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
                                }`}
                            >
                                {st === "all" ? "All" : st.replace("_", " ")}
                            </button>
                        ))}
                    </div>
                )}

                {loaded && shown.length === 0 && (
                    <div className="text-center py-10 space-y-2">
                        <p className="text-muted-foreground">
                            {mine
                                ? "No jobs assigned to you."
                                : jobs.length === 0
                                  ? "No jobs yet."
                                  : "No jobs in this date range."}
                        </p>
                        {!mine && jobs.length > 0 && datePreset !== "all" && (
                            <button
                                onClick={() => setDatePreset("all")}
                                className="text-xs px-2.5 py-1 rounded-full border hover:bg-muted"
                            >
                                Show all dates
                            </button>
                        )}
                    </div>
                )}

                {shown.map((job) => (
                    <Card
                        key={job.id}
                        className="cursor-pointer active:scale-95 transition-transform"
                        onClick={() => navigate(`/repair/ticket/${job.id}`)}
                    >
                        <CardContent className="p-4 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold truncate">{jobLabel(job)}</span>
                                <StatusBadge status={job.status} />
                            </div>
                            {!mine && (job.customer || job.total > 0) && (
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground truncate">{job.customer?.name ?? "Walk-in"}</span>
                                    {job.total > 0 && <span>{formatMoney(job.total, currency)}</span>}
                                </div>
                            )}
                            <div className="text-sm text-muted-foreground line-clamp-2">
                                {job.customer_complaint || "No complaint recorded"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                                {mine ? elapsed(job.created_at) : new Date(job.created_at).toLocaleDateString()}
                                {job.receipt_number ? ` · ${job.receipt_number}` : ""}
                            </div>
                        </CardContent>
                    </Card>
                ))}
                {!mine && hasMore && (
                    <div className="flex justify-center pt-2">
                        <Button variant="outline" size="sm" onClick={() => void loadMore()} disabled={loadingMore}>
                            {loadingMore ? "Loading…" : "Load older jobs"}
                        </Button>
                    </div>
                )}
            </main>
        </div>
    );
}
