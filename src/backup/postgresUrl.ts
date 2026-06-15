export type PostgresUrlParts = {
  protocol: string;
  username: string;
  password: string;
  host: string;
  port?: string;
  database: string;
  params: string;
};

function normalizeDatabase(databasePathname: string): string {
  // pathname usually starts with "/db"
  if (!databasePathname) return "";
  return databasePathname.startsWith("/") ? databasePathname.slice(1) : databasePathname;
}

export function parsePostgresUrl(urlString: string): PostgresUrlParts {
  // URL parsing will correctly handle special characters when they are percent-encoded.
  const url = new URL(urlString);

  const protocol = url.protocol; // e.g. postgresql:
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const host = url.hostname;
  const port = url.port || undefined;
  const database = normalizeDatabase(url.pathname);
  const params = url.search ? url.search : "";

  return { protocol, username, password, host, port, database, params };
}

export function withDatabase(urlString: string, database: string): string {
  // pg_dump/pg_restore/psql (newer libpq) don’t accept the `pgbouncer` query param.
  // We strip it but keep the rest of the query parameters (e.g. sslmode).
  const url = new URL(urlString);

  url.searchParams.delete("pgbouncer");

  const protocol = url.protocol;
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const host = url.hostname;
  const port = url.port ? `:${url.port}` : "";

  const userInfo = `${encodeURIComponent(username)}:${encodeURIComponent(password)}`;
  const params = url.search ? url.search : "";

  return `${protocol}//${userInfo}@${host}${port}/${encodeURIComponent(
    database
  )}${params}`;
}

export function stripPgbouncerParam(urlString: string): string {
  const url = new URL(urlString);
  url.searchParams.delete("pgbouncer");
  return url.toString();
}

export function buildTempDatabaseName(prefix: string): string {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(
    now.getUTCDate()
  ).padStart(2, "0")}_${String(now.getUTCHours()).padStart(2, "0")}${String(
    now.getUTCMinutes()
  ).padStart(2, "0")}${String(now.getUTCSeconds()).padStart(2, "0")}`;
  // Keep it short enough for Postgres identifier limits.
  return `${prefix}${stamp}`.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 63);
}
