import { useState } from "react";
import {
    Button,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@zorviz/ui";
import { Check, Copy } from "lucide-react";

// Shared CSV-import result dialog (BACK-3-020): counts + the skipped rows with reasons.
// The skip list is display-only — it lives in this dialog's props and nowhere else; closing
// discards it. The CSV block exists so the user can copy it out before that happens.

export interface ImportResult {
    imported: number;
    skipped: number;
    skipped_rows: Record<string, string>[];
}

interface Props {
    title: string;
    /** Column order + header labels for the skipped-rows CSV block. Keys index into skipped_rows. */
    columns: { key: string; label: string }[];
    result: ImportResult | null;
    onClose: () => void;
}

function csvEscape(v: string): string {
    return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function ImportResultDialog({ title, columns, result, onClose }: Props) {
    const [copied, setCopied] = useState(false);

    if (!result) return null;
    const rows = result.skipped_rows ?? [];
    const csv = [
        columns.map((c) => c.key).join(","),
        ...rows.map((r) => columns.map((c) => csvEscape(r[c.key] ?? "")).join(",")),
    ].join("\n");

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(csv);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* clipboard unavailable — the block is still selectable */
        }
    };

    return (
        <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <p className="text-sm">
                        <span className="font-medium">{result.imported}</span> imported
                        {" · "}
                        <span className={result.skipped > 0 ? "font-medium text-destructive" : "font-medium"}>
                            {result.skipped}
                        </span>{" "}
                        skipped
                    </p>
                    {rows.length > 0 && (
                        <>
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-muted-foreground">
                                    Skipped rows (not saved anywhere — copy them now if you need them):
                                </p>
                                <Button variant="outline" size="sm" onClick={copy}>
                                    {copied ? <Check className="w-4 h-4 mr-1.5" /> : <Copy className="w-4 h-4 mr-1.5" />}
                                    {copied ? "Copied" : "Copy"}
                                </Button>
                            </div>
                            <pre className="text-xs font-mono bg-muted rounded-lg p-3 max-h-64 overflow-auto select-all whitespace-pre">
                                {csv}
                            </pre>
                        </>
                    )}
                </div>
                <DialogFooter>
                    <Button onClick={onClose}>Done</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
