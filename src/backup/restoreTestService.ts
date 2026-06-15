import cron from "node-cron";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { logAction } from "../services/auditLog";
import { createdbDb, dropdbDb, pgRestoreDataOnlyFromFile, psqlQuery } from "./pgCliRunner";
import { buildTempDatabaseName, stripPgbouncerParam, withDatabase } from "./postgresUrl";

import {
  BACKUP_DIR,
  BACKUP_RESTORE_TEST_BACKUP_FILENAME,
  BACKUP_RESTORE_TEST_TEMP_DB_PREFIX,
  BACKUP_RESTORE_VALIDATION_TABLES,
  BACKUP_RESTORE_MIN_ROWS,
  DATABASE_URL,
} from "./backupConfig";

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

type ValidationResult = {
  tableResults: Array<{ table: string; count: number }>;
  minRowsRequired: number;
  passed: boolean;
};

function sanitizeIdentifier(name: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error(`Invalid table/identifier: ${name}`);
  }
  return name;
}

function resolveLedgeraBackendDir(): string {
  const direct = path.join(process.cwd(), "ledgera-backend");
  if (fs.existsSync(direct)) return direct;
  // Fallback for cases where cwd differs (e.g. /tmp running scripts)
  const alt = path.join(process.cwd(), "..", "ledgera-backend");
  return alt;
}

function findLatestBackupFile(): { fileName: string; filePath: string; mtimeMs: number } {
  ensureDir(BACKUP_DIR);

  const entries = fs.readdirSync(BACKUP_DIR);
  const backups = entries
    .filter((n) => n.startsWith("ledgera_backup_") && n.endsWith(".dump"))
    .map((n) => {
      const filePath = path.join(BACKUP_DIR, n);
      const stat = fs.statSync(filePath);
      return { fileName: n, filePath, mtimeMs: stat.mtimeMs };
    });

  if (backups.length === 0) {
    throw new Error(`No backup files found in BACKUP_DIR=${BACKUP_DIR}`);
  }

  backups.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return backups[0];
}

function pickBackupFile(): { fileName: string; filePath: string } {
  if (BACKUP_RESTORE_TEST_BACKUP_FILENAME.trim()) {
    const fileName = BACKUP_RESTORE_TEST_BACKUP_FILENAME.trim();
    const filePath = path.join(BACKUP_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Backup file not found for restore test: ${filePath}`);
    }
    return { fileName, filePath };
  }

  const latest = findLatestBackupFile();
  return { fileName: latest.fileName, filePath: latest.filePath };
}

async function resolvePublicTableName(
  targetDb: string,
  expectedModelName: string
): Promise<string> {
  const expectedLower = expectedModelName.toLowerCase();

  const sql = `
    SELECT tablename
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'public'
      AND lower(tablename) = '${expectedLower}'
    LIMIT 1;
  `.trim();

  const out = await psqlQuery(targetDb, sql);
  const resolved = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];

  if (!resolved) {
    throw new Error(
      `Restored DB is missing expected table (case-insensitive match): ${expectedModelName}`
    );
  }

  return resolved;
}

async function validateRestoredDb(targetDb: string): Promise<ValidationResult> {
  const expectedTables = BACKUP_RESTORE_VALIDATION_TABLES.map(sanitizeIdentifier);
  const minRowsRequired = BACKUP_RESTORE_MIN_ROWS;

  const tableResults: Array<{ table: string; count: number }> = [];

  for (const expectedTable of expectedTables) {
    const actualTable = await resolvePublicTableName(targetDb, expectedTable);
    const quotedActual = `"${actualTable.replace(/"/g, '""')}"`;

    const sql = `SELECT COUNT(*)::bigint AS count FROM public.${quotedActual};`;
    const out = await psqlQuery(targetDb, sql);
    const count = Number.parseInt(out, 10);

    if (!Number.isFinite(count)) {
      throw new Error(
        `Failed to parse row count for ${expectedTable} (resolved=${actualTable}). Raw='${out}'`
      );
    }

    tableResults.push({ table: expectedTable, count });
  }

  const passed =
    minRowsRequired <= 0 ? true : tableResults.every((r) => r.count >= minRowsRequired);

  return { tableResults, minRowsRequired, passed };
}

