import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth";
import { useAppConfigStore } from "../stores/app-config";
import { Button, Input, Label, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@zorviz/ui";
import { Wrench } from "lucide-react";
import { logoUrl } from "../lib/logo-api";

export default function LoginPage() {
    const navigate = useNavigate();
    const login = useAuthStore((state) => state.login);
    const config = useAppConfigStore((s) => s.config);
    const shopName = config?.shop_name;

    const [username, setUsername] = useState("");
    const [pin, setPin] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError("");
        try {
            await login(username, pin);
            navigate("/");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Login failed.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1">
                    <div className="flex justify-center mb-4">
                        {config?.logo_path ? (
                            <img src={logoUrl(config.updated_at)} alt="Shop logo" className="h-16 max-w-[180px] object-contain" />
                        ) : (
                            <div className="p-3 bg-primary/10 rounded-full">
                                <Wrench className="w-8 h-8 text-primary" />
                            </div>
                        )}
                    </div>
                    <CardTitle className="text-2xl text-center">{shopName || "Zorviz"}</CardTitle>
                    <CardDescription className="text-center">
                        Sign in with your username and PIN
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleLogin}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="username">Username</Label>
                            <Input
                                id="username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                autoFocus
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="pin">PIN</Label>
                            <Input
                                id="pin"
                                type="password"
                                inputMode="numeric"
                                placeholder="••••"
                                value={pin}
                                onChange={(e) => setPin(e.target.value)}
                                required
                            />
                        </div>
                        {error && <p className="text-sm text-destructive">{error}</p>}
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full" type="submit" disabled={isLoading}>
                            {isLoading ? "Signing in..." : "Sign In"}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
