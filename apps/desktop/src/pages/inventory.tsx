import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Button,
    Input,
    Label,
    Card,
    CardContent,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@zorviz/ui";
import { ArrowLeft, Plus, Search, Upload, PackagePlus, Pencil, Trash2 } from "lucide-react";
import { formatMoney, toCentavos, fromCentavos } from "@zorviz/core";
import {
    listInventory,
    createInventory,
    updateInventory,
    deleteInventory,
    adjustStock,
    importInventory,
    type Part,
    type AdjustmentType,
} from "../lib/inventory-api";
import { parseCsv, pick } from "../lib/csv";
import { ApiError } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { useAppConfigStore } from "../stores/app-config";
import { useConfirm } from "../components/confirm";

// Margin % on cost: (price − cost) / cost. "—" when there's no cost to compare against.
function marginPct(p: Part): string {
    if (!p.unit_cost) return "—";
    return `${(((p.unit_price - p.unit_cost) / p.unit_cost) * 100).toFixed(0)}%`;
}

export default function InventoryPage() {
    const navigate = useNavigate();
    const role = useAuthStore((s) => s.user?.role);
    const isStaff = role === "owner" || role === "admin" || role === "advisor";
    const currency = useAppConfigStore((s) => s.config?.currency_symbol ?? "");

    const [items, setItems] = useState<Part[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [query, setQuery] = useState("");
    const [lowOnly, setLowOnly] = useState(false);
    const [editing, setEditing] = useState<Part | null>(null); // item being edited
    const [creating, setCreating] = useState(false);
    const [adjusting, setAdjusting] = useState<Part | null>(null);
    const [note, setNote] = useState("");
    const fileInput = useRef<HTMLInputElement>(null);

    const refresh = useCallback(() => {
        listInventory()
            .then(setItems)
            .catch(() => {})
            .finally(() => setLoaded(true));
    }, []);
    useEffect(() => refresh(), [refresh]);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        return items.filter((p) => {
            if (lowOnly && p.stock_on_hand > p.reorder_point) return false;
            if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [items, query, lowOnly]);

    // CSV import: name[, sku, description, stock, reorder_point, unit_cost, unit_price]
    const onCsvPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setNote("");
        try {
            const rows = parseCsv(await file.text());
            const parsed = rows
                .map((r) => ({
                    name: pick(r, "name", "item", "part", "part_name"),
                    sku: pick(r, "sku", "code", "part_no", "part_number") || undefined,
                    description: pick(r, "description", "desc") || undefined,
                    stock: parseFloat(pick(r, "stock", "stock_on_hand", "qty", "quantity")) || undefined,
                    reorder_point: parseFloat(pick(r, "reorder_point", "reorder")) || undefined,
                    unit_cost: pick(r, "unit_cost", "cost") ? toCentavos(parseFloat(pick(r, "unit_cost", "cost")) || 0) : undefined,
                    unit_price: pick(r, "unit_price", "price") ? toCentavos(parseFloat(pick(r, "unit_price", "price")) || 0) : undefined,
                }))
                .filter((r) => r.name);
            if (parsed.length === 0) {
                setNote("No usable rows found. Expected a header row with at least a `name` column.");
                return;
            }
            const res = await importInventory(parsed);
            setNote(`Import complete: ${res.imported} added, ${res.skipped} skipped (duplicates/invalid).`);
            refresh();
        } catch (err) {
            setNote(err instanceof Error ? `Import failed: ${err.message}` : "Import failed.");
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <header className="px-4 py-3 bg-white dark:bg-slate-800 shadow-sm flex items-center gap-3 sticky top-0 z-10">
                <button onClick={() => navigate("/")} className="p-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <h1 className="text-lg font-bold">Inventory</h1>
                {isStaff && (
                    <div className="ml-auto flex items-center gap-2">
                        <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={onCsvPicked} />
                        <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
                            <Upload className="w-4 h-4 mr-1" /> Import CSV
                        </Button>
                        <Button size="sm" onClick={() => setCreating(true)}>
                            <Plus className="w-4 h-4 mr-1" /> Add Item
                        </Button>
                    </div>
                )}
            </header>

            <main className="p-4 max-w-3xl mx-auto space-y-3">
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input className="pl-9" placeholder="Search by SKU or name…" value={query} onChange={(e) => setQuery(e.target.value)} />
                    </div>
                    <label className="flex items-center gap-1.5 text-sm select-none shrink-0">
                        <input type="checkbox" className="h-4 w-4" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
                        Low stock
                    </label>
                </div>

                {note && <p className="text-sm text-muted-foreground">{note}</p>}

                <Card>
                    <CardContent className="p-0 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b text-left text-xs text-muted-foreground">
                                    <th className="p-2 pl-4">SKU</th>
                                    <th className="p-2">Name</th>
                                    <th className="p-2 text-right">Stock</th>
                                    <th className="p-2 text-right">Reorder</th>
                                    <th className="p-2 text-right">Cost</th>
                                    <th className="p-2 text-right">Price</th>
                                    <th className="p-2 text-right">Margin</th>
                                    {isStaff && <th className="p-2 pr-4"></th>}
                                </tr>
                            </thead>
                            <tbody>
                                {loaded && shown.length === 0 && (
                                    <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">
                                        {items.length === 0 ? "No parts yet. Add one or import a CSV." : "No matches."}
                                    </td></tr>
                                )}
                                {shown.map((p) => {
                                    const low = p.stock_on_hand <= p.reorder_point;
                                    return (
                                        <tr key={p.id} className={`border-b last:border-0 ${low ? "bg-red-50 dark:bg-red-950/20" : ""}`}>
                                            <td className="p-2 pl-4 font-mono text-xs">{p.sku}</td>
                                            <td className="p-2">{p.name}</td>
                                            <td className={`p-2 text-right ${low ? "text-red-600 font-semibold" : ""}`}>{p.stock_on_hand}</td>
                                            <td className="p-2 text-right text-muted-foreground">{p.reorder_point}</td>
                                            <td className="p-2 text-right">{formatMoney(p.unit_cost, currency)}</td>
                                            <td className="p-2 text-right">{formatMoney(p.unit_price, currency)}</td>
                                            <td className="p-2 text-right">{marginPct(p)}</td>
                                            {isStaff && (
                                                <td className="p-2 pr-4 text-right whitespace-nowrap">
                                                    <Button variant="ghost" size="sm" onClick={() => setAdjusting(p)}>
                                                        <PackagePlus className="w-4 h-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="sm" onClick={() => setEditing(p)}>
                                                        <Pencil className="w-4 h-4" />
                                                    </Button>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
                <p className="text-xs text-muted-foreground">
                    CSV columns: <span className="font-mono">name</span> (required), <span className="font-mono">sku, description, stock, reorder_point, unit_cost, unit_price</span> (money in {currency || "major"} units). Duplicate SKUs/names are skipped.
                </p>
            </main>

            {(creating || editing) && (
                <ItemDialog
                    item={editing}
                    currency={currency}
                    onClose={() => { setCreating(false); setEditing(null); }}
                    onSaved={() => { setCreating(false); setEditing(null); refresh(); }}
                />
            )}
            {adjusting && (
                <AdjustDialog
                    item={adjusting}
                    onClose={() => setAdjusting(null)}
                    onSaved={() => { setAdjusting(null); refresh(); }}
                />
            )}
        </div>
    );
}

// Create / edit form (BACK-3-004) with live margin.
function ItemDialog({ item, currency, onClose, onSaved }: { item: Part | null; currency: string; onClose: () => void; onSaved: () => void }) {
    const [name, setName] = useState(item?.name ?? "");
    const [sku, setSku] = useState(item?.sku ?? "");
    const [description, setDescription] = useState(item?.description ?? "");
    const [stock, setStock] = useState(item ? String(item.stock_on_hand) : "0");
    const [reorder, setReorder] = useState(item ? String(item.reorder_point) : "5");
    const [cost, setCost] = useState(item ? String(fromCentavos(item.unit_cost)) : "");
    const [price, setPrice] = useState(item ? String(fromCentavos(item.unit_price)) : "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const confirm = useConfirm();
    const costC = toCentavos(parseFloat(cost) || 0);
    const priceC = toCentavos(parseFloat(price) || 0);
    const margin = costC > 0 ? (((priceC - costC) / costC) * 100).toFixed(0) + "%" : "—";

    const save = async () => {
        if (!name.trim()) return setError("Name is required.");
        if (!(await confirm({ title: item ? "Save changes to this item?" : "Add this item?", verb: "Slide to save" }))) return;
        setBusy(true);
        setError("");
        try {
            if (item) {
                await updateInventory(item.id, {
                    name: name.trim(),
                    sku: sku.trim() || item.sku,
                    description: description.trim() || null,
                    reorder_point: parseFloat(reorder) || 0,
                    unit_cost: costC,
                    unit_price: priceC,
                });
            } else {
                await createInventory({
                    name: name.trim(),
                    sku: sku.trim() || undefined,
                    description: description.trim() || undefined,
                    stock_on_hand: parseFloat(stock) || 0,
                    reorder_point: parseFloat(reorder) || 5,
                    unit_cost: costC,
                    unit_price: priceC,
                });
            }
            onSaved();
        } catch (e) {
            setError(e instanceof ApiError && e.message ? e.message : "Save failed.");
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        if (!item) return;
        if (!(await confirm({ title: `Delete "${item.name}" from inventory?`, verb: "Slide to delete", danger: true }))) return;
        setBusy(true);
        setError("");
        try {
            await deleteInventory(item.id);
            onSaved();
        } catch (e) {
            setError(e instanceof ApiError && e.message ? e.message : "Delete failed.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{item ? "Edit Item" : "Add Item"}</DialogTitle>
                    <DialogDescription>{item ? item.sku : "SKU is generated from the name when left blank."}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-1">
                        <Label htmlFor="inv-name">Name *</Label>
                        <Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label htmlFor="inv-sku">SKU</Label>
                            <Input id="inv-sku" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="auto" />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="inv-reorder">Reorder Point</Label>
                            <Input id="inv-reorder" value={reorder} onChange={(e) => setReorder(e.target.value)} inputMode="decimal" />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="inv-desc">Description</Label>
                        <Input id="inv-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        {!item && (
                            <div className="space-y-1">
                                <Label htmlFor="inv-stock">Initial Stock</Label>
                                <Input id="inv-stock" value={stock} onChange={(e) => setStock(e.target.value)} inputMode="decimal" />
                            </div>
                        )}
                        <div className="space-y-1">
                            <Label htmlFor="inv-cost">Unit Cost ({currency || "amt"})</Label>
                            <Input id="inv-cost" value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="inv-price">Unit Price ({currency || "amt"})</Label>
                            <Input id="inv-price" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
                        </div>
                    </div>
                    <div className="text-sm text-muted-foreground">Margin: <span className="font-medium">{margin}</span></div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
                <DialogFooter className="gap-2">
                    {item && (
                        <Button variant="outline" onClick={remove} disabled={busy} className="mr-auto">
                            <Trash2 className="w-4 h-4 mr-1 text-destructive" /> Delete
                        </Button>
                    )}
                    <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
                    <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// Manual stock adjustment (BACK-3-005): Receive / Correction / Write-Off + qty + note.
function AdjustDialog({ item, onClose, onSaved }: { item: Part; onClose: () => void; onSaved: () => void }) {
    const [kind, setKind] = useState<AdjustmentType>("receive");
    const [qty, setQty] = useState("");
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const confirm = useConfirm();

    const n = parseFloat(qty) || 0;
    // Receive adds; write-off subtracts; correction is signed as typed.
    const delta = kind === "receive" ? Math.abs(n) : kind === "writeoff" ? -Math.abs(n) : n;
    const after = item.stock_on_hand + delta;

    const save = async () => {
        if (!n) return setError("Enter a quantity.");
        if (!(await confirm({ title: "Apply this stock adjustment?", verb: "Slide to apply" }))) return;
        setBusy(true);
        setError("");
        try {
            await adjustStock(item.id, { type: kind, delta, note: note.trim() || null });
            onSaved();
        } catch (e) {
            setError(e instanceof ApiError && e.message ? e.message : "Adjustment failed.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Adjust Stock</DialogTitle>
                    <DialogDescription>{item.name} — currently {item.stock_on_hand} on hand.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                        {([["receive", "Receive"], ["correction", "Correction"], ["writeoff", "Write-Off"]] as const).map(([k, label]) => (
                            <button
                                key={k}
                                type="button"
                                onClick={() => setKind(k)}
                                className={`rounded-md border p-2 text-sm transition-colors ${kind === k ? "bg-primary/10 border-primary text-primary" : "hover:bg-muted"}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="adj-qty">Quantity{kind === "correction" ? " (signed, e.g. -2)" : ""}</Label>
                        <Input id="adj-qty" value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="adj-note">Note</Label>
                        <Input id="adj-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. delivery from supplier" />
                    </div>
                    <div className="text-sm text-muted-foreground">After adjustment: <span className="font-medium">{after}</span></div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
                    <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Apply"}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
