import { api } from "./api";
import type { UserRole } from "@zorviz/db";

export interface StaffUser {
    id: string;
    name: string;
    username: string;
    role: UserRole;
}

export function listUsers(role?: string): Promise<StaffUser[]> {
    return api.get<StaffUser[]>(`/api/users${role ? `?role=${encodeURIComponent(role)}` : ""}`);
}
