import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { ArrowLeft, Truck, ChevronRight, Plus, Upload } from "lucide-react";
import { formatMoney } from "@zorviz/core";
import { listSupplierRecords, createSupplier, importSuppliers, type SupplierRow, type SupplierImportResult } from "../lib/parties-api";
import { ImportResultDialog } from "../components/import-result-dialog";
import { ApiError } from "../lib/api";
import { parseCsv, pick } from "../lib/csv";
import { useAppConfigStore } from "../stores/app-config";
import { useAuthStore } from "../stores/auth";

// Supplier directory: who the shop buys from, with outstanding payables at a glance.
export default function SuppliersPage() {
    const navigate = useNavigate();
    const currency = useAppConfigStore((s) => s.config?.currency_symbol ?? "");
    const isAdmin = useAuthStore((s) => s.user?.role === "admin" || s.user?.role === "owner");
    const [rows, setRows] = useState<SupplierRow[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [addOpen, setAddOpen] = useState(false);
    const [form, setForm] = useState({ name: "", contact_person: "", phone: "", address: "", notes: "" });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const refresh = useCallback(() => {
        listSupplierRecords().then(setRows).catch(() => {}).finally(() => setLoaded(true));
    }, []);
    useEffect(() => refresh(), [refresh]);

    // Suppliers CSV import (mirrors the customers-page import). The skipped-rows result is
    // display-only — it lives in this state until the dialog closes.
    const csvInput = useRef<HTMLInputElement>(null);
    const [importResult, setImportResult] = useState<SupplierImportResult | null>(null);
    const [importError, setImportError] = useState("");
    const [importBusy, setImportBusy] = useState(false);

    const onCsvPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setImportBusy(true);
        setImportError("");
        try {
            const parsed = parseCsv(await file.text()).map((r) => ({
                name: pick(r, "name", "supplier", "supplier_name", "company"),
                contact_person: pick(r, "contact_person", "contact", "person") || undefined,
                phone: pick(r, "phone", "mobile", "contact_no", "phone_number") || undefined,
                address: pick(r, "address") || undefined,
                notes: pick(r, "notes", "note") || undefined,
            }));
            if (parsed.length === 0) {
                setImportError("No usable rows found. Expected a header row with at least a `name` column.");
                return;
            }
            setImportResult(await importSuppliers(parsed));
            refresh();
        } catch (err) {
            setImportError(err instanceof Error ? `Import failed: ${err.message}` : "Import failed.");
        } finally {
            setImportBusy(false);
        }
    };

    const openAdd = () => {
        setForm({ name: "", contact_person: "", phone: "", address: "", notes: "" });
        setError("");
        setAddOpen(true);
    };

    const save = async () => {
        setSaving(true);
        setError("");
        try {
            const s = await createSupplier({
                name: form.name,
                contact_person: form.contact_person || null,
                phone: form.phone || null,
                address: form.address || null,
                notes: form.notes || null,
            });
            setAddOpen(false);
            navigate(`/suppliers/${s.id}`);
        } catch (e) {
            setError(e instanceof ApiError && e.message ? e.message : "Could not create the supplier.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-background">
            <header className="px-4 py-3 bg-card shadow-sm flex items-center gap-3">
                <button onClick={() => navigate("/")} className="p-2 -ml-2 rounded-lg hover:bg-muted" aria-label="Back to dashboard">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <Truck className="w-5 h-5 text-primary" />
                <h1 className="text-lg font-bold flex-1">Suppliers</h1>
                {isAdmin && (
                    <>
                        <input ref={csvInput} type="file" accept=".csv,text/csv" className="hidden" onChange={onCsvPicked} />
                        <Button variant="outline" size="sm" disabled={importBusy} onClick={() => csvInput.current?.click()}>
                            <Upload className="w-4 h-4 mr-1.5" />
                            {importBusy ? "Importing…" : "Import CSV"}
                        </Button>
                    </>
                )}
                <Button size="sm" onClick={openAdd}>
                    <Plus className="w-4 h-4 mr-1" /> New
                </Button>
            </header>

            <main className="p-4 max-w-2xl mx-auto space-y-3">
                {importError && <p className="text-sm text-destructive">{importError}</p>}

                {loaded && rows.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">
                        No suppliers yet — add one here, or type a name when receiving stock and the record is created for you.
                    </p>
                )}

                <div className="border rounded-xl bg-card divide-y divide-border/60 overflow-hidden">
                    {rows.map((s) => (
                        <button
                            key={s.id}
                            onClick={() => navigate(`/suppliers/${s.id}`)}
                            className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="font-medium truncate">{s.name}</div>
                                <div className="text-xs text-muted-foreground truncate">
                                    {s.contact_person ?? s.phone ?? "no contact"}
                                    {s.last_receive_at ? ` · last receive ${new Date(s.last_receive_at).toLocaleDateString()}` : " · no receives yet"}
                                </div>
                            </div>
                            {s.owed > 0 && (
                                <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-destructive/10 text-destructive tabular-nums">
                                    owe {formatMoney(s.owed, currency)}
                                </span>
                            )}
                            <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
                        </button>
                    ))}
                </div>
            </main>

            <ImportResultDialog
                title="Supplier import"
                columns={[
                    { key: "name", label: "Name" },
                    { key: "contact_person", label: "Contact person" },
                    { key: "phone", label: "Phone" },
                    { key: "address", label: "Address" },
                    { key: "notes", label: "Notes" },
                    { key: "reason", label: "Reason" },
                ]}
                result={importResult}
                onClose={() => setImportResult(null)}
            />

            <Dialog open={addOpen} onOpenChange={(o) => { if (!saving) setAddOpen(o); }}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>New supplier</DialogTitle>
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
                                <Label htmlFor={`sup-${k}`}>{label}{k !== "name" && <span className="text-muted-foreground font-normal"> (optional)</span>}</Label>
                                <Input id={`sup-${k}`} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
                            </div>
                        ))}
                        {error && <p className="text-sm text-destructive">{error}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>Cancel</Button>
                        <Button onClick={save} disabled={saving || !form.name.trim()}>{saving ? "Saving…" : "Create"}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
