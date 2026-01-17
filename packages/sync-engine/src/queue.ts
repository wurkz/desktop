import { SyncChange } from './types';

export class SyncQueue {
    private queue: SyncChange[] = [];

    enqueue(change: SyncChange) {
        // If we already have a change for this record, update it or append?
        // Optimization: Coalesce changes for same recordId
        const existingIndex = this.queue.findIndex(
            c => c.tableName === change.tableName && c.recordId === change.recordId
        );

        if (existingIndex >= 0) {
            // Replace existing pending change with newer one
            this.queue[existingIndex] = change;
        } else {
            this.queue.push(change);
        }
    }

    dequeue(): SyncChange | undefined {
        return this.queue.shift();
    }

    peek(): SyncChange | undefined {
        return this.queue[0];
    }

    get size(): number {
        return this.queue.length;
    }

    clear() {
        this.queue = [];
    }

    getAll(): SyncChange[] {
        return [...this.queue];
    }
}
