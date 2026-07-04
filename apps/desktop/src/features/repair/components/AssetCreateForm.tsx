import { useState } from "react";
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
import type { AssetWithHistory } from "@zorviz/feature-repair";
import type { Customer } from "@zorviz/db";
import { createAsset } from "../../../lib/repair-api";
import { searchCustomers, createCustomer } from "../../../lib/customers-api";
import { EntityPicker } from "../../../components/entity-picker";

type AssetType = "vehicle" | "gadget" | "appliance";

// Spec fields per asset type: [key, label].
const SPEC_FIELDS: Record<AssetType, [string, string][]> = {
    vehicle: [
        ["plateNumber", "Plate Number"],
        ["vin", "VIN"],
        ["make", "Make"],
        ["model", "Model"],
        ["year", "Year"],
        ["color", "Color"],
        ["mileage", "Mileage"],
    ],
    gadget: [
        ["brand", "Brand"],
        ["model", "Model"],
        ["serialNumber", "Serial Number"],
        ["imei", "IMEI"],
        ["color", "Color"],
    ],
    appliance: [
        ["brand", "Brand"],
        ["model", "Model"],
        ["serialNumber", "Serial Number"],
    ],
};

const TYPES: { key: AssetType; label: string; icon: typeof Car }[] = [
    { key: "vehicle", label: "Vehicle", icon: Car },
    { key: "gadget", label: "Gadget", icon: Smartphone },
    { key: "appliance", label: "Appliance", icon: Package },
];

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: (asset: AssetWithHistory) => void;
}

export function AssetCreateForm({ open, onOpenChange, onCreated }: Props) {
    const [type, setType] = useState<AssetType>("vehicle");
    const [specs, setSpecs] = useState<Record<string, string>>({});
    const [owner, setOwner] = useState<Customer | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const reset = () => {
        setType("vehicle");
        setSpecs({});
        setOwner(null);
        setError("");
    };

    const submit = async () => {
        const filled = Object.fromEntries(
            Object.entries(specs).filter(([, v]) => v.trim() !== "")
        );
        if (Object.keys(filled).length === 0) {
            setError("Enter at least one detail (e.g. plate or serial number).");
            return;
        }
        setSaving(true);
        setError("");
        try {
            const asset = await createAsset({ type, specs: filled, ownerId: owner?.id });
            onCreated(asset);
            reset();
            onOpenChange(false);
        } catch (e) {
            console.error(e);
            setError("Failed to create asset.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>New Asset</DialogTitle>
                    <DialogDescription>Register a vehicle, gadget, or appliance.</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-2">
                        {TYPES.map((t) => (
                            <button
                                key={t.key}
                                type="button"
                                onClick={() => setType(t.key)}
                                className={`flex flex-col items-center gap-1 rounded-md border p-3 transition-colors ${
                                    type === t.key ? "bg-primary/10 border-primary text-primary" : "hover:bg-muted"
                                }`}
                            >
                                <t.icon className="h-5 w-5" />
                                <span className="text-xs font-medium">{t.label}</span>
                            </button>
                        ))}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        {SPEC_FIELDS[type].map(([key, label]) => (
                            <div key={key} className="space-y-1">
                                <Label htmlFor={key}>{label}</Label>
                                <Input
                                    id={key}
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
                        {saving ? "Saving…" : "Create Asset"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
