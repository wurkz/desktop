import { useEffect, useMemo, useRef, useState } from "react";
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
import { ArrowLeft, BookUser, ChevronRight, Download, Plus, Search, Upload } from "lucide-react";
import { formatMoney } from "@zorviz/core";
import { customerDirectory, type CustomerRow } from "../lib/parties-api";
import { createCustomer, importCustomers, type CustomerImportResult } from "../lib/customers-api";
import { ImportResultDialog } from "../components/import-result-dialog";
import { ApiError } from "../lib/api";
import { parseCsv, pick } from "../lib/csv";
import { useAppConfigStore } from "../stores/app-config";
import { useAuthStore } from "../stores/auth";

type SortKey = "name" | "newest" | "balance" | "lifetime";

const SORTS: Record<SortKey, (a: CustomerRow, b: CustomerRow) => number> = {
    name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    newest: (a, b) => b.created_at - a.created_at,
    balance: (a, b) => b.balance - a.balance,
    lifetime: (a, b) => b.lifetime_paid - a.lifetime_paid,
};

// Customer management page (BACK-3-020): search/sort/filter the directory, add customers
// directly, bulk CSV import with a skipped-duplicates report, CSV export. Tap → profile.
export default function CustomersPage() {
    const navigate = useNavigate();
    const currency = useAppConfigStore((s) => s.config?.currency_symbol ?? "");
    const isAdmin = useAuthStore((s) => s.user?.role === "admin" || s.user?.role === "owner");
    const [q, setQ] = useState("");
    const [rows, setRows] = useState<CustomerRow[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [refresh, setRefresh] = useState(0);
    const [sort, setSort] = useState<SortKey>("name");
    const [balanceOnly, setBalanceOnly] = useState(false);

    // CSV import — result (incl. the skipped rows) lives only in this state; closing discards it.
    const csvInput = useRef<HTMLInputElement>(null);
    const [importResult, setImportResult] = useState<CustomerImportResult | null>(null);
    const [importError, setImportError] = useState("");
    const [importBusy, setImportBusy] = useState(false);

    // New Customer dialog
    const [addOpen, setAddOpen] = useState(false);
    const [form, setForm] = useState({ name: "", phone: "", email: "", address: "" });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const t = setTimeout(() => {
            customerDirectory(q).then(setRows).catch(() => {}).finally(() => setLoaded(true));
        }, q ? 250 : 0);
        return () => clearTimeout(t);
    }, [q, refresh]);

    const visible = useMemo(() => {
        const filtered = balanceOnly ? rows.filter((r) => r.balance > 0) : rows;
        return [...filtered].sort(SORTS[sort]);
    }, [rows, sort, balanceOnly]);

    const onCsvPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setImportBusy(true);
        setImportError("");
        try {
            const parsed = parseCsv(await file.text()).map((r) => ({
                name: pick(r, "name", "customer", "customer_name", "full_name"),
                phone: pick(r, "phone", "mobile", "contact", "contact_no", "phone_number") || undefined,
                email: pick(r, "email", "e-mail") || undefined,
                address: pick(r, "address") || undefined,
            }));
            if (parsed.length === 0) {
                setImportError("No usable rows found. Expected a header row with at least a `name` column.");
                return;
            }
            setImportResult(await importCustomers(parsed));
            setRefresh((n) => n + 1);
        } catch (err) {
            setImportError(err instanceof Error ? `Import failed: ${err.message}` : "Import failed.");
        } finally {
            setImportBusy(false);
        }
    };

    const exportCsv = () => {
        const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
        const money = (cents: number) => (cents / 100).toFixed(2);
        const csv = [
            "name,phone,email,jobs,lifetime_paid,balance",
            ...visible.map((c) =>
                [esc(c.name), esc(c.phone ?? ""), esc(c.email ?? ""), String(c.jobs), money(c.lifetime_paid), money(c.balance)].join(",")
            ),
        ].join("\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = "customers.csv";
        a.click();
        URL.revokeObjectURL(url);
    };

    const openAdd = () => {
        setForm({ name: "", phone: "", email: "", address: "" });
        setError("");
        setAddOpen(true);
    };

    const save = async () => {
        setSaving(true);
        setError("");
        try {
            const c = await createCustomer({
                name: form.name.trim(),
                phone: form.phone.trim() || undefined,
                email: form.email.trim() || undefined,
                address: form.address.trim() || undefined,
            });
            setAddOpen(false);
            navigate(`/customers/${c.id}`);
        } catch (e) {
            setError(e instanceof ApiError && e.message ? e.message : "Could not create the customer.");
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
                <BookUser className="w-5 h-5 text-primary" />
                <h1 className="text-lg font-bold flex-1">Customers</h1>
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
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or phone…" className="pl-9" />
                </div>

                <div className="flex items-center gap-2 text-sm">
                    <select
                        value={sort}
                        onChange={(e) => setSort(e.target.value as SortKey)}
                        className="h-8 rounded-md border border-input bg-card px-2 text-sm"
                        aria-label="Sort customers"
                    >
                        <option value="name">Sort: Name</option>
                        <option value="newest">Sort: Newest</option>
                        <option value="balance">Sort: Highest balance</option>
                        <option value="lifetime">Sort: Lifetime paid</option>
                    </select>
                    <button
                        onClick={() => setBalanceOnly((v) => !v)}
                        className={`h-8 px-3 rounded-full border text-xs font-medium transition-colors ${
                            balanceOnly
                                ? "bg-destructive/10 text-destructive border-destructive/30"
                                : "bg-card text-muted-foreground border-input hover:bg-muted"
                        }`}
                    >
                        Has balance
                    </button>
                    <div className="flex-1" />
                    <Button variant="ghost" size="sm" onClick={exportCsv} disabled={visible.length === 0}>
                        <Download className="w-4 h-4 mr-1.5" /> Export CSV
                    </Button>
                </div>

                {importError && <p className="text-sm text-destructive">{importError}</p>}

                {loaded && visible.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">
                        {q || balanceOnly
                            ? "No customers match."
                            : "No customers yet — add one here, or they're created with their first job or booking."}
                    </p>
                )}

                <div className="border rounded-xl bg-card divide-y divide-border/60 overflow-hidden">
                    {visible.map((c) => (
                        <button
                            key={c.id}
                            onClick={() => navigate(`/customers/${c.id}`)}
                            className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="font-medium truncate">{c.name}</div>
                                <div className="text-xs text-muted-foreground truncate">
                                    {c.phone ?? "no phone"} · {c.jobs} job{c.jobs === 1 ? "" : "s"} · {formatMoney(c.lifetime_paid, currency)} lifetime
                                </div>
                            </div>
                            {c.balance > 0 && (
                                <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-destructive/10 text-destructive tabular-nums">
                                    owes {formatMoney(c.balance, currency)}
                                </span>
                            )}
                            <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
                        </button>
                    ))}
                </div>
            </main>

            <ImportResultDialog
                title="Customer import"
                columns={[
                    { key: "name", label: "Name" },
                    { key: "phone", label: "Phone" },
                    { key: "email", label: "Email" },
                    { key: "address", label: "Address" },
                    { key: "reason", label: "Reason" },
                ]}
                result={importResult}
                onClose={() => setImportResult(null)}
            />

            <Dialog open={addOpen} onOpenChange={(o) => { if (!saving) setAddOpen(o); }}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>New customer</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        {([
                            ["name", "Name"],
                            ["phone", "Phone"],
                            ["email", "Email"],
                            ["address", "Address"],
                        ] as const).map(([k, label]) => (
                            <div key={k} className="space-y-1">
                                <Label htmlFor={`cust-${k}`}>
                                    {label}
                                    {k !== "name" && <span className="text-muted-foreground font-normal"> (optional)</span>}
                                </Label>
                                <Input id={`cust-${k}`} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
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
