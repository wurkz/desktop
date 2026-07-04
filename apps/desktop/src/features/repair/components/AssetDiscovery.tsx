
import { useState, useEffect } from "react";
import { searchAssets } from "../../../lib/repair-api";
import { AssetWithHistory } from "@zorviz/feature-repair";
import { Input, Button, Card, CardHeader, CardContent } from "@zorviz/ui";
import { Search, Plus, Car, Smartphone, Watch } from "lucide-react";
import { AssetCreateForm } from "./AssetCreateForm";

export function AssetDiscovery() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<AssetWithHistory[]>([]);
    const [loading, setLoading] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);

    // Debounced search (simplified)
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (query.trim().length === 0) {
                setResults([]);
                return;
            }
            setLoading(true);
            try {
                const assets = await searchAssets(query);
                setResults(assets);
            } catch (error) {
                console.error("Search failed", error);
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [query]);

    const getIcon = (type: string) => {
        switch (type) {
            case 'vehicle': return <Car className="h-5 w-5" />;
            case 'gadget': return <Smartphone className="h-5 w-5" />;
            case 'appliance': return <Watch className="h-5 w-5" />; // Placeholder
            default: return <Search className="h-5 w-5" />;
        }
    };

    return (
        <div className="space-y-4 p-4 max-w-md mx-auto">
            {/* Search Header */}
            <div className="sticky top-0 bg-background/95 backdrop-blur py-2 z-10">
                <div className="flex gap-2">
                    <Input
                        placeholder="Scan Plate / Search VIN..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="text-lg h-12"
                        autoFocus
                    />
                    <Button size="icon" className="h-12 w-12 shrink-0" onClick={() => setCreateOpen(true)}>
                        <Plus className="h-6 w-6" />
                    </Button>
                </div>
            </div>

            {/* Results List */}
            <div className="space-y-3 pb-20">
                {results.map((asset) => (
                    <Card key={asset.id} className="active:scale-95 transition-transform cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <div className="flex items-center gap-2 font-semibold">
                                {getIcon(asset.type)}
                                {/* Helper to extract common 'name' from specs if exists */}
                                <span>{(asset.specs as any).plateNumber || (asset.specs as any).model || "Unknown Asset"}</span>
                            </div>
                            {asset.pendingBookings && asset.pendingBookings.length > 0 && (
                                <div className="bg-yellow-500/20 text-yellow-600 px-2 py-0.5 rounded text-xs">
                                    Booked
                                </div>
                            )}
                        </CardHeader>
                        <CardContent>
                            <div className="text-sm text-muted-foreground">
                                {(asset.specs as any).make} {(asset.specs as any).model}
                            </div>
                            <div className="text-xs text-muted-foreground mt-2">
                                Last Visit: {asset.lastVisit ? new Date(asset.lastVisit).toLocaleDateString() : 'Never'}
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {query.length > 0 && results.length === 0 && !loading && (
                    <div className="text-center text-muted-foreground py-8">
                        No assets found. Tap '+' to create.
                    </div>
                )}
            </div>

            <AssetCreateForm
                open={createOpen}
                onOpenChange={setCreateOpen}
                onCreated={(asset) => setResults((prev) => [asset, ...prev.filter((a) => a.id !== asset.id)])}
            />
        </div>
    );
}
