import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    Button, Card, CardHeader, CardTitle, CardContent,
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@zorviz/ui";
import { ArrowLeft, CheckCircle2, AlertTriangle, MinusCircle, FileText, UserCog, Ban, Printer } from "lucide-react";
import { formatMoney } from "@zorviz/core";
import { getOrder, completeItem, startOrder, markDone, billOrder, cancelOrder, type JobTicket, type InspectionItem } from "../lib/orders-api";
import { ApiError } from "../lib/api";
import { generateInvoicePdf } from "../lib/invoice-pdf";
import { StatusBadge } from "../components/status-badge";
import { EstimateBuilder } from "../features/repair/components/EstimateBuilder";
import { ApprovalDialog } from "../features/repair/components/ApprovalDialog";
import { AssignDialog } from "../features/repair/components/AssignDialog";
import { TicketPhotos } from "../features/repair/components/TicketPhotos";
import { DiscountsDialog } from "../features/repair/components/DiscountsDialog";
import { useAppConfigStore } from "../stores/app-config";
import { useAuthStore } from "../stores/auth";
import { toast } from "../stores/toast";

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

function elapsed(ms: number): string {
    const mins = Math.floor((Date.now() - ms) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const h = Math.floor(mins / 60);
    return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

// Human duration between two epoch-ms timestamps (e.g. "1h 25m").
function duration(from: number, to: number): string {
    const mins = Math.max(0, Math.round((to - from) / 60000));
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
}

export default function JobTicketPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const config = useAppConfigStore((s) => s.config);
    const currency = config?.currency_symbol ?? "";
    const role = useAuthStore((s) => s.user?.role);
    const isStaff = role === "owner" || role === "admin" || role === "advisor";
    const [ticket, setTicket] = useState<JobTicket | null>(null);
    const [error, setError] = useState("");
    const [estimateOpen, setEstimateOpen] = useState(false);
    const [approvalOpen, setApprovalOpen] = useState(false);
    const [assignOpen, setAssignOpen] = useState(false);
    const [discountsOpen, setDiscountsOpen] = useState(false);
    const [cancelOpen, setCancelOpen] = useState(false);
    const [cancelReason, setCancelReason] = useState("");
    const [cancelling, setCancelling] = useState(false);
    const [cancelErr, setCancelErr] = useState("");

    const toggleItem = async (itemId: string, completed: boolean) => {
        try {
            setTicket(await completeItem(itemId, completed));
        } catch (e) {
            console.error(e);
        }
    };
    const startJob = async () => {
        if (!ticket) return;
        try {
            setTicket(await startOrder(ticket.id));
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
    // Download a PDF (Job Order or Invoice) and confirm where it landed. Pre-approval
    // (triage/estimate) copies are annotated "FOR CUSTOMER APPROVAL" so the signed estimate
    // isn't confused with the billed invoice.
    const downloadPdf = (forApproval: boolean) => {
        if (!ticket) return;
        generateInvoicePdf(ticket, config, { forApproval })
            .then((filename) => toast(`Saved to Downloads · ${filename}`, "success"))
            .catch((e) => {
                console.error(e);
                toast("Couldn't generate the PDF.", "error");
            });
    };
    const printJobOrder = () => {
        if (!ticket) return;
        downloadPdf(ticket.status === "triage" || ticket.status === "estimate");
    };
    const cancelJob = async () => {
        if (!ticket) return;
        setCancelling(true);
        setCancelErr("");
        try {
            setTicket(await cancelOrder(ticket.id, cancelReason.trim()));
            setCancelOpen(false);
        } catch (e) {
            setCancelErr(e instanceof ApiError && e.message ? e.message : "Could not cancel this job.");
        } finally {
            setCancelling(false);
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
                {ticket && isStaff && ticket.status !== "paid" && ticket.status !== "cancelled" && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="ml-auto"
                        onClick={() => { setCancelReason(""); setCancelErr(""); setCancelOpen(true); }}
                    >
                        <Ban className="w-4 h-4 mr-1 text-destructive" /> Cancel
                    </Button>
                )}
            </header>

            <main className="p-4 max-w-md mx-auto space-y-4">
                {error && <p className="text-sm text-destructive">{error}</p>}
                {!ticket && !error && <p className="text-muted-foreground">Loading…</p>}

                {ticket && ticket.status === "cancelled" && (
                    <Card className="border-destructive/40">
                        <CardContent className="p-4 text-sm">
                            <span className="font-medium text-destructive">This job was cancelled.</span>
                            {ticket.cancel_reason && <div className="text-muted-foreground mt-1">Reason: {ticket.cancel_reason}</div>}
                        </CardContent>
                    </Card>
                )}

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
                                    {ticket.status !== "paid" && ticket.status !== "cancelled" && (
                                        <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
                                            Assign
                                        </Button>
                                    )}
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

                        <TicketPhotos orderId={ticket.id} />

                        <Card>
                            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                                <CardTitle className="text-sm">Estimate</CardTitle>
                                <div className="flex gap-2">
                                    {ticket.items && ticket.items.length > 0 &&
                                        (ticket.status === "triage" || ticket.status === "estimate" || ticket.status === "approved") && (
                                            <Button size="sm" variant="outline" onClick={printJobOrder}>
                                                <Printer className="h-4 w-4 mr-1" /> Job Order
                                            </Button>
                                        )}
                                    {(ticket.status === "triage" || ticket.status === "estimate") && (
                                        <Button size="sm" variant="outline" onClick={() => setEstimateOpen(true)}>
                                            <FileText className="h-4 w-4 mr-1" />
                                            {ticket.items && ticket.items.length > 0 ? "Edit" : "Create"}
                                        </Button>
                                    )}
                                </div>
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
                                            {ticket.senior_discount > 0 && (
                                                <div className="flex justify-between text-muted-foreground">
                                                    <span>Senior/PWD Disc. (20%){ticket.senior_pwd_id ? ` · ${ticket.senior_pwd_id}` : ""}</span>
                                                    <span>-{formatMoney(ticket.senior_discount, currency)}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between text-muted-foreground">
                                                <span>{ticket.senior_pwd_type ? "Tax (VAT-exempt)" : "Tax"}</span>
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

                        {ticket.status === "approved" && ticket.items && ticket.items.length > 0 && (
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm">Work</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <p className="text-sm text-muted-foreground">
                                        Approved — {ticket.items.length} task(s) ready. Start the job when you begin work.
                                    </p>
                                    <Button className="w-full" onClick={startJob}>Start Job</Button>
                                </CardContent>
                            </Card>
                        )}

                        {ticket.status === "in_progress" && ticket.items && ticket.items.length > 0 && (
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm">Work Checklist</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    {ticket.started_at && (
                                        <div className="text-xs text-muted-foreground">Started {elapsed(ticket.started_at)}</div>
                                    )}
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
                                    {ticket.started_at && ticket.completed_at && (
                                        <div className="text-xs text-muted-foreground">Time on job: {duration(ticket.started_at, ticket.completed_at)}</div>
                                    )}
                                    {(ticket.discount > 0 || ticket.senior_discount > 0) && (
                                        <div className="text-xs text-muted-foreground">
                                            {ticket.discount > 0 && `Discount -${formatMoney(ticket.discount, currency)}`}
                                            {ticket.senior_discount > 0 && `${ticket.discount > 0 ? " · " : ""}Senior/PWD -${formatMoney(ticket.senior_discount, currency)}`}
                                        </div>
                                    )}
                                    <div className="flex gap-2">
                                        <Button variant="outline" className="flex-1" onClick={() => downloadPdf(false)}>
                                            <FileText className="h-4 w-4 mr-1" /> Invoice PDF
                                        </Button>
                                        {ticket.status === "done" && isStaff && (
                                            <Button variant="outline" className="flex-1" onClick={() => setDiscountsOpen(true)}>
                                                Discounts
                                            </Button>
                                        )}
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
                        {isStaff && (
                            <DiscountsDialog
                                ticket={ticket}
                                open={discountsOpen}
                                onOpenChange={setDiscountsOpen}
                                onSaved={setTicket}
                            />
                        )}

                        <Dialog open={cancelOpen} onOpenChange={(o) => { if (!cancelling) setCancelOpen(o); }}>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Cancel this job?</DialogTitle>
                                    <DialogDescription>
                                        The ticket stays on record (marked Cancelled) — nothing is deleted. It leaves the active job board.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-1">
                                    <label htmlFor="creason" className="text-sm">Reason for cancelling <span className="text-destructive">*</span></label>
                                    <textarea
                                        id="creason"
                                        className="flex min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        placeholder="e.g. Customer declined the estimate"
                                        value={cancelReason}
                                        onChange={(e) => setCancelReason(e.target.value)}
                                    />
                                    {cancelErr && <p className="text-sm text-destructive">{cancelErr}</p>}
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={cancelling}>Keep Job</Button>
                                    <Button variant="destructive" onClick={cancelJob} disabled={cancelling || !cancelReason.trim()}>
                                        {cancelling ? "Cancelling…" : "Cancel Job"}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
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
