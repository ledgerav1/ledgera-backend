import cron from "node-cron";
import fs from "fs";
import path from "path";
import { logAction } from "../services/auditLog";
import { BACKUP_CRON_SCHEDULE, BACKUP_DIR, BACKUP_RETENTION_DAYS } from "./backupConfig";
import { pgDumpToFile } from "./pgCliRunner";

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function backupFilenameForNow(): string {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(
    now.getUTCDate()
  ).padStart(2, "0")}T${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(
    2,
    "0"
  )}${String(now.getUTCSeconds()).padStart(2, "0")}Z`;
  // Use a conservative extension; we’re using pg_dump custom format.
  return `ledgera_backup_${stamp}.dump`;
}

function listBackupFiles(dir: string): Array<{ filePath: string; mtimeMs: number }> {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir);
  const files = entries
    .filter((name) => name.startsWith("ledgera_backup_") && name.endsWith(".dump"))
    .map((name) => {
      const filePath = path.join(dir, name);
      const stat = fs.statSync(filePath);
      return { filePath, mtimeMs: stat.mtimeMs };
    });
  return files;
}

function runRetentionCleanup(dir: string): { deleted: number; kept: number } {
  const now = Date.now();
  const cutoffMs = now - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  const backups = listBackupFiles(dir);
  let deleted = 0;
  let kept = 0;

  for (const backup of backups) {
    if (backup.mtimeMs < cutoffMs) {
      fs.unlinkSync(backup.filePath);
      deleted += 1;
    } else {
      kept += 1;
    }
  }

  return { deleted, kept };
}

export async function runBackupOnce(): Promise<{ backupPath: string; deleted: number; kept: number }> {
  ensureDir(BACKUP_DIR);

  const backupFile = backupFilenameForNow();
  const backupPath = path.join(BACKUP_DIR, backupFile);

  await pgDumpToFile(backupPath);

  const { deleted, kept } = runRetentionCleanup(BACKUP_DIR);

  await logAction(null, "DB_BACKUP_OK", "DatabaseBackup", backupFile);

  return { backupPath, deleted, kept };
}

/**
 * Cron wiring helper.
 * We only schedule one job (idempotent based on started flag).
 */
let started = false;

export function startBackupCronJobs(): void {
  if (started) return;
  started = true;

  cron.schedule(BACKUP_CRON_SCHEDULE, async () => {
    try {
      const res = await runBackupOnce();
      await logAction(null, "DB_BACKUP_COMPLETED", "DatabaseBackup", res.backupPath ?? null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await logAction(null, "DB_BACKUP_FAILED", "DatabaseBackup", message ?? null);
      console.error("[backup] Backup failed:", message);
    }
  });
}
