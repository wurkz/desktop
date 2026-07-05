import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button, Card, CardHeader, CardTitle, CardContent } from "@zorviz/ui";
import { ArrowLeft, CheckCircle2, AlertTriangle, MinusCircle, FileText, UserCog } from "lucide-react";
import { formatMoney } from "@zorviz/core";
import { getOrder, completeItem, markDone, billOrder, type JobTicket, type InspectionItem } from "../lib/orders-api";
import { generateInvoicePdf } from "../lib/invoice-pdf";
import { StatusBadge } from "../components/status-badge";
import { EstimateBuilder } from "../features/repair/components/EstimateBuilder";
import { ApprovalDialog } from "../features/repair/components/ApprovalDialog";
import { AssignDialog } from "../features/repair/components/AssignDialog";
import { useAppConfigStore } from "../stores/app-config";

function assetTitle(asset?: JobTicket["asset"]): string {
    if (!asset) return "Unknown asset";
    const s = asset.specs as Record<string, string>;
    return s.plateNumber || s.serialNumber || s.imei || [s.make, s.model].filter(Boolean).join(" ") || "Asset";
}

const INSPECTION_ICON: Record<InspectionItem["status"], typeof CheckCircle2> = {
    ok: CheckCircle2,
    issue: AlertTriangle,
    na: MinusCircle,
};

