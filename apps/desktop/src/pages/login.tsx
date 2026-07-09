import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth";
import { useAppConfigStore } from "../stores/app-config";
import { Button, Input, Label, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@zorviz/ui";
import { logoUrl } from "../lib/logo-api";
import { PinInput } from "../components/pin-input";
import { LanQr } from "../components/lan-qr";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export default function LoginPage() {
    const navigate = useNavigate();
    const login = useAuthStore((state) => state.login);
    const config = useAppConfigStore((s) => s.config);
    const shopName = config?.shop_name;

    const [username, setUsername] = useState("");
    const [pin, setPin] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

    const doLogin = async (pinValue: string) => {
        if (!username.trim() || pinValue.length !== 6 || isLoading) return;
        setIsLoading(true);
        setError("");
        try {
            await login(username, pinValue);
            navigate("/");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Login failed.");
            // Clear the boxes for a clean retry and put the cursor back on the first one.
            setPin("");
            document.getElementById("pin-0")?.focus();
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        void doLogin(pin);
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-4">
            {isTauri && (
                <details className="w-full max-w-md rounded-lg border bg-card p-3 text-sm">
                    <summary className="cursor-pointer text-muted-foreground select-none">
                        Connect a phone to this shop
                    </summary>
                    <div className="pt-4">
                        <p className="mb-3 text-center text-xs text-muted-foreground">
                            Scan with your phone's camera to open the shop on your device.
                        </p>
                        <LanQr />
                    </div>
                </details>
            )}
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1">
                    <div className="flex justify-center mb-4">
                        {config?.logo_path ? (
                            <img src={logoUrl(config.updated_at)} alt="Shop logo" className="h-16 max-w-[180px] object-contain" />
                        ) : (
                            <img src="/wurkz-mark.png" alt="Wurkz" className="h-12 object-contain" />
                        )}
                    </div>
                    <CardTitle className="text-2xl text-center">{shopName || "Wurkz Shop"}</CardTitle>
                    <CardDescription className="text-center">
                        Sign in with your username and PIN
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="username">Username</Label>
                            <Input
                                id="username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                autoFocus
                                required
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck={false}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="block text-center">PIN</Label>
                            <PinInput
                                length={6}
                                value={pin}
                                onChange={setPin}
                                onComplete={(v) => void doLogin(v)}
                            />
                            <p className="text-center text-xs text-muted-foreground">PIN is 6 digits.</p>
                        </div>
                        {error && <p className="text-sm text-destructive text-center">{error}</p>}
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full" type="submit" disabled={isLoading || pin.length !== 6}>
                            {isLoading ? "Signing in..." : "Sign In"}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
