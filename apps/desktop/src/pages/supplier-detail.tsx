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
import { ArrowLeft, Pencil } from "lucide-react";
import { formatMoney } from "@zorviz/core";
import { supplierDetail, updateSupplier, type SupplierDetail } from "../lib/parties-api";
import { ApiError } from "../lib/api";
import { useAppConfigStore } from "../stores/app-config";
import { toast } from "../stores/toast";
import { useSmartBack } from "../lib/use-smart-back";

// Supplier profile: contact + notes, what's owed (with Settle), and the receive history.
export default function SupplierDetailPage() {
    const navigate = useNavigate();
    const goBack = useSmartBack("/suppliers"); // deep-link fallback: the directory
    const { id } = useParams<{ id: string }>();
    const currency = useAppConfigStore((s) => s.config?.currency_symbol ?? "");

    const [data, setData] = useState<SupplierDetail | null>(null);
    const [editOpen, setEditOpen] = useState(false);
    const [form, setForm] = useState({ name: "", contact_person: "", phone: "", address: "", notes: "" });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const refresh = useCallback(() => {
        if (id) supplierDetail(id).then(setData).catch(() => toast("Couldn't load the supplier.", "error"));
    }, [id]);
    useEffect(() => refresh(), [refresh]);

    if (!data) {
        return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Loading…</div>;
    }
    const s = data.supplier;
    const open = data.receives.filter((r) => r.balance > 0);
    const history = data.receives.filter((r) => r.balance === 0);

    const openEdit = () => {
        setForm({
            name: s.name,
            contact_person: s.contact_person ?? "",
            phone: s.phone ?? "",
            address: s.address ?? "",
            notes: s.notes ?? "",
        });
        setError("");
        setEditOpen(true);
    };

    const saveEdit = async () => {
        setSaving(true);
        setError("");
        try {
            await updateSupplier(s.id, {
                name: form.name,
                contact_person: form.contact_person || null,
                phone: form.phone || null,
                address: form.address || null,
                notes: form.notes || null,
            });
            setEditOpen(false);
            refresh();
        } catch (e) {
            setError(e instanceof ApiError && e.message ? e.message : "Could not save the supplier.");
        } finally {
            setSaving(false);
        }
    };

    const settle = (receiveId: string) => {
        navigate("/expenses", { state: { settlePayableId: receiveId } });
    };

    return (
        <div className="min-h-screen bg-background">
            <header className="px-4 py-3 bg-card shadow-sm flex items-center gap-3">
                <button onClick={goBack} className="p-2 -ml-2 rounded-lg hover:bg-muted" aria-label="Back">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <h1 className="text-lg font-bold flex-1 min-w-0 truncate">{s.name}</h1>
                <Button size="sm" variant="outline" onClick={openEdit}>
                    <Pencil className="w-4 h-4 mr-1" /> Edit
                </Button>
            </header>

            <main className="p-4 max-w-2xl mx-auto space-y-4">
                <div className="border rounded-xl bg-card p-4 text-sm space-y-1">
                    <div className="text-muted-foreground">
                        {s.contact_person ?? "no contact person"}{s.phone ? ` · ${s.phone}` : ""}
                    </div>
                    {s.address && <div className="text-muted-foreground">{s.address}</div>}
                    {s.notes && <div className="mt-2 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 px-3 py-2 text-xs">{s.notes}</div>}
                </div>

                <div className="border rounded-xl bg-card p-4">
                    <div className="text-xs text-muted-foreground">Outstanding — we owe</div>
                    <div className={`text-xl font-bold tabular-nums ${data.owed > 0 ? "text-destructive" : ""}`}>
                        {formatMoney(data.owed, currency)}
                    </div>
                </div>

                {open.length > 0 && (
                    <div className="border rounded-xl bg-card p-4 space-y-1">
                        <h3 className="text-sm font-semibold mb-2">Open payables</h3>
                        {open.map((r) => (
                            <div key={r.id} className="flex items-center gap-3 py-2 border-t border-border/50 first:border-t-0 text-sm">
                                <div className="min-w-0 flex-1">
                                    <div className="truncate">{r.item_name} <span className="text-muted-foreground">({r.sku}) × {r.delta}</span></div>
                                    <div className="text-xs text-muted-foreground">
                                        {new Date(r.created_at).toLocaleDateString()}
                                        {r.paid > 0 ? ` · partially paid — ${formatMoney(r.paid, currency)} of ${formatMoney(r.total_cost ?? 0, currency)}` : ""}
                                    </div>
                                </div>
                                <span className="tabular-nums shrink-0 font-medium">{formatMoney(r.balance, currency)}</span>
                                <Button size="sm" variant="outline" className="shrink-0" onClick={() => settle(r.id)}>Settle</Button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="border rounded-xl bg-card p-4 space-y-1">
                    <h3 className="text-sm font-semibold mb-2">Receive history</h3>
                    {history.length === 0 && <p className="text-sm text-muted-foreground">Nothing received (or everything is still open above).</p>}
                    {history.map((r) => (
                        <div key={r.id} className="flex items-center gap-3 py-2 border-t border-border/50 first:border-t-0 text-sm">
                            <div className="min-w-0 flex-1">
                                <div className="truncate">{r.item_name} <span className="text-muted-foreground">({r.sku}) × {r.delta}</span></div>
                                <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}{r.note ? ` · ${r.note}` : ""}</div>
                            </div>
                            <span className="tabular-nums shrink-0 text-muted-foreground">
                                {r.total_cost != null ? formatMoney(r.total_cost, currency) : "—"}
                            </span>
                        </div>
                    ))}
                </div>
            </main>

            <Dialog open={editOpen} onOpenChange={(o) => { if (!saving) setEditOpen(o); }}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Edit supplier</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        {([
                            ["name", "Name"],
                            ["contact_person", "Contact person"],
                            ["phone", "Phone"],
                            ["address", "Address"],
                            ["notes", "Notes"],
                        ] as const).map(([k, label]) => (
                            <div key={k} className="space-y-1">
                                <Label htmlFor={`supd-${k}`}>{label}</Label>
                                <Input id={`supd-${k}`} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
                            </div>
                        ))}
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
