import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, CardContent } from "@zorviz/ui";
import { ArrowLeft, FileBarChart, FileText } from "lucide-react";
import { financialSummary, seniorPwdReport, mechanicReport } from "../lib/reports-api";
import { listPayables } from "../lib/inventory-api";
import { pnlPdf, vatSummaryPdf, seniorPwdPdf, mechanicsPdf, payablesPdf } from "../lib/report-pdf";
import { useAppConfigStore } from "../stores/app-config";
import { useAuthStore } from "../stores/auth";
import { toast } from "../stores/toast";

// BACK-3-018 Tier 2: owner/compliance reports, one tap each over a shared period picker.
type Preset = "today" | "week" | "month" | "all" | "custom";
const PRESETS: { key: Preset; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "all", label: "All time" },
    { key: "custom", label: "Custom" },
];

function startOfDay(d: Date): number {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function resolveRange(preset: Preset, fromStr: string, toStr: string): [number, number] {
    const now = new Date();
    const dayMs = 86400000;
    switch (preset) {
        case "today":
            return [startOfDay(now), Date.now()];
        case "week": {
            const dow = (now.getDay() + 6) % 7; // Monday-based
            return [startOfDay(now) - dow * dayMs, Date.now()];
        }
        case "month":
            return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), Date.now()];
        case "all":
            return [0, Date.now()];
        case "custom": {
            const f = fromStr ? new Date(fromStr).getTime() : 0;
            const t = toStr ? new Date(toStr).getTime() + dayMs - 1 : Date.now();
            return [f, t];
        }
    }
}

export default function ReportsPage() {
    const navigate = useNavigate();
    const config = useAppConfigStore((s) => s.config);
    const userName = useAuthStore((s) => s.user?.name ?? null);

    const [preset, setPreset] = useState<Preset>("month");
    const [fromStr, setFromStr] = useState("");
    const [toStr, setToStr] = useState("");
    const [busy, setBusy] = useState<string | null>(null);

    const periodLabel = () => {
        const [f, t] = resolveRange(preset, fromStr, toStr);
        return `${f === 0 ? "All time" : new Date(f).toLocaleDateString()} — ${new Date(t).toLocaleDateString()}`;
    };

    const run = async (key: string, fn: (from: number, to: number, period: string) => Promise<string>) => {
        setBusy(key);
        try {
            const [f, t] = resolveRange(preset, fromStr, toStr);
            const file = await fn(f, t, periodLabel());
            toast(`Saved to Downloads · ${file}`, "success");
        } catch (e) {
            console.error(e);
            toast("Couldn't generate the report.", "error");
        } finally {
            setBusy(null);
        }
    };

    const REPORTS: { key: string; title: string; desc: string; run: () => void; periodless?: boolean }[] = [
        {
            key: "pnl",
            title: "Profit & Loss Summary",
            desc: "Collections, expenses by category, gross margin, and the net result.",
            run: () => void run("pnl", async (f, t, p) => pnlPdf(await financialSummary(f, t), p, config, userName)),
        },
        {
            key: "vat",
            title: "VAT Summary",
            desc: "VAT collected (pro-rata per payment), VAT-exempt collections — the BIR set-aside.",
            run: () => void run("vat", async (f, t, p) => vatSummaryPdf(await financialSummary(f, t), p, config, userName)),
        },
        {
            key: "senior",
            title: "Senior / PWD Discount Record",
            desc: "BIR-style record of Senior/PWD-discounted sales with ID numbers and discounts.",
            run: () => void run("senior", async (f, t, p) => seniorPwdPdf(await seniorPwdReport(f, t), p, config, userName)),
        },
        {
            key: "mechanics",
            title: "Mechanic Productivity",
            desc: "Jobs completed, average and total wrench time, and job value per mechanic.",
            run: () => void run("mechanics", async (f, t, p) => mechanicsPdf(await mechanicReport(f, t), p, config, userName)),
        },
        {
            key: "payables",
            title: "Supplier Payables",
            desc: "Outstanding on-account stock receives — what the shop currently owes suppliers.",
            periodless: true,
            run: () => void run("payables", async () => payablesPdf(await listPayables(), config, userName)),
        },
    ];

    return (
        <div className="min-h-screen bg-background">
            <header className="px-4 py-3 bg-card shadow-sm flex items-center gap-3">
                <button onClick={() => navigate("/")} className="p-2 -ml-2 rounded-lg hover:bg-muted">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <FileBarChart className="w-5 h-5 text-primary" />
                <h1 className="text-lg font-bold">Reports</h1>
            </header>

            <main className="p-4 max-w-md mx-auto space-y-3">
                <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                        {PRESETS.map((p) => (
                            <button
                                key={p.key}
                                onClick={() => setPreset(p.key)}
                                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                                    preset === p.key ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                    {preset === "custom" && (
                        <div className="flex items-center gap-2 text-xs">
                            <input type="date" value={fromStr} max={toStr || undefined} onChange={(e) => setFromStr(e.target.value)} className="flex-1 rounded-md border px-2 py-1 bg-background" aria-label="From date" />
                            <span className="text-muted-foreground">to</span>
                            <input type="date" value={toStr} min={fromStr || undefined} onChange={(e) => setToStr(e.target.value)} className="flex-1 rounded-md border px-2 py-1 bg-background" aria-label="To date" />
                        </div>
                    )}
                    <p className="text-xs text-muted-foreground">Period: {periodLabel()}</p>
                </div>

                {REPORTS.map((rep) => (
                    <Card key={rep.key}>
                        <CardContent className="p-4 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="font-medium">{rep.title}</div>
                                <div className="text-sm text-muted-foreground">{rep.desc}</div>
                                {rep.periodless && <div className="text-xs text-muted-foreground mt-0.5">As of now (ignores the period).</div>}
                            </div>
                            <Button size="sm" variant="outline" className="shrink-0" disabled={busy !== null} onClick={rep.run}>
                                <FileText className="w-4 h-4 mr-1" /> {busy === rep.key ? "…" : "PDF"}
                            </Button>
                        </CardContent>
                    </Card>
                ))}
            </main>
        </div>
    );
}
