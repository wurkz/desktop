// Minimal CSV parser for the bulk importers (BACK-3-003 / customers import).
// Handles quoted fields, embedded commas/quotes ("" escape), CR/LF line endings.
// Returns rows as objects keyed by the (lowercased, trimmed) header names.

export function parseCsv(text: string): Record<string, string>[] {
    const rows: string[][] = [];
    let field = "";
    let row: string[] = [];
    let inQuotes = false;

    const pushField = () => { row.push(field); field = ""; };
    const pushRow = () => {
        // skip fully-empty lines
        if (row.length > 1 || (row.length === 1 && row[0].trim() !== "")) rows.push(row);
        row = [];
    };

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote
                else inQuotes = false;
            } else field += ch;
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === ",") {
            pushField();
        } else if (ch === "\n") {
            pushField(); pushRow();
        } else if (ch === "\r") {
            // swallow (handles \r\n and stray \r)
        } else {
            field += ch;
        }
    }
    if (field !== "" || row.length > 0) { pushField(); pushRow(); }

    if (rows.length < 2) return []; // need a header + at least one data row
    const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
    return rows.slice(1).map((r) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = (r[i] ?? "").trim(); });
        return obj;
    });
}

// First non-empty value among several possible header spellings.
export function pick(row: Record<string, string>, ...keys: string[]): string {
    for (const k of keys) {
        if (row[k]) return row[k];
    }
    return "";
}
