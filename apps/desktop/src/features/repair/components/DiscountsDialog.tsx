import { useEffect, useState } from "react";
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
import { formatMoney, toCentavos, fromCentavos } from "@zorviz/core";
import { setDiscounts, type JobTicket } from "../../../lib/orders-api";
import { useAppConfigStore } from "../../../stores/app-config";

interface Props {
    ticket: JobTicket;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved: (t: JobTicket) => void;
}

// Final-stage discount editor (BACK-2-C015): adjust the manual discount + senior/PWD status
// on an order that already has an estimate, and recompute totals. Admin/advisor only.
export function DiscountsDialog({ ticket, open, onOpenChange, onSaved }: Props) {
    const config = useAppConfigStore((s) => s.config);
    const currency = config?.currency_symbol ?? "";
    const taxRate = config?.tax_rate ?? 0;

    const [discount, setDiscount] = useState("");
    const [seniorType, setSeniorType] = useState<"" | "senior" | "pwd">("");
    const [seniorId, setSeniorId] = useState("");
    const [seniorName, setSeniorName] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!open) return;
        setDiscount(ticket.discount ? String(fromCentavos(ticket.discount)) : "");
        setSeniorType((ticket.senior_pwd_type as "senior" | "pwd" | null) ?? "");
        setSeniorId(ticket.senior_pwd_id ?? "");
        setSeniorName(ticket.senior_pwd_name ?? "");
        setError("");
    }, [open, ticket]);

    const subtotal = ticket.subtotal;
    const discountC = toCentavos(parseFloat(discount) || 0);
    const isSenior = seniorType !== "";
    const seniorDiscC = isSenior ? Math.round(subtotal * 0.2) : 0;
    const tax = isSenior ? 0 : Math.round(subtotal * taxRate);
    const total = subtotal + tax - discountC - seniorDiscC;

    const submit = async () => {
        setSaving(true);
        setError("");
        try {
            const updated = await setDiscounts(ticket.id, {
                discount: discountC,
                senior_pwd_type: seniorType || null,
                senior_pwd_id: seniorId.trim() || null,
                senior_pwd_name: seniorName.trim() || null,
            });
            onSaved(updated);
            onOpenChange(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save discounts.");
        } finally {
            setSaving(false);
        }
    };

    const row = (label: string, val: string, bold = false) => (
        <div className={`flex justify-between ${bold ? "font-semibold text-base pt-1" : ""}`}>
            <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
            <span>{val}</span>
        </div>
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Discounts</DialogTitle>
                    <DialogDescription>Adjust the discount or apply a Senior/PWD discount before billing.</DialogDescription>
                </DialogHeader>

                <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="dsc">Manual Discount</Label>
                        <Input id="dsc" className="w-32 h-9" value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" placeholder="0" />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <Label>Senior / PWD</Label>
                        <div className="flex gap-2">
                            <select
                                className="h-9 rounded-md border bg-background px-2 text-sm"
                                value={seniorType}
                                onChange={(e) => setSeniorType(e.target.value as "" | "senior" | "pwd")}
                            >
                                <option value="">None</option>
                                <option value="senior">Senior</option>
                                <option value="pwd">PWD</option>
                            </select>
                            <Input className="w-32 h-9" value={seniorId} onChange={(e) => setSeniorId(e.target.value)} placeholder="OSCA/PWD ID" disabled={!isSenior} />
                        </div>
                    </div>
                    {isSenior && (
                        <div className="flex items-center justify-between gap-2">
                            <Label htmlFor="sname">Holder name</Label>
                            <Input id="sname" className="w-56 h-9" value={seniorName} onChange={(e) => setSeniorName(e.target.value)} placeholder="Senior/PWD full name" />
                        </div>
                    )}

                    <div className="border-t pt-2 space-y-1">
                        {row("Subtotal", formatMoney(subtotal, currency))}
                        {discountC > 0 && row("Discount", `-${formatMoney(discountC, currency)}`)}
                        {isSenior && row("Senior/PWD Disc. (20%)", `-${formatMoney(seniorDiscC, currency)}`)}
                        {row(isSenior ? "Tax (VAT-exempt)" : `Tax (${(taxRate * 100).toFixed(0)}%)`, formatMoney(tax, currency))}
                        {row("Total", formatMoney(total, currency), true)}
                    </div>

                    {error && <p className="text-destructive">{error}</p>}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
                    <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
