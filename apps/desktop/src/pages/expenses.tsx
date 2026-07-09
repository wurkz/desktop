import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
import { ArrowLeft, Plus, Wallet } from "lucide-react";
import { formatMoney, toCentavos, fromCentavos } from "@zorviz/core";
import {
    listExpenses,
    createExpense,
    voidExpense,
    EXPENSE_CATEGORIES,
    type Expense,
} from "../lib/financials-api";
import { listPayables, type Payable } from "../lib/inventory-api";
import { useAuthStore } from "../stores/auth";
import { useAppConfigStore } from "../stores/app-config";
import { useConfirm } from "../components/confirm";
import { toast } from "../stores/toast";

// BACK-3-010: money-out log. Staff record expenses; mistakes are voided (admin), never deleted.
export default function ExpensesPage() {
    const navigate = useNavigate();
    const role = useAuthStore((s) => s.user?.role);
    const isAdmin = role === "owner" || role === "admin";
    const currency = useAppConfigStore((s) => s.config?.currency_symbol ?? "");
    const confirm = useConfirm();

    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [addOpen, setAddOpen] = useState(false);

    // Add form
    const [category, setCategory] = useState("parts");
    const [amountStr, setAmountStr] = useState("");
    const [note, setNote] = useState("");
    const [fromDrawer, setFromDrawer] = useState(true);
    const [payables, setPayables] = useState<Payable[]>([]);
    const [settleId, setSettleId] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const refresh = useCallback(() => {
        listExpenses().then(setExpenses).catch(() => {}).finally(() => setLoaded(true));
    }, []);
    useEffect(() => refresh(), [refresh]);

    const openAdd = useCallback((presetSettleId?: string) => {
        setCategory("parts");
        setAmountStr("");
        setNote("");
        setFromDrawer(true);
        setSettleId(presetSettleId ?? "");
        setError("");
        setAddOpen(true);
        listPayables().then((pbs) => {
            setPayables(pbs);
            // Arriving via a payables-page Settle button: pre-fill the remaining balance.
            if (presetSettleId) {
                const pb = pbs.find((x) => x.id === presetSettleId);
                if (pb) setAmountStr(String(fromCentavos(pb.balance)));
                else setSettleId("");
            }
        }).catch(() => {});
    }, []);

    // Settle handoff from the payables report page. Cancel/save returns there, not here.
    const [fromSettle, setFromSettle] = useState(false);
    const location = useLocation();
    useEffect(() => {
        const settle = (location.state as { settlePayableId?: string } | null)?.settlePayableId;
        if (settle) {
            setFromSettle(true);
            openAdd(settle);
            navigate(".", { replace: true, state: null }); // consume so back/refresh doesn't re-open
        }
    }, [location.state, openAdd, navigate]);

    const closeAdd = useCallback(() => {
        setAddOpen(false);
        if (fromSettle) {
            setFromSettle(false);
            navigate("/reports/payables");
        }
    }, [fromSettle, navigate]);

    const amountC = toCentavos(parseFloat(amountStr) || 0);

    const save = async () => {
        if (amountC <= 0) return setError("Enter an amount.");
        const settling = category === "parts" && settleId ? payables.find((x) => x.id === settleId) : null;
        if (settling && amountC > settling.balance) {
            return setError(`More than the remaining balance owed (${formatMoney(settling.balance, currency)}).`);
        }
        if (!(await confirm({ title: "Record this expense?", verb: "Slide to record" }))) return;
        setSaving(true);
        setError("");
        try {
            await createExpense({
                category,
                amount: amountC,
                note: note.trim() || null,
                paid_from_drawer: fromDrawer,
                receive_adjustment_id: settling ? settleId : null,
            });
            if (settling && amountC < settling.balance) {
                toast(`Partial payment recorded — ${formatMoney(settling.balance - amountC, currency)} still owed`, "success");
            }
            closeAdd();
            refresh();
        } catch {
            setError("Could not record the expense.");
        } finally {
            setSaving(false);
        }
    };

    const doVoid = async (e: Expense) => {
        if (!(await confirm({ title: `Void this ${formatMoney(e.amount, currency)} expense?`, verb: "Slide to void", danger: true }))) return;
        try {
            await voidExpense(e.id);
            toast("Expense voided", "success");
            refresh();
        } catch {
            toast("Couldn't void the expense.", "error");
        }
    };

    const catLabel = (key: string) => EXPENSE_CATEGORIES.find((c) => c.key === key)?.label ?? key;

    return (
        <div className="min-h-screen bg-background">
            <header className="px-4 py-3 bg-card shadow-sm flex items-center gap-3">
                <button onClick={() => navigate("/")} className="p-2 -ml-2 rounded-lg hover:bg-muted">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <Wallet className="w-5 h-5 text-primary" />
                <h1 className="text-lg font-bold">Expenses</h1>
                <Button size="sm" className="ml-auto" onClick={() => openAdd()}>
                    <Plus className="w-4 h-4 mr-1" /> Add Expense
                </Button>
            </header>

            <main className="p-4 max-w-md mx-auto space-y-3">
                {loaded && expenses.length === 0 && (
                    <p className="text-muted-foreground text-center py-10">No expenses recorded yet.</p>
                )}
                {expenses.map((e) => (
                    <Card key={e.id} className={e.voided === 1 ? "opacity-60" : ""}>
                        <CardContent className="p-4 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-medium">{catLabel(e.category)}</span>
                                <span className={`font-semibold ${e.voided === 1 ? "line-through text-muted-foreground" : ""}`}>
                                    {formatMoney(e.amount, currency)}
                                </span>
                            </div>
                            {e.note && <div className="text-sm text-muted-foreground">{e.note}</div>}
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>
                                    {new Date(e.created_at).toLocaleString()}
                                    {e.author ? ` · ${e.author}` : ""}
                                    {e.paid_from_drawer === 1 ? " · from drawer" : ""}
                                    {e.voided === 1 ? ` · VOIDED${e.voided_by ? ` by ${e.voided_by}` : ""}` : ""}
                                </span>
                                {isAdmin && e.voided === 0 && (
                                    <button className="text-destructive hover:underline" onClick={() => doVoid(e)}>
                                        Void
                                    </button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </main>

            <Dialog open={addOpen} onOpenChange={(o) => { if (!saving && !o) closeAdd(); }}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Add Expense</DialogTitle>
                        <DialogDescription>Money going out — feeds the profit picture and the drawer count.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <Label>Category</Label>
                            <div className="grid grid-cols-2 gap-2">
                                {EXPENSE_CATEGORIES.map((c) => (
                                    <button
                                        key={c.key}
                                        type="button"
                                        onClick={() => setCategory(c.key)}
                                        className={`rounded-md border p-2 text-sm text-left transition-colors ${
                                            category === c.key ? "bg-primary/10 border-primary text-primary" : "hover:bg-muted"
                                        }`}
                                    >
                                        {c.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="exp-amount">Amount</Label>
                            <Input id="exp-amount" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} inputMode="decimal" placeholder="0.00" autoFocus />
                        </div>
                        {category === "parts" && payables.length > 0 && (
                            <div className="space-y-1">
                                <Label htmlFor="exp-settle">Pays for a stock receive <span className="text-muted-foreground font-normal">(optional)</span></Label>
                                <select
                                    id="exp-settle"
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                    value={settleId}
                                    onChange={(e) => {
                                        setSettleId(e.target.value);
                                        const pb = payables.find((x) => x.id === e.target.value);
                                        if (pb && !amountStr) setAmountStr(String(fromCentavos(pb.balance)));
                                    }}
                                >
                                    <option value="">{"\u2014 not settling a payable \u2014"}</option>
                                    {payables.map((pb) => (
                                        <option key={pb.id} value={pb.id}>
                                            {pb.supplier ? `${pb.supplier} \u00b7 ` : ""}{pb.item_name} ({pb.sku}) {"\u00b7"} {formatMoney(pb.balance, currency)} owed {"\u00b7"} {new Date(pb.created_at).toLocaleDateString()}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-xs text-muted-foreground">
                                    Paying the full balance clears the payable; paying less leaves the rest outstanding.
                                </p>
                            </div>
                        )}
                        <div className="space-y-1">
                            <Label htmlFor="exp-note">Note</Label>
                            <Input id="exp-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. compressor from AutoParts PH" />
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-sm font-medium">Paid from the drawer</div>
                                <div className="text-xs text-muted-foreground">Counts against today's cash when closing the day.</div>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={fromDrawer}
                                aria-label="Paid from the drawer"
                                onClick={() => setFromDrawer((v) => !v)}
                                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${fromDrawer ? "bg-primary" : "bg-muted"}`}
                            >
                                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${fromDrawer ? "translate-x-[22px]" : "translate-x-0.5"}`} />
                            </button>
                        </div>
                        {error && <p className="text-sm text-destructive">{error}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeAdd} disabled={saving}>Cancel</Button>
                        <Button onClick={save} disabled={saving || amountC <= 0}>{saving ? "Saving…" : "Save Expense"}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
