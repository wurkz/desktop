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
import { useConfirm } from "../../../components/confirm";

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
    const confirm = useConfirm();

    const [rows, setRows] = useState<Row[]>([]);
    const [discount, setDiscount] = useState("");
    const [discountMode, setDiscountMode] = useState<"amount" | "pct">("amount");
    const [seniorType, setSeniorType] = useState<"" | "senior" | "pwd">("");
    const [seniorId, setSeniorId] = useState("");
    const [seniorName, setSeniorName] = useState("");
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
            setDiscountMode("amount");
            setSeniorType((ticket.senior_pwd_type as "senior" | "pwd" | null) ?? "");
            setSeniorId(ticket.senior_pwd_id ?? "");
            setSeniorName(ticket.senior_pwd_name ?? "");
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

    const maxDiscountPct = config?.max_discount_pct ?? null; // fraction or null
    const lineCentavos = (r: Row) => Math.round((parseFloat(r.quantity) || 0) * toCentavos(parseFloat(r.unitPrice) || 0));
    const subtotal = rows.reduce((s, r) => s + lineCentavos(r), 0);
    const discountInput = parseFloat(discount) || 0;
    const discountC =
        discountMode === "pct" ? Math.round(subtotal * (discountInput / 100)) : toCentavos(discountInput);
    const effectivePct = subtotal > 0 ? (discountC / subtotal) * 100 : 0;
    const overCap = maxDiscountPct != null && effectivePct > maxDiscountPct * 100 + 0.001;
    const isSenior = seniorType !== "";
    const seniorDiscC = isSenior ? Math.round(subtotal * 0.2) : 0; // 20% statutory
    const tax = isSenior ? 0 : Math.round(subtotal * taxRate); // VAT-exempt when senior/PWD
    const total = subtotal + tax - discountC - seniorDiscC;

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
        if (overCap) {
            setError(`Discount exceeds the maximum allowed (${((maxDiscountPct ?? 0) * 100).toFixed(0)}%).`);
            return;
        }
        if (!(await confirm({ title: "Save this estimate?", verb: "Slide to save estimate" }))) return;
        setSaving(true);
        setError("");
        try {
            const updated = await saveEstimate(ticket.id, {
                items,
                discount: discountC,
                senior_pwd_type: seniorType || null,
                senior_pwd_id: seniorId.trim() || null,
                senior_pwd_name: seniorName.trim() || null,
            });
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
                        // Mobile: a compact two-row card (description on top; qty/unit/price/total below).
                        // Desktop: sm:contents flattens the wrappers so children form the original single row.
                        <div
                            key={r.key}
                            className="flex flex-col gap-2 rounded-lg border p-2 sm:flex-row sm:items-end sm:border-0 sm:rounded-none sm:p-0"
                        >
                            <div className="flex items-end gap-2 sm:contents">
                                <div className="shrink-0 pb-2">
                                    {r.type === "service" ? (
                                        <Wrench className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                        <Package className="h-4 w-4 text-muted-foreground" />
                                    )}
                                </div>
                                <div className="flex-1 space-y-1 min-w-0">
                                    <Label className="text-xs">Description</Label>
                                    <Input value={r.description} onChange={(e) => setRow(r.key, { description: e.target.value })} />
                                </div>
                                {/* delete: mobile shows it beside description; desktop uses the one at row end */}
                                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 sm:hidden" onClick={() => removeRow(r.key)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                            <div className="flex items-end gap-2 sm:contents">
                                <div className="w-14 space-y-1">
                                    <Label className="text-xs">Qty</Label>
                                    <Input value={r.quantity} onChange={(e) => setRow(r.key, { quantity: e.target.value })} inputMode="decimal" />
                                </div>
                                <div className="w-16 space-y-1">
                                    <Label className="text-xs">Unit</Label>
                                    <Input value={r.unit} onChange={(e) => setRow(r.key, { unit: e.target.value })} placeholder="pc" />
                                </div>
                                <div className="flex-1 space-y-1 sm:flex-none sm:w-24">
                                    <Label className="text-xs">Price</Label>
                                    <Input value={r.unitPrice} onChange={(e) => setRow(r.key, { unitPrice: e.target.value })} inputMode="decimal" />
                                </div>
                                <div className="w-20 sm:w-24 text-right text-sm pb-2">{formatMoney(lineCentavos(r), currency)}</div>
                                <Button type="button" variant="ghost" size="icon" className="hidden h-9 w-9 shrink-0 sm:flex sm:items-center sm:justify-center" onClick={() => removeRow(r.key)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
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
                        <div className="flex flex-wrap justify-between items-center gap-2">
                            <span className="text-muted-foreground">
                                Discount
                                {discount.trim() && (
                                    <span className={`ml-2 text-xs ${overCap ? "text-destructive" : "text-muted-foreground"}`}>
                                        {discountMode === "pct" ? `= ${formatMoney(discountC, currency)}` : `= ${effectivePct.toFixed(1)}%`}
                                        {maxDiscountPct != null ? ` (max ${(maxDiscountPct * 100).toFixed(0)}%)` : ""}
                                    </span>
                                )}
                            </span>
                            <div className="flex gap-1">
                                <div className="flex rounded-md border overflow-hidden text-xs">
                                    <button type="button" className={`px-2 ${discountMode === "amount" ? "bg-primary text-primary-foreground" : ""}`} onClick={() => setDiscountMode("amount")}>{currency || "$"}</button>
                                    <button type="button" className={`px-2 ${discountMode === "pct" ? "bg-primary text-primary-foreground" : ""}`} onClick={() => setDiscountMode("pct")}>%</button>
                                </div>
                                <Input className={`w-24 h-8 ${overCap ? "border-destructive" : ""}`} value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" placeholder="0" />
                            </div>
                        </div>
                        <div className="flex flex-wrap justify-between items-center gap-2">
                            <span className="text-muted-foreground">Senior / PWD</span>
                            <div className="flex gap-2">
                                <select
                                    className="h-8 rounded-md border bg-background px-2 text-sm"
                                    value={seniorType}
                                    onChange={(e) => setSeniorType(e.target.value as "" | "senior" | "pwd")}
                                >
                                    <option value="">None</option>
                                    <option value="senior">Senior</option>
                                    <option value="pwd">PWD</option>
                                </select>
                                <Input
                                    className="w-32 h-8"
                                    value={seniorId}
                                    onChange={(e) => setSeniorId(e.target.value)}
                                    placeholder="OSCA/PWD ID"
                                    disabled={!isSenior}
                                />
                            </div>
                        </div>
                        {isSenior && (
                            <div className="flex flex-wrap justify-between items-center gap-2">
                                <span className="text-muted-foreground">Holder name</span>
                                <Input className="w-full sm:w-56 h-8" value={seniorName} onChange={(e) => setSeniorName(e.target.value)} placeholder="Senior/PWD full name" />
                            </div>
                        )}
                        {isSenior && (
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Senior/PWD Disc. (20%)</span>
                                <span>-{formatMoney(seniorDiscC, currency)}</span>
                            </div>
                        )}
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">
                                {isSenior ? "Tax (VAT-exempt)" : `Tax (${(taxRate * 100).toFixed(0)}%)`}
                            </span>
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
                    <Button onClick={submit} disabled={saving || overCap}>
                        {saving ? "Saving…" : "Save Estimate"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
