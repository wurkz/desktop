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
import { Car, Smartphone, Package } from "lucide-react";
import type { Customer } from "@zorviz/db";
import { updateAsset, type AssetDetail } from "../../../lib/repair-api";
import { searchCustomers, createCustomer } from "../../../lib/customers-api";
import { EntityPicker } from "../../../components/entity-picker";
import { SPEC_FIELDS, type AssetType } from "./AssetCreateForm";

const TYPE_META: Record<AssetType, { label: string; icon: typeof Car }> = {
    vehicle: { label: "Vehicle", icon: Car },
    gadget: { label: "Gadget", icon: Smartphone },
    appliance: { label: "Appliance", icon: Package },
};

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    asset: AssetDetail;
    onUpdated: (asset: AssetDetail) => void;
}

// Edit an existing asset. Type is fixed (a shop's asset kind is fixed) — only the
// spec details and the owner can change.
export function AssetEditForm({ open, onOpenChange, asset, onUpdated }: Props) {
    const type = (asset.type as AssetType) in SPEC_FIELDS ? (asset.type as AssetType) : "vehicle";
    const [specs, setSpecs] = useState<Record<string, string>>({});
    const [owner, setOwner] = useState<Customer | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    // Prefill from the asset whenever the dialog opens (or the asset changes).
    useEffect(() => {
        if (!open) return;
        const s: Record<string, string> = {};
        for (const [k, v] of Object.entries(asset.specs ?? {})) {
            if (v !== null && v !== undefined) s[k] = String(v);
        }
        setSpecs(s);
        setOwner(asset.owner ? ({ id: asset.owner.id, name: asset.owner.name, phone: asset.owner.phone } as Customer) : null);
        setError("");
    }, [open, asset]);

    const submit = async () => {
        const filled = Object.fromEntries(Object.entries(specs).filter(([, v]) => v.trim() !== ""));
        if (Object.keys(filled).length === 0) {
            setError("Enter at least one detail (e.g. plate or serial number).");
            return;
        }
        setSaving(true);
        setError("");
        try {
            const updated = await updateAsset(asset.id, { specs: filled, ownerId: owner?.id ?? null });
            onUpdated(updated);
            onOpenChange(false);
        } catch (e) {
            console.error(e);
            setError("Failed to save changes.");
        } finally {
            setSaving(false);
        }
    };

    const meta = TYPE_META[type];
    const TypeIcon = meta.icon;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit Asset</DialogTitle>
                    <DialogDescription>Correct the details or change the owner.</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm">
                        <TypeIcon className="h-5 w-5 text-muted-foreground" />
                        <span className="font-medium">{meta.label}</span>
                        <span className="ml-auto text-xs text-muted-foreground">Type can't be changed</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        {SPEC_FIELDS[type].map(([key, label]) => (
                            <div key={key} className="space-y-1">
                                <Label htmlFor={`edit-${key}`}>{label}</Label>
                                <Input
                                    id={`edit-${key}`}
                                    value={specs[key] ?? ""}
                                    onChange={(e) => setSpecs((s) => ({ ...s, [key]: e.target.value }))}
                                />
                            </div>
                        ))}
                    </div>

                    <div className="space-y-1">
                        <Label>Owner (optional)</Label>
                        <EntityPicker<Customer>
                            value={owner}
                            onChange={setOwner}
                            search={searchCustomers}
                            onCreate={(name) => createCustomer({ name })}
                            getLabel={(c) => c.name}
                            getSubLabel={(c) => c.phone ?? undefined}
                            placeholder="Search or add a customer…"
                        />
                    </div>

                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={saving}>
                        {saving ? "Saving…" : "Save Changes"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
