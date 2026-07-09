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
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { formatMoney } from "@zorviz/core";
import { getAsset, deleteAsset, type AssetDetail } from "../lib/repair-api";
import { listAssetTypes, type AssetType, type FieldDef } from "../lib/asset-types-api";
import { ApiError } from "../lib/api";
import { iconFor } from "../lib/asset-icons";
import { StatusBadge } from "../components/status-badge";
import { AssetEditForm } from "../features/repair/components/AssetEditForm";
import { useAppConfigStore } from "../stores/app-config";
import { useAuthStore } from "../stores/auth";
import { useSmartBack } from "../lib/use-smart-back";

// A display label for the asset: first filled field (in the type's field order), else
// the first non-empty spec value, else a generic label.
function assetTitle(a: AssetDetail, fields: FieldDef[]): string {
    const s = a.specs as Record<string, unknown>;
    for (const f of fields) {
        const v = s[f.key];
        if (v !== null && v !== undefined && String(v).trim()) return String(v);
    }
    const first = Object.values(s).find((v) => v !== null && v !== undefined && String(v).trim());
    return first ? String(first) : "Asset";
}

export default function AssetDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const goBack = useSmartBack();
    const currency = useAppConfigStore((s) => s.config?.currency_symbol ?? "");
    // Mechanics may reach asset detail from a job ticket for service history, but can't
    // edit/delete the asset (BACK-2-015).
    const canEdit = useAuthStore((s) => s.user?.role !== "mechanic");
    const [asset, setAsset] = useState<AssetDetail | null>(null);
    const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
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

    // Load the shop's asset types once, to render labels/icon from the matching definition.
    useEffect(() => {
        listAssetTypes().then(setAssetTypes).catch(() => {});
    }, []);

    const doDelete = async () => {
        if (!id) return;
        setDeleting(true);
        setDeleteError("");
        try {
            await deleteAsset(id);
            // Replace, not push: the deleted asset's page must not stay in history
            // (Back would land on a dead record).
            navigate("/repair", { replace: true });
        } catch (e) {
            setDeleteError(
                e instanceof ApiError && e.message ? e.message : "Could not delete this asset."
            );
        } finally {
            setDeleting(false);
        }
    };

    const matchedType = asset ? assetTypes.find((t) => t.key === asset.type) ?? null : null;
    const Icon = iconFor(matchedType?.icon);
    // Spec rows to show: driven by the type's field defs (label + order); fall back to the
    // asset's raw spec keys when the type was removed. Empty values are skipped.
    const specRows: { label: string; value: string }[] = asset
        ? matchedType
            ? matchedType.fields
                  .map((f) => ({ label: f.label, value: String((asset.specs as Record<string, unknown>)[f.key] ?? "") }))
                  .filter((r) => r.value.trim() !== "")
            : Object.entries(asset.specs)
                  .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
                  .map(([k, v]) => ({ label: k, value: String(v) }))
        : [];

    return (
        <div className="min-h-screen bg-background">
            <header className="px-4 py-3 bg-card shadow-sm flex items-center gap-3">
                <button onClick={goBack} className="p-2 -ml-2 rounded-lg hover:bg-muted">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <h1 className="text-lg font-bold">Asset</h1>
                {asset && canEdit && (
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
                                    {assetTitle(asset, matchedType?.fields ?? [])}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="text-sm space-y-1">
                                <div className="capitalize text-muted-foreground">{matchedType?.name ?? asset.type}</div>
                                {asset.owner && (
                                    <div>
                                        Owner: {asset.owner.name}
                                        {asset.owner.phone ? ` · ${asset.owner.phone}` : ""}
                                    </div>
                                )}
                                <div className="pt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                                    {specRows.map((r) => (
                                        <div key={r.label} className="flex flex-col">
                                            <span className="text-xs text-muted-foreground">{r.label}</span>
                                            <span>{r.value}</span>
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
                    assetType={matchedType}
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
