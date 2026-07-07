import { create } from "zustand";

export type ToastVariant = "default" | "success" | "error";

export interface Toast {
    id: number;
    message: string;
    variant: ToastVariant;
}

interface ToastState {
    toasts: Toast[];
    push: (message: string, variant?: ToastVariant) => void;
    dismiss: (id: number) => void;
}

let seq = 0;

export const useToastStore = create<ToastState>((set) => ({
    toasts: [],
    push: (message, variant = "default") => {
        const id = ++seq;
        set((s) => ({ toasts: [...s.toasts, { id, message, variant }] }));
        // Auto-dismiss after a few seconds.
        setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
    },
    dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// Convenience for non-component call sites (event handlers, promises).
export const toast = (message: string, variant?: ToastVariant) =>
    useToastStore.getState().push(message, variant);
