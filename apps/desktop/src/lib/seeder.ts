import { db } from "./db";
import { DEV_TENANT_ID } from "@zorviz/core";

// Simple hash function using Web Crypto API (browser-compatible)
async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Default password for dev users
const DEV_PASSWORD = "admin123";

export const seedDevData = async () => {
    const passwordHash = await hashPassword(DEV_PASSWORD);
    const now = Date.now();

    // 1. Check if AppConfig exists
    const config = await db
        .selectFrom('app_config')
        .select('id')
        .limit(1)
        .executeTakeFirst();

    if (!config) {
        console.log("Seeding App Config...");
        await db.insertInto('app_config').values({
            id: "default",
            tenant_id: DEV_TENANT_ID,
            branch_id: "main-branch",
            device_name: "Dev PC",
            currency_symbol: "₱", // Philippine Peso for dev
            locale: "en-PH",
            created_at: now,
            updated_at: now
        }).execute();
    }

    // 2. Check if Admin User exists
    const admin = await db
        .selectFrom('users')
        .select('id')
        .where('email', '=', 'admin@zorviz.com')
        .limit(1)
        .executeTakeFirst();

    if (!admin) {
        console.log("Seeding Admin User...");
        await db.insertInto('users').values({
            id: crypto.randomUUID(),
            email: "admin@zorviz.com",
            role: "admin",
            password_hash: passwordHash,
            created_at: now,
            updated_at: now
        }).execute();
    }

    // 3. Seed Mechanic User
    const mechanic = await db
        .selectFrom('users')
        .select('id')
        .where('email', '=', 'mechanic@zorviz.com')
        .limit(1)
        .executeTakeFirst();

    if (!mechanic) {
        console.log("Seeding Mechanic User...");
        await db.insertInto('users').values({
            id: crypto.randomUUID(),
            email: "mechanic@zorviz.com",
            role: "mechanic",
            password_hash: passwordHash,
            created_at: now,
            updated_at: now
        }).execute();
    }
};