async function runPrismaDbPush(tempDbConn: string): Promise<void> {
  const ledgeraDir = resolveLedgeraBackendDir();

  await new Promise<void>((resolve, reject) => {
    const env = {
      ...process.env,
      DATABASE_URL: tempDbConn,
      DIRECT_URL: tempDbConn,
    };

    const child = spawn("npx", ["prisma", "db", "push"], {
      cwd: ledgeraDir,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });

    child.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`prisma db push failed (code=${code}): ${stderr}`));
    });
  });
}

export async function runRestoreTestOnce(
  userId: string | null = null
): Promise<{ backupFile: string; tempDbName: string; validation: ValidationResult }> {
  const { fileName: backupFile, filePath: backupPath } = pickBackupFile();

  const tempDbName = buildTempDatabaseName(BACKUP_RESTORE_TEST_TEMP_DB_PREFIX);
  const tempDbConn = withDatabase(stripPgbouncerParam(DATABASE_URL), tempDbName);

  try {
    await logAction(userId, "DB_RESTORE_TEST_STARTED", "DatabaseRestoreTest", tempDbName);

    await dropdbDb(tempDbName).catch(() => undefined);
    await createdbDb(tempDbName);

    // Create schema/tables without depending on Supabase auth/RLS objects.
    await runPrismaDbPush(tempDbConn);

    // Restore only data into already-created tables.
    await pgRestoreDataOnlyFromFile(backupPath, tempDbName);

    const validation = await validateRestoredDb(tempDbName);

    await logAction(
      userId,
      validation.passed ? "DB_RESTORE_TEST_COMPLETED" : "DB_RESTORE_TEST_VALIDATION_FAILED",
      "DatabaseRestoreTest",
      `${backupFile}:${validation.tableResults
        .map((r) => `${r.table}=${r.count}`)
        .join(",")
        .slice(0, 200)}`
    );

    return { backupFile, tempDbName, validation };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logAction(userId, "DB_RESTORE_TEST_FAILED", "DatabaseRestoreTest", message.slice(0, 200));
    throw err;
  } finally {
    await dropdbDb(tempDbName).catch(() => undefined);
  }
}

function assertCronIsMonthly(schedule: string): void {
  const parts = schedule.trim().split(/\s+/);
  // node-cron here is using standard 5-field syntax: "m h dom mon dow"
  if (parts.length !== 5) {
    throw new Error(
      `Invalid BACKUP_RESTORE_TEST_CRON_SCHEDULE="${schedule}". Expected 5 fields like "30 3 1 * *".`
    );
  }

  const [_minute, _hour, dom, mon, dow] = parts;
  if (!dom || !mon || !dow) {
    throw new Error(`Invalid BACKUP_RESTORE_TEST_CRON_SCHEDULE="${schedule}".`);
  }

  // "Monthly" audit requirement: run once per month by specifying a concrete day-of-month.
  // We enforce mon="*" and dow="*" to avoid ambiguous weekly+monthly behavior.
  if (mon !== "*" || dow !== "*") {
    throw new Error(
      `Invalid BACKUP_RESTORE_TEST_CRON_SCHEDULE="${schedule}". Audit requires monthly testing (mon="*" and dow="*").`
    );
  }

  // dom must be a specific day number (1-31), not "*".
  if (dom === "*") {
    throw new Error(
      `Invalid BACKUP_RESTORE_TEST_CRON_SCHEDULE="${schedule}". Audit requires monthly testing (day-of-month must be a number, not "*").`
    );
  }

  const domNum = Number.parseInt(dom, 10);
  if (!Number.isFinite(domNum) || domNum < 1 || domNum > 31) {
    throw new Error(
      `Invalid BACKUP_RESTORE_TEST_CRON_SCHEDULE="${schedule}". day-of-month must be between 1 and 31.`
    );
  }
}

export function startRestoreTestCronJobs(): void {
  const enabled =
    (process.env.BACKUP_RESTORE_TEST_ENABLED ?? "true").toLowerCase() === "true";
  if (!enabled) return;

  // Monthly restore testing default: 03:30 on the 1st of every month.
  const schedule = process.env.BACKUP_RESTORE_TEST_CRON_SCHEDULE ?? "30 3 1 * *";
  assertCronIsMonthly(schedule);

  const anyCron = startRestoreTestCronJobs as any;
  if (anyCron.__started) return;
  anyCron.__started = true;

  cron.schedule(schedule, async () => {
    try {
      await runRestoreTestOnce(null);
    } catch (err) {
      console.error("[restore-test] Restore test failed:", err);
    }
  });
}
