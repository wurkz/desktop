export type SyncOperation = 'insert' | 'update' | 'delete';

export interface SyncChange {
    id: string; // UUID of the change record itself (optional for tracking) or just use logic
    tableName: string;
    recordId: string;
    operation: SyncOperation;
    data: Record<string, any> | null; // null for delete
    timestamp: number; // Unix timestamp
    deviceId: string; // Originating device
}

export interface SyncConflict {
    tableName: string;
    recordId: string;
    localTimestamp: number;
    remoteTimestamp: number;
    winner: 'local' | 'remote';
}

export interface SyncState {
    lastSyncedAt: number;
    pendingChanges: SyncChange[];
}
