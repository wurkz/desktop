// Client for lightweight bookings (BACK-2-010, single-path HTTP API).
import { api } from "./api";

export type BookingStatus = "pending" | "confirmed" | "in_progress" | "completed" | "cancelled";

export interface Booking {
    id: string;
    customer_name: string | null;
    customer_phone: string | null;
    note: string | null;
    scheduled_time: number;
    status: BookingStatus;
    asset_id: string | null;
    customer_id: string | null;
    created_at: number;
    updated_at: number;
}

// Active bookings (pending/confirmed) by time; pass scope:"all" for the full list.
export function listBookings(scope?: "all"): Promise<Booking[]> {
    return api.get<Booking[]>(`/api/bookings${scope ? `?scope=${scope}` : ""}`);
}

export function createBooking(input: {
    customer_name?: string | null;
    customer_phone?: string | null;
    note?: string | null;
    scheduled_time: number;
}): Promise<Booking> {
    return api.post<Booking>("/api/bookings", input);
}

export function setBookingStatus(
    id: string,
    input: { status: BookingStatus; asset_id?: string | null; customer_id?: string | null }
): Promise<Booking> {
    return api.post<Booking>(`/api/bookings/${id}/status`, input);
}
