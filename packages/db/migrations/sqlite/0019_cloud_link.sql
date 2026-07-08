-- BACK-4 prep: cloud-link config, shipped now so enabling sync later is config, not a reinstall.
-- Strictly opt-in and inert by default — the app runs fully local whether or not these are set.
-- The sync engine + cloud backend are parked; these columns just hold the switch + endpoint.
ALTER TABLE app_config ADD COLUMN cloud_url TEXT;              -- backend base URL (null = not linked)
ALTER TABLE app_config ADD COLUMN device_token TEXT;          -- bearer token for authenticated sync
ALTER TABLE app_config ADD COLUMN sync_enabled INTEGER NOT NULL DEFAULT 0; -- 0 = off (default)
