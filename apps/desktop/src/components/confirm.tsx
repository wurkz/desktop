import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
    Button,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@zorviz/ui";

// BACK-2-022: anti pocket-press confirmation. A mutating action routes through confirm(),
// which resolves true only after the user drags the handle full-travel (touch) or clicks
// Confirm (mouse/keyboard). A stray tap opens the sheet but never mutates. Coverage = all
// mutating actions; a plain button is used on non-touch pointers (also the a11y path).

export interface ConfirmOptions {
    /** Question shown as the title, e.g. "Mark this job as paid?" */
    title: string;
    /** Optional extra context line. */
    message?: string;
    /** Slider caption, e.g. "Slide to mark as paid". Defaults from the title. */
    verb?: string;
    /** Destructive styling (red track/button). */
    danger?: boolean;
    /** Confirm-button label on non-touch devices. Defaults to "Confirm". */
    confirmLabel?: string;
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

function isCoarsePointer(): boolean {
    return typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches || "ontouchstart" in window);
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
    const [pending, setPending] = useState<Pending | null>(null);

    const confirm = useCallback((opts: ConfirmOptions) => {
        return new Promise<boolean>((resolve) => setPending({ ...opts, resolve }));
    }, []);

    const settle = useCallback((ok: boolean) => {
        setPending((p) => {
            p?.resolve(ok);
            return null;
        });
    }, []);

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <ConfirmDialog pending={pending} settle={settle} />
        </ConfirmContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
    const ctx = useContext(ConfirmContext);
    if (!ctx) throw new Error("useConfirm must be used within a ConfirmProvider");
    return ctx;
}

function ConfirmDialog({ pending, settle }: { pending: Pending | null; settle: (ok: boolean) => void }) {
    const open = pending !== null;
    // Decide slide-vs-button once per open, from the pointer type.
    const [useSlide, setUseSlide] = useState(true);
    useEffect(() => {
        if (open) setUseSlide(isCoarsePointer());
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) settle(false); }}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>{pending?.title}</DialogTitle>
                    <DialogDescription>
                        {pending?.message ?? "This won't happen until you confirm."}
                    </DialogDescription>
                </DialogHeader>

                {pending && (useSlide ? (
                    <SlideToConfirm
                        key={pending.title}
                        label={pending.verb ?? "Slide to confirm"}
                        danger={pending.danger}
                        onConfirm={() => settle(true)}
                    />
                ) : (
                    <DialogFooter>
                        <Button variant="outline" onClick={() => settle(false)}>Cancel</Button>
                        <Button variant={pending.danger ? "destructive" : "default"} autoFocus onClick={() => settle(true)}>
                            {pending.confirmLabel ?? "Confirm"}
                        </Button>
                    </DialogFooter>
                ))}
            </DialogContent>
        </Dialog>
    );
}

// Drag-the-handle-full-travel control. Pointer events cover both touch and mouse; the track
// is focusable and Enter fires it (keyboard/AT fallback).
function SlideToConfirm({ label, danger, onConfirm }: { label: string; danger?: boolean; onConfirm: () => void }) {
    const trackRef = useRef<HTMLDivElement>(null);
    const knobRef = useRef<HTMLDivElement>(null);
    const firedRef = useRef(false);
    const [fired, setFired] = useState(false);

    useEffect(() => {
        const track = trackRef.current;
        const knob = knobRef.current;
        if (!track || !knob) return;

        let dragging = false;
        let startX = 0;
        let maxTravel = 0;

        const fillEl = track.querySelector<HTMLDivElement>(".stc-fill");
        const hintEl = track.querySelector<HTMLDivElement>(".stc-hint");
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

        const setP = (px: number) => {
            const p = Math.max(0, Math.min(1, px / maxTravel));
            knob.style.transform = `translateX(${p * maxTravel}px)`;
            if (fillEl) fillEl.style.width = `${knob.offsetWidth + 4 + p * maxTravel}px`;
            if (hintEl) hintEl.style.opacity = String(1 - p * 1.4);
            return p;
        };
        const reset = () => {
            if (fillEl) fillEl.style.transition = reduce ? "none" : "";
            knob.style.transform = "translateX(0)";
            if (fillEl) fillEl.style.width = `${knob.offsetWidth + 4}px`;
            if (hintEl) hintEl.style.opacity = "1";
        };
        const success = () => {
            if (firedRef.current) return;
            firedRef.current = true;
            setFired(true);
            knob.style.transform = `translateX(${maxTravel}px)`;
            onConfirm();
        };
        const layout = () => { maxTravel = track.clientWidth - knob.offsetWidth - 8; };

        const onDown = (e: PointerEvent) => {
            if (firedRef.current) return;
            layout();
            dragging = true;
            startX = e.clientX;
            knob.setPointerCapture(e.pointerId);
            if (fillEl) fillEl.style.transition = "none";
        };
        const onMove = (e: PointerEvent) => {
            if (!dragging || firedRef.current) return;
            if (setP(e.clientX - startX) >= 0.97) { dragging = false; success(); }
        };
        const onUp = () => {
            if (!dragging || firedRef.current) return;
            dragging = false;
            reset();
        };
        const onKey = (e: KeyboardEvent) => {
            if (firedRef.current) return;
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); layout(); setP(maxTravel); success(); }
        };

        knob.addEventListener("pointerdown", onDown);
        knob.addEventListener("pointermove", onMove);
        knob.addEventListener("pointerup", onUp);
        knob.addEventListener("pointercancel", onUp);
        track.addEventListener("keydown", onKey);
        requestAnimationFrame(() => { layout(); reset(); });

        return () => {
            knob.removeEventListener("pointerdown", onDown);
            knob.removeEventListener("pointermove", onMove);
            knob.removeEventListener("pointerup", onUp);
            knob.removeEventListener("pointercancel", onUp);
            track.removeEventListener("keydown", onKey);
        };
    }, [onConfirm]);

    const accent = danger ? "hsl(var(--destructive))" : "hsl(var(--primary))";
    return (
        <div className="space-y-2">
            <div
                ref={trackRef}
                role="slider"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={fired ? 100 : 0}
                tabIndex={0}
                className={`relative h-14 rounded-lg border overflow-hidden select-none outline-offset-2 ${
                    fired ? "border-green-500" : "border-input"
                } bg-muted`}
                style={{ touchAction: "none" }}
            >
                <div
                    className="stc-fill absolute inset-y-0 left-0"
                    style={{ width: 52, background: fired ? "#16a34a" : accent, opacity: 0.16, transition: "width .05s linear" }}
                />
                <div className="stc-hint absolute inset-0 flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground pl-10 pointer-events-none">
                    {fired ? "Confirmed" : `${label} →`}
                </div>
                <div
                    ref={knobRef}
                    className="absolute top-1 left-1 h-12 w-12 rounded-md grid place-items-center text-white text-xl shadow-md cursor-grab active:cursor-grabbing"
                    style={{ background: fired ? "#16a34a" : accent, touchAction: "none" }}
                >
                    {fired ? "✓" : "→"}
                </div>
            </div>
            <p className="text-[11px] text-muted-foreground">Drag the handle, or focus it and press Enter.</p>
        </div>
    );
}
