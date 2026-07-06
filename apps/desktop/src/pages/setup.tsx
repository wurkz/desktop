import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Input, Label, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@zorviz/ui";
import { Store, ListPlus, Coins, UserCog, Plus, Trash2, Shapes } from "lucide-react";
import { api } from "../lib/api";
import { useAppConfigStore } from "../stores/app-config";
import { getAssetTypeTemplates, type AssetTypeTemplate } from "../lib/asset-types-api";
import { iconFor } from "../lib/asset-icons";

type CustomField = { label: string; value: string };

const STEPS = [
    { title: "Shop Details", icon: Store },
    { title: "Custom Fields", icon: ListPlus },
    { title: "Currency & Tax", icon: Coins },
    { title: "What You Service", icon: Shapes },
    { title: "Admin Account", icon: UserCog },
];

export default function SetupPage() {
    const navigate = useNavigate();
    const fetchConfig = useAppConfigStore((s) => s.fetchConfig);

    const [step, setStep] = useState(0);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    // Shop details
    const [shopName, setShopName] = useState("");
    const [address, setAddress] = useState("");
    const [contactPhone, setContactPhone] = useState("");
    const [contactEmail, setContactEmail] = useState("");
    const [taxRegId, setTaxRegId] = useState("");

    // Custom fields
    const [customFields, setCustomFields] = useState<CustomField[]>([]);

    // Currency & tax
    const [currencySymbol, setCurrencySymbol] = useState("");
    const [locale, setLocale] = useState("");
    const [taxRatePct, setTaxRatePct] = useState("");

    // Asset types (BACK-1-006): built-in templates, all pre-selected.
    const [templates, setTemplates] = useState<AssetTypeTemplate[]>([]);
    const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
    useEffect(() => {
        getAssetTypeTemplates()
            .then((t) => {
                setTemplates(t);
                setSelectedTypes(new Set(t.map((x) => x.key)));
            })
            .catch(() => {});
    }, []);

    // Admin
    const [adminName, setAdminName] = useState("");
    const [username, setUsername] = useState("");
    const [pin, setPin] = useState("");
    const [confirmPin, setConfirmPin] = useState("");

    const validateStep = (s: number): string => {
        if (s === 0 && !shopName.trim()) return "Shop name is required.";
        if (s === 2 && !currencySymbol.trim()) return "Currency symbol is required.";
        if (s === 2 && taxRatePct.trim() && isNaN(Number(taxRatePct))) return "Tax rate must be a number.";
        if (s === 3 && selectedTypes.size === 0) return "Pick at least one thing you service.";
        if (s === 4) {
            if (!adminName.trim()) return "Your name is required.";
            if (!username.trim()) return "Username is required.";
            if (!/^\d{6}$/.test(pin)) return "PIN must be exactly 6 digits.";
            if (pin !== confirmPin) return "PINs do not match.";
        }
        return "";
    };

    const next = () => {
        const err = validateStep(step);
        if (err) return setError(err);
        setError("");
        setStep((s) => Math.min(s + 1, STEPS.length - 1));
    };

    const back = () => {
        setError("");
        setStep((s) => Math.max(s - 1, 0));
    };

    const updateField = (i: number, key: keyof CustomField, val: string) => {
        setCustomFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, [key]: val } : f)));
    };

    const finish = async () => {
        const err = validateStep(4);
        if (err) return setError(err);
        setSaving(true);
        setError("");
        try {
            const cleanCustom = customFields.filter((f) => f.label.trim());
            const customFieldsObj = cleanCustom.length
                ? Object.fromEntries(cleanCustom.map((f) => [f.label.trim(), f.value.trim()]))
                : null;

            const assetTypes = templates
                .filter((t) => selectedTypes.has(t.key))
                .map((t) => ({ key: t.key, name: t.name, icon: t.icon, fields: t.fields, show_on_create: true }));

            await api.post("/api/setup", {
                asset_types: assetTypes,
                shop_name: shopName.trim(),
                currency_symbol: currencySymbol.trim(),
                locale: locale.trim() || "en-US",
                tax_rate: taxRatePct.trim() ? Number(taxRatePct) / 100 : null,
                address: address.trim() || null,
                contact_phone: contactPhone.trim() || null,
                contact_email: contactEmail.trim() || null,
                tax_registration_id: taxRegId.trim() || null,
                custom_fields: customFieldsObj,
                admin_name: adminName.trim(),
                admin_username: username.trim(),
                admin_pin: pin,
            });

            await fetchConfig();
            navigate("/login");
        } catch (e) {
            console.error(e);
            setError("Failed to save setup. Please try again.");
            setSaving(false);
        }
    };

    const StepIcon = STEPS[step].icon;

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="w-full max-w-lg">
                <CardHeader>
                    <div className="flex justify-center mb-2">
                        <div className="p-3 bg-primary/10 rounded-full">
                            <StepIcon className="w-7 h-7 text-primary" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl text-center">Welcome to Zorviz</CardTitle>
                    <CardDescription className="text-center">
                        Step {step + 1} of {STEPS.length} — {STEPS[step].title}
                    </CardDescription>
                    <div className="flex gap-1 justify-center mt-3">
                        {STEPS.map((_, i) => (
                            <div key={i} className={`h-1.5 w-10 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
                        ))}
                    </div>
                </CardHeader>

                <CardContent className="space-y-4">
                    {step === 0 && (
                        <>
                            <div className="space-y-2">
                                <Label htmlFor="shopName">Shop Name *</Label>
                                <Input id="shopName" value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="e.g. Aling Nena Auto Repair" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="address">Address</Label>
                                <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <Label htmlFor="phone">Contact Phone</Label>
                                    <Input id="phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="cemail">Contact Email</Label>
                                    <Input id="cemail" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="taxreg">Tax / Registration ID</Label>
                                <Input id="taxreg" value={taxRegId} onChange={(e) => setTaxRegId(e.target.value)} placeholder="e.g. TIN" />
                            </div>
                        </>
                    )}

                    {step === 1 && (
                        <div className="space-y-3">
                            <p className="text-sm text-muted-foreground">
                                Optional extra fields to print on invoices/headers (e.g. "Permit No.", "Facebook page").
                            </p>
                            {customFields.map((f, i) => (
                                <div key={i} className="flex gap-2 items-end">
                                    <div className="flex-1 space-y-1">
                                        <Label>Label</Label>
                                        <Input value={f.label} onChange={(e) => updateField(i, "label", e.target.value)} />
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <Label>Value</Label>
                                        <Input value={f.value} onChange={(e) => updateField(i, "value", e.target.value)} />
                                    </div>
                                    <Button variant="outline" size="icon" onClick={() => setCustomFields((prev) => prev.filter((_, idx) => idx !== i))}>
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                            <Button variant="outline" size="sm" onClick={() => setCustomFields((prev) => [...prev, { label: "", value: "" }])}>
                                <Plus className="w-4 h-4 mr-2" /> Add Field
                            </Button>
                        </div>
                    )}

                    {step === 2 && (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <Label htmlFor="currency">Currency Symbol *</Label>
                                    <Input id="currency" value={currencySymbol} onChange={(e) => setCurrencySymbol(e.target.value)} placeholder="e.g. ₱ or $" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="locale">Locale</Label>
                                    <Input id="locale" value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="e.g. en-PH" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="tax">Tax Rate (%)</Label>
                                <Input id="tax" value={taxRatePct} onChange={(e) => setTaxRatePct(e.target.value)} placeholder="e.g. 12 — leave blank for none" />
                            </div>
                        </>
                    )}

                    {step === 3 && (
                        <div className="space-y-3">
                            <p className="text-sm text-muted-foreground">
                                Pick what this shop repairs. This is all you'll be offered when creating a ticket —
                                you can fine-tune types and their fields anytime in Settings.
                            </p>
                            {templates.map((t) => {
                                const Icon = iconFor(t.icon);
                                const checked = selectedTypes.has(t.key);
                                return (
                                    <button
                                        key={t.key}
                                        type="button"
                                        onClick={() =>
                                            setSelectedTypes((prev) => {
                                                const n = new Set(prev);
                                                if (n.has(t.key)) n.delete(t.key);
                                                else n.add(t.key);
                                                return n;
                                            })
                                        }
                                        className={`w-full flex items-center gap-3 rounded-md border p-3 text-left transition-colors ${
                                            checked ? "bg-primary/10 border-primary" : "hover:bg-muted"
                                        }`}
                                    >
                                        <input type="checkbox" className="h-4 w-4" checked={checked} readOnly />
                                        <Icon className="w-5 h-5 text-muted-foreground" />
                                        <div>
                                            <div className="font-medium">{t.name}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {t.fields.map((f) => f.label).join(", ")}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                            <p className="text-xs text-muted-foreground">
                                Repair something else? Finish setup, then add a custom type in Settings.
                            </p>
                        </div>
                    )}

                    {step === 4 && (
                        <>
                            <div className="space-y-2">
                                <Label htmlFor="adminName">Your Name *</Label>
                                <Input id="adminName" value={adminName} onChange={(e) => setAdminName(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="username">Username *</Label>
                                <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="used to log in" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <Label htmlFor="pin">PIN * (6 digits)</Label>
                                    <Input id="pin" type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="cpin">Confirm PIN *</Label>
                                    <Input id="cpin" type="password" inputMode="numeric" maxLength={6} value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} />
                                </div>
                            </div>
                        </>
                    )}

                    {error && <p className="text-sm text-destructive">{error}</p>}
                </CardContent>

                <CardFooter className="flex justify-between">
                    <Button variant="outline" onClick={back} disabled={step === 0 || saving}>Back</Button>
                    {step < STEPS.length - 1 ? (
                        <Button onClick={next}>Next</Button>
                    ) : (
                        <Button onClick={finish} disabled={saving}>{saving ? "Setting up…" : "Finish Setup"}</Button>
                    )}
                </CardFooter>
            </Card>
        </div>
    );
}
