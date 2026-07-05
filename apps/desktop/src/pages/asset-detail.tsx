import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    Button,
    Card,
    CardHeader,
    CardTitle,
    CardContent,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@zorviz/ui";
import { ArrowLeft, Car, Smartphone, Package, Pencil, Trash2 } from "lucide-react";
import { formatMoney } from "@zorviz/core";
import { getAsset, deleteAsset, type AssetDetail } from "../lib/repair-api";
import { ApiError } from "../lib/api";
import { StatusBadge } from "../components/status-badge";
import { AssetEditForm } from "../features/repair/components/AssetEditForm";
import { useAppConfigStore } from "../stores/app-config";

const TYPE_ICON: Record<string, typeof Car> = { vehicle: Car, gadget: Smartphone, appliance: Package };

// Human labels for common spec keys; anything else falls back to the raw key.
const SPEC_LABELS: Record<string, string> = {
    plateNumber: "Plate Number",
    vin: "VIN",
    make: "Make",
    model: "Model",
    year: "Year",
    color: "Color",
    mileage: "Mileage",
    brand: "Brand",
    serialNumber: "Serial Number",
    imei: "IMEI",
};

function assetTitle(a: AssetDetail): string {
    const s = a.specs as Record<string, string>;
    return s.plateNumber || s.serialNumber || s.imei || [s.make, s.model].filter(Boolean).join(" ") || "Asset";
}

export default function AssetDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const currency = useAppConfigStore((s) => s.config?.currency_symbol ?? "");
    const [asset, setAsset] = useState<AssetDetail | null>(null);
    const [error, setError] = useState("");
    const [editOpen, setEditOpen] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState("");

    const load = useCallback(() => {
        if (!id) return;
        getAsset(id).then(setAsset).catch(() => setError("Could not load this asset."));
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    const doDelete = async () => {
        if (!id) return;
        setDeleting(true);
        setDeleteError("");
        try {
            await deleteAsset(id);
            navigate("/repair");
        } catch (e) {
            setDeleteError(
                e instanceof ApiError && e.message ? e.message : "Could not delete this asset."
            );
        } finally {
            setDeleting(false);
        }
    };

    const Icon = asset ? TYPE_ICON[asset.type] ?? Package : Package;
    const specEntries = asset
        ? Object.entries(asset.specs).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
        : [];

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <header className="px-4 py-3 bg-white dark:bg-slate-800 shadow-sm flex items-center gap-3">
                <button onClick={() => navigate("/repair")} className="p-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <h1 className="text-lg font-bold">Asset</h1>
                {asset && (
                    <div className="ml-auto flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                            <Pencil className="w-4 h-4 mr-1" /> Edit
                        </Button>
                        <Button variant="outline" size="icon" onClick={() => { setDeleteError(""); setConfirmDelete(true); }}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                    </div>
                )}
            </header>

            <main className="p-4 max-w-md mx-auto space-y-4">
                {error && <p className="text-sm text-destructive">{error}</p>}
                {!asset && !error && <p className="text-muted-foreground">Loading…</p>}

                {asset && (
                    <>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Icon className="w-5 h-5" />
                                    {assetTitle(asset)}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="text-sm space-y-1">
                                <div className="capitalize text-muted-foreground">{asset.type}</div>
                                {asset.owner && (
                                    <div>
                                        Owner: {asset.owner.name}
                                        {asset.owner.phone ? ` · ${asset.owner.phone}` : ""}
                                    </div>
                                )}
                                <div className="pt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                                    {specEntries.map(([k, v]) => (
                                        <div key={k} className="flex flex-col">
                                            <span className="text-xs text-muted-foreground">{SPEC_LABELS[k] ?? k}</span>
                                            <span>{String(v)}</span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm">Service History</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                {asset.history.length === 0 ? (
                                    <p className="p-4 text-sm text-muted-foreground">No past jobs.</p>
                                ) : (
                                    <div className="divide-y">
                                        {asset.history.map((h) => (
                                            <button
                                                key={h.id}
                                                onClick={() => navigate(`/repair/ticket/${h.id}`)}
                                                className="w-full text-left p-3 hover:bg-muted flex items-center justify-between gap-2"
                                            >
                                                <div className="min-w-0">
                                                    <div className="text-sm truncate">
                                                        {h.customer_complaint || h.receipt_number || "Job ticket"}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {new Date(h.created_at).toLocaleDateString()}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <span className="text-sm">{formatMoney(h.total, currency)}</span>
                                                    <StatusBadge status={h.status} />
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </>
                )}
            </main>

            {asset && (
                <AssetEditForm
                    open={editOpen}
                    onOpenChange={setEditOpen}
                    asset={asset}
                    onUpdated={() => load()}
                />
            )}

            <Dialog open={confirmDelete} onOpenChange={(o) => { if (!deleting) setConfirmDelete(o); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete this asset?</DialogTitle>
                        <DialogDescription>
                            It will be hidden from search. Its past job tickets and their data stay intact.
                        </DialogDescription>
                    </DialogHeader>
                    {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={doDelete} disabled={deleting}>
                            {deleting ? "Deleting…" : "Delete"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
