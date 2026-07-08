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
import { approveOrder, type JobTicket } from "../../../lib/orders-api";
import { useConfirm } from "../../../components/confirm";

const METHODS: { key: string; label: string }[] = [
    { key: "verbal", label: "In person" },
    { key: "phone", label: "Phone" },
    { key: "message", label: "Message" },
    { key: "signed", label: "Signed job order" },
];

interface Props {
    ticket: JobTicket;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onApproved: (t: JobTicket) => void;
}

export function ApprovalDialog({ ticket, open, onOpenChange, onApproved }: Props) {
    const [approvedBy, setApprovedBy] = useState("");
    const [method, setMethod] = useState("verbal");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const confirm = useConfirm();

    useEffect(() => {
        if (open) {
            setApprovedBy(ticket.customer?.name ?? "");
            setMethod("verbal");
            setError("");
        }
    }, [open, ticket]);

    const submit = async () => {
        if (!approvedBy.trim()) {
            setError("Who approved this?");
            return;
        }
        if (!(await confirm({ title: "Record this approval?", verb: "Slide to approve" }))) return;
        setSaving(true);
        setError("");
        try {
            const updated = await approveOrder(ticket.id, { approved_by: approvedBy.trim(), method });
            onApproved(updated);
            onOpenChange(false);
        } catch (e) {
            console.error(e);
            setError("Failed to record approval.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Record Approval</DialogTitle>
                    <DialogDescription>Confirm the customer approved this estimate.</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-1">
                        <Label htmlFor="approvedBy">Approved by</Label>
                        <Input id="approvedBy" value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} placeholder="Customer name" />
                    </div>
                    <div className="space-y-1">
                        <Label>How</Label>
                        <div className="grid grid-cols-2 gap-2">
                            {METHODS.map((m) => (
                                <button
                                    key={m.key}
                                    type="button"
                                    onClick={() => setMethod(m.key)}
                                    className={`rounded-md border p-2 text-sm transition-colors ${
                                        method === m.key ? "bg-primary/10 border-primary text-primary" : "hover:bg-muted"
                                    }`}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={saving}>
                        {saving ? "Saving…" : "Approve"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
