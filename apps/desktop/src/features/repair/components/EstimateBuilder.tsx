import { useState, useEffect } from "react";
import {
    Button,
    Input,
    Label,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@zorviz/ui";
import { Plus, Trash2, Wrench, Package } from "lucide-react";
import { toCentavos, fromCentavos, formatMoney } from "@zorviz/core";
import { EntityPicker } from "../../../components/entity-picker";
import { searchInventory, createInventory, type Part } from "../../../lib/inventory-api";
import { saveEstimate, type JobTicket } from "../../../lib/orders-api";
import { useAppConfigStore } from "../../../stores/app-config";

interface Row {
    key: string;
    type: "service" | "part";
    description: string;
    quantity: string;
    unit: string;
    unitPrice: string; // major units
    inventoryItemId?: string | null;
}

let rowSeq = 0;
const newRow = (type: "service" | "part", init?: Partial<Row>): Row => ({
    key: `r${rowSeq++}`,
    type,
    description: "",
    quantity: "1",
    unit: "",
    unitPrice: "",
    ...init,
});

interface Props {
    ticket: JobTicket;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved: (t: JobTicket) => void;
}

export function EstimateBuilder({ ticket, open, onOpenChange, onSaved }: Props) {
    const config = useAppConfigStore((s) => s.config);
    const currency = config?.currency_symbol ?? "";
    const taxRate = config?.tax_rate ?? 0;

    const [rows, setRows] = useState<Row[]>([]);
    const [discount, setDiscount] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (open) {
            setRows(
                (ticket.items ?? []).map((it) =>
                    newRow(it.type, {
                        description: it.description,
                        quantity: String(it.quantity),
                        unit: it.unit ?? "",
                        unitPrice: String(fromCentavos(it.unit_price)),
                        inventoryItemId: it.inventory_item_id,
                    })
                )
            );
            setDiscount(ticket.discount ? String(fromCentavos(ticket.discount)) : "");
            setError("");
        }
    }, [open, ticket]);

    const setRow = (key: string, patch: Partial<Row>) =>
        setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));
    const addPart = (p: Part) =>
        setRows((prev) => [
            ...prev,
            newRow("part", { description: p.name, unitPrice: String(fromCentavos(p.unit_price)), inventoryItemId: p.id }),
        ]);

    const lineCentavos = (r: Row) => Math.round((parseFloat(r.quantity) || 0) * toCentavos(parseFloat(r.unitPrice) || 0));
    const subtotal = rows.reduce((s, r) => s + lineCentavos(r), 0);
    const discountC = toCentavos(parseFloat(discount) || 0);
    const tax = Math.round(subtotal * taxRate);
    const total = subtotal + tax - discountC;

    const submit = async () => {
        const items = rows
            .filter((r) => r.description.trim())
            .map((r) => ({
                type: r.type,
                description: r.description.trim(),
                quantity: parseFloat(r.quantity) || 1,
                unit: r.unit.trim() || null,
                unit_price: toCentavos(parseFloat(r.unitPrice) || 0),
                inventory_item_id: r.inventoryItemId ?? null,
            }));
        if (items.length === 0) {
            setError("Add at least one line item.");
            return;
        }
        setSaving(true);
        setError("");
        try {
            const updated = await saveEstimate(ticket.id, { items, discount: discountC });
            onSaved(updated);
            onOpenChange(false);
        } catch (e) {
            console.error(e);
            setError("Failed to save estimate.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Estimate</DialogTitle>
                    <DialogDescription>Add labor and parts — totals update live.</DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    {rows.map((r) => (
                        <div key={r.key} className="flex gap-2 items-end">
                            <div className="shrink-0 pb-2">
                                {r.type === "service" ? (
                                    <Wrench className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                    <Package className="h-4 w-4 text-muted-foreground" />
                                )}
                            </div>
                            <div className="flex-1 space-y-1">
                                <Label className="text-xs">Description</Label>
                                <Input value={r.description} onChange={(e) => setRow(r.key, { description: e.target.value })} />
                            </div>
                            <div className="w-14 space-y-1">
                                <Label className="text-xs">Qty</Label>
                                <Input value={r.quantity} onChange={(e) => setRow(r.key, { quantity: e.target.value })} inputMode="decimal" />
                            </div>
                            <div className="w-16 space-y-1">
                                <Label className="text-xs">Unit</Label>
                                <Input value={r.unit} onChange={(e) => setRow(r.key, { unit: e.target.value })} placeholder="pc" />
                            </div>
                            <div className="w-24 space-y-1">
                                <Label className="text-xs">Price</Label>
                                <Input value={r.unitPrice} onChange={(e) => setRow(r.key, { unitPrice: e.target.value })} inputMode="decimal" />
                            </div>
                            <div className="w-24 text-right text-sm pb-2">{formatMoney(lineCentavos(r), currency)}</div>
                            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => removeRow(r.key)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}

                    <Button type="button" variant="outline" size="sm" onClick={() => setRows((p) => [...p, newRow("service")])}>
                        <Plus className="h-4 w-4 mr-1" /> Add Service
                    </Button>

                    <div className="space-y-1">
                        <Label className="text-xs">Add Part (search inventory or create)</Label>
                        <EntityPicker<Part>
                            value={null}
                            onChange={(p) => { if (p) addPart(p); }}
                            search={searchInventory}
                            onCreate={(name) => createInventory({ name })}
                            getLabel={(p) => p.name}
                            getSubLabel={(p) => `${p.sku} · ${formatMoney(p.unit_price, currency)}`}
                            placeholder="Search or add a part…"
                        />
                    </div>

                    <div className="border-t pt-3 space-y-1 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Subtotal</span>
                            <span>{formatMoney(subtotal, currency)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Discount</span>
                            <Input className="w-28 h-8" value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" placeholder="0" />
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Tax ({(taxRate * 100).toFixed(0)}%)</span>
                            <span>{formatMoney(tax, currency)}</span>
                        </div>
                        <div className="flex justify-between font-semibold text-base pt-1">
                            <span>Total</span>
                            <span>{formatMoney(total, currency)}</span>
                        </div>
                    </div>

                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={saving}>
                        {saving ? "Saving…" : "Save Estimate"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
