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
import type { AssetWithHistory } from "@zorviz/feature-repair";
import type { Customer } from "@zorviz/db";
import { createAsset } from "../../../lib/repair-api";
import { searchCustomers, createCustomer } from "../../../lib/customers-api";
import { listAssetTypes, type AssetType } from "../../../lib/asset-types-api";
import { iconFor } from "../../../lib/asset-icons";
import { EntityPicker } from "../../../components/entity-picker";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: (asset: AssetWithHistory) => void;
    // Convert-from-booking prefill (BACK-2-010): preselect an owner and show a note hint.
    initialOwner?: Customer | null;
    hint?: string;
}

// Data-driven asset creation (BACK-1-006): types + fields come from the shop's
// configured asset_types (only those flagged show_on_create). One type → no picker.
export function AssetCreateForm({ open, onOpenChange, onCreated, initialOwner, hint }: Props) {
    const [types, setTypes] = useState<AssetType[]>([]);
    const [typeKey, setTypeKey] = useState<string>("");
    const [specs, setSpecs] = useState<Record<string, string>>({});
    const [owner, setOwner] = useState<Customer | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    // Load the shop's creatable types whenever the dialog opens.
    useEffect(() => {
        if (!open) return;
        setSpecs({});
        setOwner(initialOwner ?? null);
        setError("");
        listAssetTypes()
            .then((all) => {
                const visible = all.filter((t) => t.show_on_create === 1);
                setTypes(visible);
                setTypeKey(visible[0]?.key ?? "");
            })
            .catch(() => setError("Could not load asset types."));
    }, [open]);

    const selected = types.find((t) => t.key === typeKey) ?? null;

    const submit = async () => {
        if (!selected) {
            setError("No asset type available.");
            return;
        }
        const filled = Object.fromEntries(Object.entries(specs).filter(([, v]) => v.trim() !== ""));
        // Required fields must be present.
        const missing = selected.fields.find((f) => f.required && !(specs[f.key] ?? "").trim());
        if (missing) {
            setError(`${missing.label} is required.`);
            return;
        }
        // number fields must be numeric when filled.
        const badNum = selected.fields.find(
            (f) => f.kind === "number" && (specs[f.key] ?? "").trim() && isNaN(Number(specs[f.key]))
        );
        if (badNum) {
            setError(`${badNum.label} must be a number.`);
            return;
        }
        if (Object.keys(filled).length === 0) {
            setError("Enter at least one detail.");
            return;
        }
        setSaving(true);
        setError("");
        try {
            const asset = await createAsset({ type: selected.key, specs: filled, ownerId: owner?.id });
            onCreated(asset);
            onOpenChange(false);
        } catch (e) {
            console.error(e);
            setError("Failed to create asset.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>New Asset</DialogTitle>
                    <DialogDescription>Register a new item to service.</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {hint && (
                        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                            <span className="font-medium">From booking:</span> {hint}
                        </div>
                    )}
                    {types.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No asset types are set to show at ticket creation. Add or enable one in Settings.
                        </p>
                    ) : (
                        <>
                            {types.length > 1 && (
                                <div className="grid grid-cols-3 gap-2">
                                    {types.map((t) => {
                                        const Icon = iconFor(t.icon);
                                        return (
                                            <button
                                                key={t.key}
                                                type="button"
                                                onClick={() => { setTypeKey(t.key); setSpecs({}); }}
                                                className={`flex flex-col items-center gap-1 rounded-md border p-3 transition-colors ${
                                                    typeKey === t.key ? "bg-primary/10 border-primary text-primary" : "hover:bg-muted"
                                                }`}
                                            >
                                                <Icon className="h-5 w-5" />
                                                <span className="text-xs font-medium">{t.name}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {selected && (
                                <div className="grid grid-cols-2 gap-3">
                                    {selected.fields.map((f) => (
                                        <div key={f.key} className="space-y-1">
                                            <Label htmlFor={`new-${f.key}`}>
                                                {f.label}
                                                {f.required && <span className="text-destructive"> *</span>}
                                            </Label>
                                            <Input
                                                id={`new-${f.key}`}
                                                inputMode={f.kind === "number" ? "numeric" : undefined}
                                                value={specs[f.key] ?? ""}
                                                onChange={(e) => setSpecs((s) => ({ ...s, [f.key]: e.target.value }))}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}

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
                        </>
                    )}

                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={saving || types.length === 0}>
                        {saving ? "Saving…" : "Create Asset"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
