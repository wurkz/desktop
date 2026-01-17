import { SyncChange, SyncConflict } from './types';

/**
 * Resolve conflict using Last Write Wins strategy
 * @param localTime Timestamp of the local record
 * @param remoteTime Timestamp of the incoming remote record
 * @returns 'remote' if remote should overwrite local, 'local' if local should be kept
 */
export function resolveConflict(localTime: number, remoteTime: number): 'local' | 'remote' {
    // If remote is newer, it wins
    if (remoteTime > localTime) {
        return 'remote';
    }
    // If timestamps are equal or local is newer, local wins (keep existing)
    return 'local';
}

/**
 * Detect if a conflict exists
 * @param recordId Record ID
 * @param localTime Local updated_at timestamp
 * @param changeTime Incoming change timestamp
 */
export function hasConflict(localTime: number, changeTime: number): boolean {
    // Conflict exists if we have a local record and we receive a change
    // In a pure event sourcing model, we might just replay, but for state sync:
    // If we have unsynced local changes, that's a conflict. 
    // But for simple LWW, we just compare timestamps.
    return true;
}
