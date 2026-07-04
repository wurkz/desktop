/**
 * Placeholder tenant id used in development and before the first-run setup wizard
 * (BACK-0-003) assigns the real tenant from app_config. Single source of truth so the
 * seeders and repositories agree (previously 'dev-tenant-id' vs 'default-tenant' diverged).
 */
export const DEV_TENANT_ID = 'dev-tenant';