export default function JobTicketPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const config = useAppConfigStore((s) => s.config);
    const currency = config?.currency_symbol ?? "";
    const [ticket, setTicket] = useState<JobTicket | null>(null);
    const [error, setError] = useState("");
    const [estimateOpen, setEstimateOpen] = useState(false);
    const [approvalOpen, setApprovalOpen] = useState(false);
    const [assignOpen, setAssignOpen] = useState(false);

    const toggleItem = async (itemId: string, completed: boolean) => {
        try {
            setTicket(await completeItem(itemId, completed));
        } catch (e) {
            console.error(e);
        }
    };
    const finishJob = async () => {
        if (!ticket) return;
        try {
            setTicket(await markDone(ticket.id));
        } catch (e) {
            console.error(e);
        }
    };
    const markPaid = async () => {
        if (!ticket) return;
        try {
            setTicket(await billOrder(ticket.id));
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        if (!id) return;
        getOrder(id)
            .then(setTicket)
            .catch(() => setError("Could not load this job ticket."));
    }, [id]);

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <header className="px-4 py-3 bg-white dark:bg-slate-800 shadow-sm flex items-center gap-3">
                <button onClick={() => navigate("/repair")} className="p-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <h1 className="text-lg font-bold">Job Ticket</h1>
                {ticket && <StatusBadge status={ticket.status} />}
            </header>

            <main className="p-4 max-w-md mx-auto space-y-4">
                {error && <p className="text-sm text-destructive">{error}</p>}
                {!ticket && !error && <p className="text-muted-foreground">Loading…</p>}

                {ticket && (
                    <>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">{assetTitle(ticket.asset)}</CardTitle>
                            </CardHeader>
                            <CardContent className="text-sm text-muted-foreground space-y-1">
                                <div className="capitalize">{ticket.asset?.type}</div>
                                {ticket.customer && (
                                    <div>
                                        {ticket.customer.name}
                                        {ticket.customer.phone ? ` · ${ticket.customer.phone}` : ""}
                                    </div>
                                )}
                                <div className="flex items-center justify-between pt-1">
                                    <span className="flex items-center gap-1">
                                        <UserCog className="w-4 h-4" />
                                        {ticket.mechanic ? ticket.mechanic.name : "Unassigned"}
                                    </span>
                                    <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
                                        Assign
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm">Customer Complaint</CardTitle>
                            </CardHeader>
                            <CardContent className="text-sm">
                                {ticket.customer_complaint || <span className="text-muted-foreground">None recorded</span>}
                            </CardContent>
                        </Card>

                        {ticket.inspection && ticket.inspection.length > 0 && (
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm">Initial Inspection</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    {ticket.inspection.map((it) => {
                                        const Icon = INSPECTION_ICON[it.status];
                                        const color =
                                            it.status === "ok" ? "text-green-600" : it.status === "issue" ? "text-red-600" : "text-muted-foreground";
                                        return (
                                            <div key={it.item} className="flex items-start gap-2 text-sm">
                                                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
                                                <div>
                                                    <span>{it.item}</span>
                                                    {it.status === "issue" && it.note && (
                                                        <span className="text-muted-foreground"> — {it.note}</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </CardContent>
                            </Card>
                        )}

                        <Card>
                            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                                <CardTitle className="text-sm">Estimate</CardTitle>
                                {(ticket.status === "triage" || ticket.status === "estimate") && (
                                    <Button size="sm" variant="outline" onClick={() => setEstimateOpen(true)}>
                                        <FileText className="h-4 w-4 mr-1" />
                                        {ticket.items && ticket.items.length > 0 ? "Edit" : "Create"}
                                    </Button>
                                )}
                            </CardHeader>
                            <CardContent className="text-sm space-y-2">
                                {ticket.items && ticket.items.length > 0 ? (
                                    <>
                                        {ticket.items.map((it) => (
                                            <div key={it.id} className="flex justify-between gap-2">
                                                <span>
                                                    {it.description}{" "}
                                                    <span className="text-muted-foreground">×{it.quantity}</span>
                                                </span>
                                                <span>{formatMoney(it.total, currency)}</span>
                                            </div>
                                        ))}
                                        <div className="border-t pt-2 space-y-1">
                                            <div className="flex justify-between text-muted-foreground">
                                                <span>Subtotal</span>
                                                <span>{formatMoney(ticket.subtotal, currency)}</span>
                                            </div>
                                            {ticket.discount > 0 && (
                                                <div className="flex justify-between text-muted-foreground">
                                                    <span>Discount</span>
                                                    <span>-{formatMoney(ticket.discount, currency)}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between text-muted-foreground">
                                                <span>Tax</span>
                                                <span>{formatMoney(ticket.tax, currency)}</span>
                                            </div>
                                            <div className="flex justify-between font-semibold">
                                                <span>Total</span>
                                                <span>{formatMoney(ticket.total, currency)}</span>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <span className="text-muted-foreground">No estimate yet.</span>
                                )}

                                {ticket.status === "estimate" && ticket.items && ticket.items.length > 0 && (
                                    <Button className="w-full mt-1" onClick={() => setApprovalOpen(true)}>
                                        Mark Approved
                                    </Button>
                                )}
                                {ticket.approval_proof && (
                                    <div className="text-xs text-muted-foreground border-t pt-2">
                                        Approved by {ticket.approval_proof.approved_by} · {ticket.approval_proof.method}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {(ticket.status === "approved" || ticket.status === "in_progress") &&
                            ticket.items &&
                            ticket.items.length > 0 && (
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm">Work Checklist</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-2">
                                        {ticket.items.map((it) => (
                                            <label
                                                key={it.id}
                                                className="flex items-center gap-3 py-1 cursor-pointer select-none"
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="h-5 w-5 shrink-0"
                                                    checked={it.completed === 1}
                                                    onChange={(e) => toggleItem(it.id, e.target.checked)}
                                                />
                                                <span className={it.completed === 1 ? "line-through text-muted-foreground" : ""}>
                                                    {it.description}
                                                    <span className="text-muted-foreground"> ×{it.quantity}</span>
                                                </span>
                                            </label>
                                        ))}
                                        <Button
                                            className="w-full mt-2"
                                            disabled={!ticket.items.every((it) => it.completed === 1)}
                                            onClick={finishJob}
                                        >
                                            Mark as Done
                                        </Button>
                                    </CardContent>
                                </Card>
                            )}

                        {(ticket.status === "done" || ticket.status === "paid") && (
                            <Card>
                                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                                    <CardTitle className="text-sm">Billing</CardTitle>
                                    <span className="text-lg font-semibold">{formatMoney(ticket.total, currency)}</span>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    {ticket.receipt_number && (
                                        <div className="text-sm text-muted-foreground">Receipt {ticket.receipt_number}</div>
                                    )}
                                    <div className="flex gap-2">
                                        <Button variant="outline" className="flex-1" onClick={() => { void generateInvoicePdf(ticket, config).catch(console.error); }}>
                                            <FileText className="h-4 w-4 mr-1" /> Invoice PDF
                                        </Button>
                                        {ticket.status === "done" && (
                                            <Button className="flex-1" onClick={markPaid}>
                                                Mark as Paid
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        <EstimateBuilder
                            ticket={ticket}
                            open={estimateOpen}
                            onOpenChange={setEstimateOpen}
                            onSaved={setTicket}
                        />
                        <ApprovalDialog
                            ticket={ticket}
                            open={approvalOpen}
                            onOpenChange={setApprovalOpen}
                            onApproved={setTicket}
                        />
                        <AssignDialog
                            ticket={ticket}
                            open={assignOpen}
                            onOpenChange={setAssignOpen}
                            onAssigned={setTicket}
                        />
                    </>
                )}
            </main>
        </div>
    );
}
