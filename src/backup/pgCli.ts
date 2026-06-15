import fs from "fs";
import path from "path";

function exists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function resolveInDefaultLocations(binDirOverride: string | undefined, exeName: string): string {
  // Windows default locations we observed in this environment.
  const candidates: string[] = [];

  if (binDirOverride?.trim()) {
    candidates.push(path.join(binDirOverride, exeName));
  }

  candidates.push(path.join("C:\\Program Files\\PostgreSQL\\18\\bin", exeName));
  candidates.push(path.join("C:\\Program Files\\PostgreSQL\\16\\bin", exeName));

  for (const c of candidates) {
    if (exists(c)) return c;
  }

  // Return the first candidate anyway (useful for error messages); audit will catch failures.
  return candidates[0] ?? exeName;
}

export function getPgDumpPath(binDirOverride: string | undefined): string {
  return resolveInDefaultLocations(binDirOverride, "pg_dump.exe");
}

export function getPgRestorePath(binDirOverride: string | undefined): string {
  return resolveInDefaultLocations(binDirOverride, "pg_restore.exe");
}

export function getCreatedbPath(binDirOverride: string | undefined): string {
  return resolveInDefaultLocations(binDirOverride, "createdb.exe");
}

export function getDropdbPath(binDirOverride: string | undefined): string {
  return resolveInDefaultLocations(binDirOverride, "dropdb.exe");
}

export function getPsqlPath(binDirOverride: string | undefined): string {
  return resolveInDefaultLocations(binDirOverride, "psql.exe");
}
