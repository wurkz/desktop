export type UserRole = 'admin' | 'advisor' | 'mechanic' | 'customer';

export interface User {
    id: string;
    email: string;
    role: UserRole;
    createdAt: Date;
    updatedAt: Date;
}

export type AssetType = 'vehicle' | 'gadget' | 'appliance';

export interface Asset<T = Record<string, any>> {
    id: string;
    ownerId: string;
    type: AssetType;
    specs: T;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;
}

export type BookingStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';

export interface Booking {
    id: string;
    assetId: string;
    customerId: string;
    scheduledTime: Date;
    status: BookingStatus;
    createdAt: Date;
    updatedAt: Date;
}

export type OrderStatus = 'estimate' | 'approved' | 'in_progress' | 'completed' | 'billed';

export interface Order {
    id: string;
    bookingId?: string;
    assetId: string;
    status: OrderStatus;
    approvalProof?: string;
    subtotal: number;
    tax: number;
    discount: number;
    total: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface OrderItem {
    id: string;
    orderId: string;
    type: 'service' | 'part';
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
}

export type SyncMetadata = {
    id: string;
    tableName: string;
    recordId: string;
    lastSyncedAt: Date;
    syncHash: string;
};
