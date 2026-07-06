import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@zorviz/ui";
import { listUsers, type StaffUser } from "../../../lib/users-api";
import { assignOrder, type JobTicket } from "../../../lib/orders-api";
import { useRoleLabel } from "../../../lib/roles";

interface Props {
    ticket: JobTicket;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAssigned: (t: JobTicket) => void;
}

export function AssignDialog({ ticket, open, onOpenChange, onAssigned }: Props) {
    const roleLabel = useRoleLabel();
    const [users, setUsers] = useState<StaffUser[]>([]);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (open) listUsers().then(setUsers).catch(() => {});
    }, [open]);

    const pick = async (id: string | null) => {
        setBusy(true);
        try {
            const t = await assignOrder(ticket.id, id);
            onAssigned(t);
            onOpenChange(false);
        } catch (e) {
            console.error(e);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Assign {roleLabel("mechanic")}</DialogTitle>
                    <DialogDescription>Who will work on this job?</DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                    {users.map((u) => (
                        <button
                            key={u.id}
                            type="button"
                            disabled={busy}
                            onClick={() => pick(u.id)}
                            className={`w-full text-left rounded-md border p-3 hover:bg-muted ${
                                ticket.assigned_mechanic_id === u.id ? "border-primary bg-primary/10" : ""
                            }`}
                        >
                            <div className="font-medium">{u.name}</div>
                            <div className="text-xs text-muted-foreground capitalize">{u.role}</div>
                        </button>
                    ))}
                    {users.length === 0 && <p className="text-sm text-muted-foreground">No staff found.</p>}
                    {ticket.assigned_mechanic_id && (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => pick(null)}
                            className="w-full text-left rounded-md border p-3 text-muted-foreground hover:bg-muted"
                        >
                            Unassign
                        </button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
