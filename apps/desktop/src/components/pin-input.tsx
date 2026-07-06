import { useRef } from "react";

interface Props {
    length?: number;
    value: string; // the real digits (never displayed — boxes show asterisks)
    onChange: (v: string) => void;
    onComplete?: (v: string) => void; // fires when all boxes are filled
    idPrefix?: string;
}

// Segmented PIN entry: one box per digit, masked with an asterisk. Digits only;
// auto-advances, Backspace walks back, paste distributes, mobile numeric keypad.
export function PinInput({ length = 6, value, onChange, onComplete, idPrefix = "pin" }: Props) {
    const refs = useRef<(HTMLInputElement | null)[]>([]);
    const digits = Array.from({ length }, (_, i) => value[i] ?? "");

    const commit = (next: string) => {
        onChange(next);
        if (next.length === length && onComplete) onComplete(next);
    };

    const setDigit = (i: number, d: string) => {
        const arr = digits.slice();
        arr[i] = d;
        // Keep only the contiguous prefix of filled boxes so `value` stays a simple string.
        const next = arr.join("").slice(0, length);
        commit(next);
        if (d && i < length - 1) refs.current[i + 1]?.focus();
    };

    const handleInput = (i: number, e: React.FormEvent<HTMLInputElement>) => {
        // The displayed value is "*", so extract the digit the user just typed.
        const m = (e.target as HTMLInputElement).value.match(/\d/);
        (e.target as HTMLInputElement).value = digits[i] ? "*" : ""; // reset display; React re-renders below
        if (m) setDigit(i, m[0]);
    };

    const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Backspace") {
            e.preventDefault();
            if (digits[i]) {
                commit(value.slice(0, i));
            } else if (i > 0) {
                commit(value.slice(0, i - 1));
                refs.current[i - 1]?.focus();
            }
        } else if (e.key === "ArrowLeft" && i > 0) {
            refs.current[i - 1]?.focus();
        } else if (e.key === "ArrowRight" && i < length - 1) {
            refs.current[i + 1]?.focus();
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
        if (pasted) {
            commit(pasted);
            refs.current[Math.min(pasted.length, length - 1)]?.focus();
        }
    };

    return (
        <div className="flex justify-center gap-2" onPaste={handlePaste}>
            {digits.map((d, i) => (
                <input
                    key={i}
                    id={`${idPrefix}-${i}`}
                    ref={(el) => { refs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label={`PIN digit ${i + 1}`}
                    className="h-14 w-11 rounded-lg border border-input bg-background text-center text-2xl font-bold ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={d ? "*" : ""}
                    onInput={(e) => handleInput(i, e)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    onFocus={(e) => e.target.select()}
                    onChange={() => { /* handled in onInput */ }}
                />
            ))}
        </div>
    );
}
