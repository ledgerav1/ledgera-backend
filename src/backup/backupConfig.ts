import { requireEnv } from "../utils/envUtils";

export type BackupRetentionDays = 30;

function parseIntOrFallback(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function assertCronIsDaily(schedule: string): void {
  const parts = schedule.trim().split(/\s+/);
  // node-cron here is using standard 5-field syntax: "m h dom mon dow"
  if (parts.length !== 5) {
    throw new Error(
      `Invalid BACKUP_CRON_SCHEDULE="${schedule}". Expected 5 fields like "10 2 * * *".`
    );
  }

  const [minute, hour, dom, mon, dow] = parts;
  if (!minute || !hour || !dom || !mon || !dow) {
    throw new Error(`Invalid BACKUP_CRON_SCHEDULE="${schedule}".`);
  }

  // "Daily" for our audit purposes: every day of month and every day of week.
  if (dom !== "*" || dow !== "*") {
    throw new Error(
      `Invalid BACKUP_CRON_SCHEDULE="${schedule}". Audit requires daily backups (dom="*" and dow="*").`
    );
  }
}

export const BACKUP_DIR = process.env.BACKUP_DIR ?? "./backups";
export const BACKUP_RETENTION_DAYS_RAW = parseIntOrFallback(
  process.env.BACKUP_RETENTION_DAYS,
  30
);

// Audit requirement: 30-day retention.
function assertRetentionDaysIs30(days: number): asserts days is BackupRetentionDays {
  if (days !== 30) {
    throw new Error(`Invalid BACKUP_RETENTION_DAYS=${days}. Audit requires retention of exactly 30 days.`);
  }
}

assertRetentionDaysIs30(BACKUP_RETENTION_DAYS_RAW);
export const BACKUP_RETENTION_DAYS = BACKUP_RETENTION_DAYS_RAW;

export const BACKUP_CRON_SCHEDULE = process.env.BACKUP_CRON_SCHEDULE ?? "10 2 * * *";
assertCronIsDaily(BACKUP_CRON_SCHEDULE);

// If set, restore-test will use that specific backup filename from BACKUP_DIR.
// Otherwise it uses the latest file by timestamp.
export const BACKUP_RESTORE_TEST_BACKUP_FILENAME = process.env.BACKUP_RESTORE_TEST_BACKUP_FILENAME ?? "";

// Prefix for temporary DB created during restore-test.
export const BACKUP_RESTORE_TEST_TEMP_DB_PREFIX =
  process.env.BACKUP_RESTORE_TEST_TEMP_DB_PREFIX ?? "ledgera_restore_test_";

// Comma-separated list of tables to sanity-check after restore.
export const BACKUP_RESTORE_VALIDATION_TABLES = (process.env.BACKUP_RESTORE_VALIDATION_TABLES ??
  "Company,Job,Payment,Contract,Invoice")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Minimum number of rows required for validation. 0 means "table exists and restore succeeded".
export const BACKUP_RESTORE_MIN_ROWS = parseIntOrFallback(process.env.BACKUP_RESTORE_MIN_ROWS, 0);

// Optional override for pg binaries directory (e.g. /c/Program Files/PostgreSQL/16/bin).
// If not set, we’ll try common default locations.
export const BACKUP_PG_BIN_DIR = process.env.BACKUP_PG_BIN_DIR ?? "";

// We rely on pg_dump/restore for connection details, but we validate we have the DB URL.
export const DATABASE_URL = requireEnv("DATABASE_URL");
