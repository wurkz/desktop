import { useCallback, useEffect, useState } from "react";
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
import { ArrowLeft, CalendarPlus, Check, X, ArrowRight, Phone, Clock } from "lucide-react";
import type { AssetWithHistory } from "@zorviz/feature-repair";
import type { Customer } from "@zorviz/db";
import { useAuthStore } from "../stores/auth";
import { listBookings, createBooking, setBookingStatus, type Booking } from "../lib/bookings-api";
import { createCustomer } from "../lib/customers-api";
import { AssetCreateForm } from "../features/repair/components/AssetCreateForm";
import { IntakeForm } from "../features/repair/components/IntakeForm";
import { useConfirm } from "../components/confirm";

function fmtTime(ms: number): string {
    const d = new Date(ms);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
// epoch ms -> value for <input type="datetime-local"> (local, no seconds).
function toLocalInput(ms: number): string {
    const d = new Date(ms - new Date().getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
}

export default function BookingsPage() {
    const navigate = useNavigate();
    const role = useAuthStore((s) => s.user?.role);
    const isStaff = role === "owner" || role === "admin" || role === "advisor";

    const [bookings, setBookings] = useState<Booking[]>([]);
    const [creating, setCreating] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const askConfirm = useConfirm(); // named to avoid clashing with the local confirm() handler

    // New booking form
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [note, setNote] = useState("");
    const [when, setWhen] = useState(toLocalInput(Date.now() + 60 * 60 * 1000)); // default: +1h

    // Convert orchestration
    const [converting, setConverting] = useState<Booking | null>(null);
    const [convertOwner, setConvertOwner] = useState<Customer | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [intakeAsset, setIntakeAsset] = useState<AssetWithHistory | null>(null);

    const refresh = useCallback(() => {
        if (!isStaff) return;
        listBookings().then(setBookings).catch(() => {});
    }, [isStaff]);
    useEffect(() => refresh(), [refresh]);

    const openCreate = () => {
        setName("");
        setPhone("");
        setNote("");
        setWhen(toLocalInput(Date.now() + 60 * 60 * 1000));
        setError("");
        setCreating(true);
    };

    const saveBooking = async () => {
        if (!name.trim() && !note.trim()) return setError("Add a customer name or a note.");
        if (!when) return setError("Pick a date and time.");
        if (!(await askConfirm({ title: "Save this booking?", verb: "Slide to save" }))) return;
        setBusy(true);
        setError("");
        try {
            await createBooking({
                customer_name: name.trim() || null,
                customer_phone: phone.trim() || null,
                note: note.trim() || null,
                scheduled_time: new Date(when).getTime(),
            });
            setCreating(false);
            refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save booking.");
        } finally {
            setBusy(false);
        }
    };

    const confirm = async (b: Booking) => {
        if (!(await askConfirm({ title: "Confirm this booking?", verb: "Slide to confirm" }))) return;
        await setBookingStatus(b.id, { status: "confirmed" }).catch(() => {});
        refresh();
    };
    const cancel = async (b: Booking) => {
        if (!(await askConfirm({ title: "Cancel this booking?", verb: "Slide to cancel", danger: true }))) return;
        await setBookingStatus(b.id, { status: "cancelled" }).catch(() => {});
        refresh();
    };

    // Convert: create the customer from the booking (if named), then drop into the
    // normal New Asset → Job Ticket flow, pre-filled.
    const startConvert = async (b: Booking) => {
        setConverting(b);
        let owner: Customer | null = null;
        if (b.customer_name?.trim()) {
            owner = await createCustomer({ name: b.customer_name.trim(), phone: b.customer_phone ?? undefined }).catch(() => null);
        }
        setConvertOwner(owner);
        setCreateOpen(true);
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <header className="px-4 py-3 bg-white dark:bg-slate-800 shadow-sm flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate("/")} className="p-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h1 className="text-lg font-bold">Bookings</h1>
                </div>
                {isStaff && (
                    <Button size="sm" onClick={openCreate}>
                        <CalendarPlus className="w-4 h-4 mr-1" /> New Booking
                    </Button>
                )}
            </header>

            <main className="p-4 max-w-md mx-auto space-y-3">
                {!isStaff && <p className="text-sm text-muted-foreground">Only front-desk staff can manage bookings.</p>}
                {isStaff && bookings.length === 0 && (
                    <p className="text-sm text-muted-foreground">No upcoming bookings. Tap "New Booking" to add a call-ahead.</p>
                )}

                {bookings.map((b) => (
                    <Card key={b.id}>
                        <CardContent className="p-4 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="font-medium truncate">{b.customer_name || "(no name)"}</div>
                                    {b.customer_phone && (
                                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Phone className="w-3 h-3" /> {b.customer_phone}
                                        </div>
                                    )}
                                </div>
                                <div className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                                    <Clock className="w-3 h-3" /> {fmtTime(b.scheduled_time)}
                                </div>
                            </div>
                            {b.note && <p className="text-sm">{b.note}</p>}
                            <div className="flex items-center gap-2 pt-1">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${b.status === "confirmed" ? "bg-blue-100 text-blue-700" : "bg-muted text-muted-foreground"}`}>
                                    {b.status}
                                </span>
                                <div className="ml-auto flex items-center gap-1">
                                    {b.status === "pending" && (
                                        <Button variant="outline" size="sm" onClick={() => confirm(b)}>
                                            <Check className="w-4 h-4 mr-1" /> Confirm
                                        </Button>
                                    )}
                                    <Button variant="outline" size="icon" onClick={() => cancel(b)} title="Cancel">
                                        <X className="w-4 h-4 text-destructive" />
                                    </Button>
                                    <Button size="sm" onClick={() => startConvert(b)}>
                                        Convert <ArrowRight className="w-4 h-4 ml-1" />
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </main>

            {/* New booking dialog */}
            <Dialog open={creating} onOpenChange={(o) => { if (!busy) setCreating(o); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>New Booking</DialogTitle>
                        <DialogDescription>A quick call-ahead. You'll add the asset when they arrive.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <Label htmlFor="b-name">Customer Name</Label>
                            <Input id="b-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Juan Dela Cruz" />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="b-phone">Phone</Label>
                            <Input id="b-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="b-note">Note</Label>
                            <textarea
                                id="b-note"
                                className="flex min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                placeholder="e.g. Toyota Vios — aircon not cold"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="b-when">Date & Time</Label>
                            <Input id="b-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
                        </div>
                        {error && <p className="text-sm text-destructive">{error}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreating(false)} disabled={busy}>Cancel</Button>
                        <Button onClick={saveBooking} disabled={busy}>{busy ? "Saving…" : "Save Booking"}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Convert step 1: create/select the asset (owner pre-filled from booking) */}
            <AssetCreateForm
                open={createOpen}
                onOpenChange={setCreateOpen}
                initialOwner={convertOwner}
                hint={converting?.note ?? undefined}
                onCreated={(asset) => {
                    setCreateOpen(false);
                    setIntakeAsset(asset);
                }}
            />

            {/* Convert step 2: intake → job ticket (complaint pre-filled from the note) */}
            <IntakeForm
                asset={intakeAsset}
                open={intakeAsset !== null}
                onOpenChange={(o) => { if (!o) setIntakeAsset(null); }}
                initialComplaint={converting?.note ?? undefined}
                onCreated={async () => {
                    if (converting) {
                        await setBookingStatus(converting.id, {
                            status: "completed",
                            asset_id: intakeAsset?.id ?? null,
                            customer_id: convertOwner?.id ?? null,
                        }).catch(() => {});
                    }
                }}
            />
        </div>
    );
}
