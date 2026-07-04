
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';
import { DEV_TENANT_ID } from '@zorviz/core';

// Config
const BUNDLE_ID = 'com.zorviz.app';
const DB_NAME = 'zorviz.db';

// Config
// PORTABLE MODE: Database is in 'apps/desktop/data/zorviz.db' to avoid 'src-tauri' watch loop.
// Assuming this script is run from 'packages/db'
const DB_PATH = path.resolve(process.cwd(), '../../apps/desktop/data/zorviz.db');

function getDbPath() {
    console.log(`Target Database: ${DB_PATH}`);
    // Check if dir exists, create if not (Node seeder convenience)
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
        console.log(`Creating directory: ${dir}`);
        fs.mkdirSync(dir, { recursive: true });
    }
    return DB_PATH;
}

const dbPath = process.env.DB_PATH || getDbPath();

if (!fs.existsSync(dbPath)) {
    console.error(`Database not found at ${dbPath}. Please run the app once to initialize the DB.`);
    process.exit(1);
}

const db = new Database(dbPath);

console.log("Connected to SQLite.");

// SEED LOGIC
// 1. App Config
const existingConfig = db.prepare("SELECT * FROM app_config").get();

if (!existingConfig) {
    console.log("Seeding App Config...");
    const now = Date.now();
    db.prepare(`
        INSERT INTO app_config (id, tenant_id, branch_id, device_name, currency_symbol, locale, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('default', DEV_TENANT_ID, 'main-branch', 'Console-Seeder', '₱', 'en-PH', now, now);
} else {
    console.log("App Config already exists.");
}

// 2. Users
const seedUser = (email: string, role: string) => {
    // SHA-256 hash of 'admin123'
    const passwordHash = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';
    const existing = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!existing) {
        console.log(`Seeding User: ${email}`);
        const now = Date.now();
        db.prepare(`
            INSERT INTO users (id, email, role, password_hash, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(uuidv4(), email, role, passwordHash, now, now);
    } else {
        console.log(`User ${email} already exists.`);
    }
};

seedUser('admin@zorviz.com', 'admin');
seedUser('mechanic@zorviz.com', 'mechanic');

console.log("Seeding Complete. You can now login.");
