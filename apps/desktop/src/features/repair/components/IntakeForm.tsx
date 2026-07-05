import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
import type { AssetWithHistory } from "@zorviz/feature-repair";
import { createOrder, type InspectionItem } from "../../../lib/orders-api";

const CHECKLIST = ["Exterior / Body", "Battery / Power", "Lights / Display", "Fluids / Leaks", "Accessories"];

const STATUS_OPTS: { key: InspectionItem["status"]; label: string; cls: string }[] = [
    { key: "ok", label: "OK", cls: "bg-green-100 text-green-700 border-green-300" },
    { key: "issue", label: "Issue", cls: "bg-red-100 text-red-700 border-red-300" },
    { key: "na", label: "N/A", cls: "bg-muted text-muted-foreground" },
];

function assetLabel(asset: AssetWithHistory): string {
    const s = asset.specs as Record<string, string>;
    return s.plateNumber || s.serialNumber || s.imei || s.model || "Asset";
}

interface Props {
    asset: AssetWithHistory | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    // Prefill the complaint (used when converting a booking — BACK-2-010).
    initialComplaint?: string;
    // Called after the ticket is created (before navigation), e.g. to mark the source
    // booking completed.
    onCreated?: (ticketId: string) => void | Promise<void>;
}

export function IntakeForm({ asset, open, onOpenChange, initialComplaint, onCreated }: Props) {
    const navigate = useNavigate();
    const [complaint, setComplaint] = useState("");
    const [jobOrderNo, setJobOrderNo] = useState("");
    const [terms, setTerms] = useState("");
    const [items, setItems] = useState<InspectionItem[]>([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (open) {
            setComplaint(initialComplaint ?? "");
            setJobOrderNo("");
            setTerms("");
            setItems(CHECKLIST.map((item) => ({ item, status: "na", note: "" })));
            setError("");
        }
    }, [open, initialComplaint]);

    const setItem = (i: number, patch: Partial<InspectionItem>) =>
        setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

    const submit = async () => {
        if (!asset) return;
        if (!complaint.trim()) {
            setError("Enter the customer complaint.");
            return;
        }
        setSaving(true);
        setError("");
        try {
            const ticket = await createOrder({
                asset_id: asset.id,
                customer_complaint: complaint.trim(),
                inspection: items,
                job_order_no: jobOrderNo.trim() || null,
                terms: terms.trim() || null,
            });
            if (onCreated) await onCreated(ticket.id);
            onOpenChange(false);
            navigate(`/repair/ticket/${ticket.id}`);
        } catch (e) {
            console.error(e);
            setError("Failed to create job ticket.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>New Job Ticket</DialogTitle>
                    <DialogDescription>{asset ? assetLabel(asset) : ""} — intake &amp; triage</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-1">
                        <Label htmlFor="complaint">Customer Complaint *</Label>
                        <textarea
                            id="complaint"
                            className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            placeholder="e.g. Aircon not cold; rattling noise on left turn"
                            value={complaint}
                            onChange={(e) => setComplaint(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label htmlFor="jobno">Job Order No.</Label>
                            <Input id="jobno" value={jobOrderNo} onChange={(e) => setJobOrderNo(e.target.value)} placeholder="paper form #, optional" />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="terms">Terms</Label>
                            <Input id="terms" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="e.g. COD, optional" />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Initial Inspection</Label>
                        {items.map((it, i) => (
                            <div key={it.item} className="rounded-md border p-2 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-medium">{it.item}</span>
                                    <div className="flex gap-1">
                                        {STATUS_OPTS.map((opt) => (
                                            <button
                                                key={opt.key}
                                                type="button"
                                                onClick={() => setItem(i, { status: opt.key })}
                                                className={`rounded border px-2 py-0.5 text-xs ${
                                                    it.status === opt.key ? opt.cls : "border-transparent text-muted-foreground hover:bg-muted"
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {it.status === "issue" && (
                                    <Input
                                        placeholder="Note…"
                                        value={it.note}
                                        onChange={(e) => setItem(i, { note: e.target.value })}
                                    />
                                )}
                            </div>
                        ))}
                    </div>

                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={saving}>
                        {saving ? "Creating…" : "Create Ticket"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
