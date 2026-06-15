import { spawn } from "child_process";
import { logAction } from "../services/auditLog";
import { BACKUP_PG_BIN_DIR, DATABASE_URL } from "./backupConfig";
import { getCreatedbPath, getDropdbPath, getPgDumpPath, getPgRestorePath, getPsqlPath } from "./pgCli";
import { parsePostgresUrl, stripPgbouncerParam, withDatabase } from "./postgresUrl";

export type PgCliCommandResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

function readPgPassword(databaseUrl: string): string {
  const parsed = parsePostgresUrl(databaseUrl);
  return parsed.password;
}

function buildEnvWithPassword(databaseUrl: string): NodeJS.ProcessEnv {
  // Prevent leaking password in logs; pass via env only.
  const pgPassword = readPgPassword(databaseUrl);

  // Help pgtools keep TLS behavior consistent with the connection URL.
  // (e.g. sslmode=require on Supabase)
  const url = new URL(databaseUrl);
  const sslmode = url.searchParams.get("sslmode");
  const env: NodeJS.ProcessEnv = { ...process.env, PGPASSWORD: pgPassword };
  if (sslmode) env.PGSSLMODE = sslmode;

  return env;
}

function runProcess(programPath: string, args: string[], env: NodeJS.ProcessEnv): Promise<PgCliCommandResult> {
  return new Promise((resolve) => {
    const child = spawn(programPath, args, {
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });

    child.on("close", (code) => {
      resolve({ exitCode: code, stdout, stderr });
    });

    // If spawn fails (e.g. binary not found), it throws before returning result.
  });
}

export async function pgDumpToFile(outputFile: string): Promise<void> {
  const pgDumpPath = getPgDumpPath(BACKUP_PG_BIN_DIR || undefined);
  const dumpArgs = [
    "--format=custom",
    "--compress=9",
    "--no-owner",
    "--no-acl",
    "--schema=public",
    "--file",
    outputFile,
    "--dbname",
    stripPgbouncerParam(DATABASE_URL),
  ];

  const env = buildEnvWithPassword(DATABASE_URL);
  const result = await runProcess(pgDumpPath, dumpArgs, env);

  if (result.exitCode !== 0) {
    await logAction(null, "PG_DUMP_FAILED", "DatabaseBackup", null);
    throw new Error(`pg_dump failed: ${result.stderr || result.stdout}`);
  }
}

export async function pgRestoreFromFile(backupFile: string, targetDb: string): Promise<void> {
  const pgRestorePath = getPgRestorePath(BACKUP_PG_BIN_DIR || undefined);

  // Use explicit connection string for the target db, preserving host/port/params.
  const targetConn = withDatabase(DATABASE_URL, targetDb);

  // pg_restore will also use PGPASSWORD; set it from original URL.
  const env = buildEnvWithPassword(DATABASE_URL);

  const restoreArgs = [
    "--no-owner",
    "--no-acl",
    "--dbname",
    targetConn,
    backupFile,
  ];

  const result = await runProcess(pgRestorePath, restoreArgs, env);

  if (result.exitCode !== 0) {
    await logAction(null, "PG_RESTORE_FAILED", "DatabaseRestoreTest", null);
    throw new Error(`pg_restore failed: ${result.stderr || result.stdout}`);
  }
}

export async function pgRestoreDataOnlyFromFile(backupFile: string, targetDb: string): Promise<void> {
  const pgRestorePath = getPgRestorePath(BACKUP_PG_BIN_DIR || undefined);

  const targetConn = withDatabase(DATABASE_URL, targetDb);
  const env = buildEnvWithPassword(DATABASE_URL);

  // Skip schema/policies/extensions; restore only table data.
  const restoreArgs = [
    "--no-owner",
    "--no-acl",
    "--data-only",
    "--schema=public",
    "--dbname",
    targetConn,
    backupFile,
  ];

  const result = await runProcess(pgRestorePath, restoreArgs, env);

  if (result.exitCode !== 0) {
    await logAction(null, "PG_RESTORE_DATA_ONLY_FAILED", "DatabaseRestoreTest", null);
    throw new Error(`pg_restore (data-only) failed: ${result.stderr || result.stdout}`);
  }
}

export async function createdbDb(databaseName: string): Promise<void> {
  const createdbPath = getCreatedbPath(BACKUP_PG_BIN_DIR || undefined);
  const env = buildEnvWithPassword(DATABASE_URL);

  // createdb syntax: createdb [OPTION]... [DBNAME]
  // Connection options: -h/--host, -p/--port, -U/--username
  const parsed = parsePostgresUrl(stripPgbouncerParam(DATABASE_URL));
  const host = parsed.host;
  const port = parsed.port;
  const username = parsed.username;

  const args: string[] = [];
  if (host) args.push("--host", host);
  if (port) args.push("--port", port);
  if (username) args.push("--username", username);

  // Ensure we create DB from a known maintenance DB
  args.push("--maintenance-db=postgres");
  args.push(databaseName);

  const result = await runProcess(createdbPath, args, env);
  if (result.exitCode !== 0) {
    throw new Error(`createdb failed: ${result.stderr || result.stdout}`);
  }
}

export async function dropdbDb(databaseName: string): Promise<void> {
  const dropdbPath = getDropdbPath(BACKUP_PG_BIN_DIR || undefined);
  const env = buildEnvWithPassword(DATABASE_URL);

  // dropdb syntax: dropdb [OPTION]... DBNAME
  // Connection options: -h/--host, -p/--port, -U/--username
  const parsed = parsePostgresUrl(stripPgbouncerParam(DATABASE_URL));
  const host = parsed.host;
  const port = parsed.port;
  const username = parsed.username;

  const args: string[] = [];
  if (host) args.push("--host", host);
  if (port) args.push("--port", port);
  if (username) args.push("--username", username);

  // --if-exists is safe for retries
  args.push("--if-exists");
  // Ensure we connect to a known maintenance DB if needed
  args.push("--maintenance-db=postgres");
  args.push(databaseName);

  const result = await runProcess(dropdbPath, args, env);
  if (result.exitCode !== 0) {
    throw new Error(`dropdb failed: ${result.stderr || result.stdout}`);
  }
}

export async function psqlQuery(databaseName: string, sql: string): Promise<string> {
  const psqlPath = getPsqlPath(BACKUP_PG_BIN_DIR || undefined);

  const targetConn = withDatabase(DATABASE_URL, databaseName);
  const env = buildEnvWithPassword(DATABASE_URL);

  const args = ["--dbname", targetConn, "--tuples-only", "--no-align", "--quiet", "--command", sql];

  const result = await runProcess(psqlPath, args, env);

  if (result.exitCode !== 0) {
    throw new Error(`psql query failed: ${result.stderr || result.stdout}`);
  }

  return result.stdout.trim();
}
