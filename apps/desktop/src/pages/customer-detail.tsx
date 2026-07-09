import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    Button,
    Input,
    Label,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@zorviz/ui";
import { ArrowLeft, Pencil, FileText, Car } from "lucide-react";
import { formatMoney } from "@zorviz/core";
import {
    customerDetail,
    updateCustomer,
    type CustomerDetail,
    type CustomerAsset,
} from "../lib/parties-api";
import { soaData } from "../lib/reports-api";
import { soaPdf } from "../lib/report-pdf";
import { StatusBadge } from "../components/status-badge";
import { useAppConfigStore } from "../stores/app-config";
import { useAuthStore } from "../stores/auth";
import { toast } from "../stores/toast";
import { useSmartBack } from "../lib/use-smart-back";

// Customer profile: contact + notes, their assets, every job with its balance — the
// collection cockpit. Collect = open the job ticket's Billing card.
function assetLabel(a: CustomerAsset): string {
    try {
        const s = JSON.parse(a.specs) as Record<string, string>;
        return s.plateNumber || s.serialNumber || s.imei || [s.make, s.model].filter(Boolean).join(" ") || a.type;
    } catch {
        return a.type;
    }
}

export default function CustomerDetailPage() {
    const navigate = useNavigate();
    const goBack = useSmartBack("/customers"); // deep-link fallback: the directory
    const { id } = useParams<{ id: string }>();
    const currency = useAppConfigStore((s) => s.config?.currency_symbol ?? "");
    const config = useAppConfigStore((s) => s.config);
    const userName = useAuthStore((s) => s.user?.name ?? null);

    const [data, setData] = useState<CustomerDetail | null>(null);
    const [editOpen, setEditOpen] = useState(false);
    const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", notes: "" });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const refresh = useCallback(() => {
        if (id) customerDetail(id).then(setData).catch(() => toast("Couldn't load the customer.", "error"));
    }, [id]);
    useEffect(() => refresh(), [refresh]);

    if (!data) {
        return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Loading…</div>;
    }
    const c = data.customer;

    const openEdit = () => {
        setForm({
            name: c.name,
            phone: c.phone ?? "",
            email: c.email ?? "",
            address: c.address ?? "",
            notes: c.notes ?? "",
        });
        setError("");
        setEditOpen(true);
    };

    const saveEdit = async () => {
        setSaving(true);
        setError("");
        try {
            await updateCustomer(c.id, {
                name: form.name,
                phone: form.phone || null,
                email: form.email || null,
                address: form.address || null,
                notes: form.notes || null,
            });
            setEditOpen(false);
            refresh();
        } catch {
            setError("Could not save the customer.");
        } finally {
            setSaving(false);
        }
    };

    const downloadSoa = async () => {
        try {
            const file = soaPdf(await soaData(c.id), config, userName);
            toast(`Saved to Downloads · ${file}`, "success");
        } catch {
            toast("Couldn't generate the SOA.", "error");
        }
    };

    return (
        <div className="min-h-screen bg-background">
            <header className="px-4 py-3 bg-card shadow-sm flex items-center gap-3">
                <button onClick={goBack} className="p-2 -ml-2 rounded-lg hover:bg-muted" aria-label="Back">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <h1 className="text-lg font-bold flex-1 min-w-0 truncate">{c.name}</h1>
                <Button size="sm" variant="outline" onClick={openEdit}>
                    <Pencil className="w-4 h-4 mr-1" /> Edit
                </Button>
            </header>

            <main className="p-4 max-w-2xl mx-auto space-y-4">
                {/* Contact + notes */}
                <div className="border rounded-xl bg-card p-4 text-sm space-y-1">
                    <div className="text-muted-foreground">
                        {c.phone ?? "no phone"}{c.email ? ` · ${c.email}` : ""}
                    </div>
                    {c.address && <div className="text-muted-foreground">{c.address}</div>}
                    {c.notes && <div className="mt-2 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 px-3 py-2 text-xs">{c.notes}</div>}
                </div>

                {/* Money strip */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="border rounded-xl bg-card p-4">
                        <div className="text-xs text-muted-foreground">Open balance</div>
                        <div className={`text-xl font-bold tabular-nums ${data.balance > 0 ? "text-destructive" : ""}`}>
                            {formatMoney(data.balance, currency)}
                        </div>
                        {data.balance > 0 && (
                            <Button size="sm" variant="outline" className="mt-2" onClick={() => void downloadSoa()}>
                                <FileText className="w-4 h-4 mr-1" /> SOA
                            </Button>
                        )}
                    </div>
                    <div className="border rounded-xl bg-card p-4">
                        <div className="text-xs text-muted-foreground">Lifetime paid</div>
                        <div className="text-xl font-bold tabular-nums">{formatMoney(data.lifetime_paid, currency)}</div>
                        <div className="text-xs text-muted-foreground mt-1">{data.jobs.length} job{data.jobs.length === 1 ? "" : "s"}</div>
                    </div>
                </div>

                {/* Assets */}
                {data.assets.length > 0 && (
                    <div className="border rounded-xl bg-card p-4 space-y-2">
                        <h3 className="text-sm font-semibold">Assets</h3>
                        <div className="flex flex-wrap gap-2">
                            {data.assets.map((a) => (
                                <button
                                    key={a.id}
                                    onClick={() => navigate(`/repair/asset/${a.id}`)}
                                    className="flex items-center gap-1.5 text-sm border rounded-full px-3 py-1 hover:bg-muted transition-colors"
                                >
                                    <Car className="w-3.5 h-3.5 text-muted-foreground" /> {assetLabel(a)}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Jobs, balances, and the collect action */}
                <div className="border rounded-xl bg-card p-4 space-y-1">
                    <h3 className="text-sm font-semibold mb-2">Jobs</h3>
                    {data.jobs.length === 0 && <p className="text-sm text-muted-foreground">No jobs yet.</p>}
                    {data.jobs.map((j) => (
                        <div key={j.id} className="flex items-center gap-3 py-2 border-t border-border/50 first:border-t-0 text-sm">
                            <button onClick={() => navigate(`/repair/ticket/${j.id}`)} className="min-w-0 flex-1 text-left group">
                                <div className="font-medium truncate group-hover:text-primary transition-colors">
                                    {j.job_order_no ?? j.receipt_number ?? j.id.slice(0, 8)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    {new Date(j.created_at).toLocaleDateString()} · {formatMoney(j.total, currency)}
                                </div>
                            </button>
                            <StatusBadge status={j.status as Parameters<typeof StatusBadge>[0]["status"]} />
                            {j.balance > 0 ? (
                                <Button size="sm" variant="outline" className="shrink-0" onClick={() => navigate(`/repair/ticket/${j.id}`)}>
                                    Collect {formatMoney(j.balance, currency)}
                                </Button>
                            ) : (
                                j.status === "done" && <span className="text-xs text-muted-foreground shrink-0">paid</span>
                            )}
                        </div>
                    ))}
                </div>
            </main>

            <Dialog open={editOpen} onOpenChange={(o) => { if (!saving) setEditOpen(o); }}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Edit customer</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        {([
                            ["name", "Name"],
                            ["phone", "Phone"],
                            ["email", "Email"],
                            ["address", "Address"],
                        ] as const).map(([k, label]) => (
                            <div key={k} className="space-y-1">
                                <Label htmlFor={`cust-${k}`}>{label}</Label>
                                <Input id={`cust-${k}`} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
                            </div>
                        ))}
                        <div className="space-y-1">
                            <Label htmlFor="cust-notes">Notes <span className="text-muted-foreground font-normal">(staff only)</span></Label>
                            <Input id="cust-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="e.g. prefers GCash, warranty case pending" />
                        </div>
                        {error && <p className="text-sm text-destructive">{error}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</Button>
                        <Button onClick={saveEdit} disabled={saving || !form.name.trim()}>{saving ? "Saving…" : "Save"}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
