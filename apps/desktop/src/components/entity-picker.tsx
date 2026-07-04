import { useState, useEffect, useRef } from "react";
import { Input, Button } from "@zorviz/ui";
import { Plus, X } from "lucide-react";

// Reusable table-backed picker with inline create (D7): search a table, and when no
// match is found offer to create the entity on the spot — so staff never dead-end.
interface EntityPickerProps<T> {
    value: T | null;
    onChange: (value: T | null) => void;
    search: (query: string) => Promise<T[]>;
    onCreate: (query: string) => Promise<T>;
    getLabel: (item: T) => string;
    getSubLabel?: (item: T) => string | undefined;
    placeholder?: string;
}

export function EntityPicker<T>({
    value,
    onChange,
    search,
    onCreate,
    getLabel,
    getSubLabel,
    placeholder,
}: EntityPickerProps<T>) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<T[]>([]);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (value || query.trim().length === 0) {
            setResults([]);
            return;
        }
        const t = setTimeout(async () => {
            try {
                setResults(await search(query));
                setOpen(true);
            } catch (e) {
                console.error(e);
            }
        }, 300);
        return () => clearTimeout(t);
    }, [query, value, search]);

    // Close the dropdown on outside click.
    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, []);

    const exactMatch = results.some((r) => getLabel(r).toLowerCase() === query.trim().toLowerCase());

    const handleCreate = async () => {
        setBusy(true);
        try {
            const created = await onCreate(query.trim());
            onChange(created);
            setQuery("");
            setOpen(false);
        } catch (e) {
            console.error(e);
        } finally {
            setBusy(false);
        }
    };

    if (value) {
        return (
            <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                <div className="min-w-0">
                    <div className="font-medium truncate">{getLabel(value)}</div>
                    {getSubLabel?.(value) && (
                        <div className="text-xs text-muted-foreground truncate">{getSubLabel(value)}</div>
                    )}
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => onChange(null)}>
                    <X className="h-4 w-4" />
                </Button>
            </div>
        );
    }

    return (
        <div className="relative" ref={boxRef}>
            <Input
                placeholder={placeholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => query && setOpen(true)}
            />
            {open && query.trim() && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-56 overflow-y-auto">
                    {results.map((r, i) => (
                        <button
                            key={i}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-muted"
                            onClick={() => {
                                onChange(r);
                                setOpen(false);
                            }}
                        >
                            <div className="font-medium">{getLabel(r)}</div>
                            {getSubLabel?.(r) && <div className="text-xs text-muted-foreground">{getSubLabel(r)}</div>}
                        </button>
                    ))}
                    {!exactMatch && (
                        <button
                            type="button"
                            disabled={busy}
                            className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2 text-primary border-t"
                            onClick={handleCreate}
                        >
                            <Plus className="h-4 w-4" />
                            {busy ? "Creating…" : `Create "${query.trim()}"`}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
