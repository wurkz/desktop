import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Input, Label, Card, CardHeader, CardTitle, CardContent } from "@zorviz/ui";
import { ArrowLeft, Store, Coins, Monitor, ListPlus, Plus, Trash2, Image as ImageIcon } from "lucide-react";
import { useAuthStore } from "../stores/auth";
import { useAppConfigStore } from "../stores/app-config";
import { AssetTypesSettings } from "../features/repair/components/AssetTypesSettings";
import { logoUrl, uploadLogo, deleteLogo } from "../lib/logo-api";

type CustomField = { label: string; value: string };

export default function SettingsPage() {
    const navigate = useNavigate();
    const currentUser = useAuthStore((s) => s.user);
    const isAdmin = currentUser?.role === "admin" || currentUser?.role === "owner";

    const config = useAppConfigStore((s) => s.config);
    const fetchConfig = useAppConfigStore((s) => s.fetchConfig);
    const updateConfig = useAppConfigStore((s) => s.updateConfig);

    // Shop details
    const [shopName, setShopName] = useState("");
    const [address, setAddress] = useState("");
    const [contactPhone, setContactPhone] = useState("");
    const [contactEmail, setContactEmail] = useState("");
    const [taxRegId, setTaxRegId] = useState("");
    // Currency & tax
    const [currencySymbol, setCurrencySymbol] = useState("");
    const [locale, setLocale] = useState("");
    const [taxRatePct, setTaxRatePct] = useState("");
    // Device
    const [deviceName, setDeviceName] = useState("");
    // Custom fields
    const [customFields, setCustomFields] = useState<CustomField[]>([]);

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [saved, setSaved] = useState(false);

    // Logo (BACK-0-013)
    const fileInput = useRef<HTMLInputElement>(null);
    const [logoBusy, setLogoBusy] = useState(false);
    const [logoErr, setLogoErr] = useState("");

    const onLogoPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = ""; // allow re-picking the same file
        if (!file) return;
        setLogoErr("");
        if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) {
            setLogoErr("Use a PNG, JPG, WEBP or GIF image.");
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            setLogoErr("Image too large (max 2 MB).");
            return;
        }
        const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
        setLogoBusy(true);
        try {
            const dataUrl: string = await new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload = () => resolve(r.result as string);
                r.onerror = () => reject(new Error("read failed"));
                r.readAsDataURL(file);
            });
            await uploadLogo(dataUrl, ext);
            await fetchConfig();
        } catch (err) {
            setLogoErr(err instanceof Error ? err.message : "Upload failed.");
        } finally {
            setLogoBusy(false);
        }
    };

    const onLogoRemove = async () => {
        setLogoBusy(true);
        setLogoErr("");
        try {
            await deleteLogo();
            await fetchConfig();
        } catch (err) {
            setLogoErr(err instanceof Error ? err.message : "Remove failed.");
        } finally {
            setLogoBusy(false);
        }
    };

    // Ensure we have config (e.g. hard refresh into /settings), then hydrate the form.
    useEffect(() => {
        if (!config) fetchConfig();
    }, [config, fetchConfig]);

    useEffect(() => {
        if (!config) return;
        setShopName(config.shop_name ?? "");
        setAddress(config.address ?? "");
        setContactPhone(config.contact_phone ?? "");
        setContactEmail(config.contact_email ?? "");
        setTaxRegId(config.tax_registration_id ?? "");
        setCurrencySymbol(config.currency_symbol ?? "");
        setLocale(config.locale ?? "");
        setTaxRatePct(config.tax_rate != null ? String(config.tax_rate * 100) : "");
        setDeviceName(config.device_name ?? "");
        let cf: CustomField[] = [];
        if (config.custom_fields) {
            try {
                const obj = JSON.parse(config.custom_fields) as Record<string, string>;
                cf = Object.entries(obj).map(([label, value]) => ({ label, value }));
            } catch {
                cf = [];
            }
        }
        setCustomFields(cf);
    }, [config]);

    const updateField = (i: number, key: keyof CustomField, val: string) => {
        setCustomFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, [key]: val } : f)));
    };

    const validate = (): string => {
        if (!shopName.trim()) return "Shop name is required.";
        if (!currencySymbol.trim()) return "Currency symbol is required.";
        if (!deviceName.trim()) return "Device name is required.";
        if (taxRatePct.trim() && isNaN(Number(taxRatePct))) return "Tax rate must be a number.";
        return "";
    };

    const save = async () => {
        const err = validate();
        if (err) {
            setError(err);
            setSaved(false);
            return;
        }
        setSaving(true);
        setError("");
        setSaved(false);
        try {
            const cleanCustom = customFields.filter((f) => f.label.trim());
            const customFieldsObj = cleanCustom.length
                ? Object.fromEntries(cleanCustom.map((f) => [f.label.trim(), f.value.trim()]))
                : null;
            await updateConfig({
                shop_name: shopName.trim(),
                device_name: deviceName.trim(),
                currency_symbol: currencySymbol.trim(),
                locale: locale.trim() || "en-US",
                tax_rate: taxRatePct.trim() ? Number(taxRatePct) / 100 : null,
                address: address.trim() || null,
                contact_phone: contactPhone.trim() || null,
                contact_email: contactEmail.trim() || null,
                tax_registration_id: taxRegId.trim() || null,
                custom_fields: customFieldsObj,
            });
            setSaved(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Save failed.");
        } finally {
            setSaving(false);
        }
    };

    const ro = !isAdmin;

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <header className="px-4 py-3 bg-white dark:bg-slate-800 shadow-sm flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate("/")} className="p-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h1 className="text-lg font-bold">Settings</h1>
                </div>
                {isAdmin && (
                    <Button size="sm" onClick={save} disabled={saving}>
                        {saving ? "Saving…" : "Save"}
                    </Button>
                )}
            </header>

            <main className="p-4 max-w-lg mx-auto space-y-4">
                {ro && (
                    <p className="text-sm text-muted-foreground">
                        Only an admin can change settings. These values are read-only for your role.
                    </p>
                )}

                <Card>
                    <CardHeader className="flex-row items-center gap-2 space-y-0">
                        <ImageIcon className="w-5 h-5 text-primary" />
                        <CardTitle className="text-base">Logo</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex items-center gap-4">
                            <div className="w-20 h-20 rounded-md border bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
                                {config?.logo_path ? (
                                    <img src={logoUrl(config.updated_at)} alt="Shop logo" className="max-w-full max-h-full object-contain" />
                                ) : (
                                    <ImageIcon className="w-8 h-8 text-muted-foreground" />
                                )}
                            </div>
                            {!ro && (
                                <div className="space-y-2">
                                    <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={onLogoPicked} />
                                    <div className="flex gap-2">
                                        <Button variant="outline" size="sm" disabled={logoBusy} onClick={() => fileInput.current?.click()}>
                                            {logoBusy ? "Uploading…" : config?.logo_path ? "Replace" : "Upload"}
                                        </Button>
                                        {config?.logo_path && (
                                            <Button variant="outline" size="sm" disabled={logoBusy} onClick={onLogoRemove}>
                                                Remove
                                            </Button>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground">PNG/JPG/WEBP, max 2 MB. Shown on invoices & login.</p>
                                </div>
                            )}
                        </div>
                        {logoErr && <p className="text-sm text-destructive">{logoErr}</p>}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex-row items-center gap-2 space-y-0">
                        <Store className="w-5 h-5 text-primary" />
                        <CardTitle className="text-base">Shop Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-1">
                            <Label htmlFor="shopName">Shop Name *</Label>
                            <Input id="shopName" value={shopName} onChange={(e) => setShopName(e.target.value)} disabled={ro} />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="address">Address</Label>
                            <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} disabled={ro} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label htmlFor="phone">Contact Phone</Label>
                                <Input id="phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} disabled={ro} />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="cemail">Contact Email</Label>
                                <Input id="cemail" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} disabled={ro} />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="taxreg">Tax / Registration ID</Label>
                            <Input id="taxreg" value={taxRegId} onChange={(e) => setTaxRegId(e.target.value)} disabled={ro} />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex-row items-center gap-2 space-y-0">
                        <Coins className="w-5 h-5 text-primary" />
                        <CardTitle className="text-base">Currency & Tax</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label htmlFor="currency">Currency Symbol *</Label>
                                <Input id="currency" value={currencySymbol} onChange={(e) => setCurrencySymbol(e.target.value)} disabled={ro} />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="locale">Locale</Label>
                                <Input id="locale" value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="e.g. en-PH" disabled={ro} />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="tax">Tax Rate (%)</Label>
                            <Input id="tax" value={taxRatePct} onChange={(e) => setTaxRatePct(e.target.value)} placeholder="e.g. 12 — blank for none" disabled={ro} />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex-row items-center gap-2 space-y-0">
                        <Monitor className="w-5 h-5 text-primary" />
                        <CardTitle className="text-base">This Device</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-1">
                            <Label htmlFor="device">Device Name *</Label>
                            <Input id="device" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} disabled={ro} />
                            <p className="text-xs text-muted-foreground">Shown to identify this machine on the network.</p>
                        </div>
                    </CardContent>
                </Card>

                <AssetTypesSettings readOnly={ro} />

                <Card>
                    <CardHeader className="flex-row items-center gap-2 space-y-0">
                        <ListPlus className="w-5 h-5 text-primary" />
                        <CardTitle className="text-base">Custom Fields</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Extra fields printed on invoices/headers (e.g. "Permit No.").
                        </p>
                        {customFields.map((f, i) => (
                            <div key={i} className="flex gap-2 items-end">
                                <div className="flex-1 space-y-1">
                                    <Label>Label</Label>
                                    <Input value={f.label} onChange={(e) => updateField(i, "label", e.target.value)} disabled={ro} />
                                </div>
                                <div className="flex-1 space-y-1">
                                    <Label>Value</Label>
                                    <Input value={f.value} onChange={(e) => updateField(i, "value", e.target.value)} disabled={ro} />
                                </div>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    disabled={ro}
                                    onClick={() => setCustomFields((prev) => prev.filter((_, idx) => idx !== i))}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        ))}
                        {!ro && (
                            <Button variant="outline" size="sm" onClick={() => setCustomFields((prev) => [...prev, { label: "", value: "" }])}>
                                <Plus className="w-4 h-4 mr-2" /> Add Field
                            </Button>
                        )}
                    </CardContent>
                </Card>

                {error && <p className="text-sm text-destructive">{error}</p>}
                {saved && <p className="text-sm text-emerald-600">Settings saved.</p>}

                {isAdmin && (
                    <Button className="w-full" onClick={save} disabled={saving}>
                        {saving ? "Saving…" : "Save Changes"}
                    </Button>
                )}
            </main>
        </div>
    );
}
