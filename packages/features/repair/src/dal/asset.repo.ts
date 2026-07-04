import { Kysely } from 'kysely';
import type { Database } from '@zorviz/db';
import { DEV_TENANT_ID } from '@zorviz/core';
import { AssetWithHistory, CreateAssetInput } from '../types';

export class AssetRepository {
    constructor(private db: Kysely<Database>) { }

    /**
     * Search assets by a general query string (License Plate, VIN, etc.)
     * Returns assets with their latest booking status.
     */
    async search(query: string): Promise<AssetWithHistory[]> {
        const lowerQuery = `%${query.toLowerCase()}%`;

        const results = await this.db
            .selectFrom('assets')
            .selectAll()
            .where((eb) =>
                eb.or([
                    eb('id', 'like', lowerQuery),
                    eb('specs', 'like', lowerQuery)
                ])
            )
            .limit(10)
            .execute();

        // Enhance with pending bookings
        const assetsWithBookings: AssetWithHistory[] = [];

        for (const asset of results) {
            const pending = await this.db
                .selectFrom('bookings')
                .selectAll()
                .where('asset_id', '=', asset.id)
                .where('status', 'in', ['pending', 'confirmed'])
                .limit(1)
                .execute();

            assetsWithBookings.push({
                ...asset,
                specs: typeof asset.specs === 'string' ? JSON.parse(asset.specs) : asset.specs,
                pendingBookings: pending as any
            });
        }

        return assetsWithBookings;
    }

    async create(input: CreateAssetInput): Promise<AssetWithHistory> {
        const id = crypto.randomUUID();
        const now = Date.now();

        await this.db.insertInto('assets').values({
            id,
            tenant_id: input.tenantId || DEV_TENANT_ID,
            owner_id: input.ownerId || null,
            type: input.type,
            specs: JSON.stringify(input.specs),
            created_at: now,
            updated_at: now,
            deleted_at: null
        }).execute();

        const newAsset = await this.db
            .selectFrom('assets')
            .selectAll()
            .where('id', '=', id)
            .executeTakeFirst();

        if (!newAsset) throw new Error("Failed to create asset");

        return {
            ...newAsset,
            specs: input.specs,
            pendingBookings: []
        };
    }
}
