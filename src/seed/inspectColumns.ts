import dotenv from "dotenv";
import path from "path";

dotenv.config({
  path: path.resolve(__dirname, "..", "..", ".env"),
});

const { prisma } = require("../prismaClient") as typeof import("../prismaClient");

async function main() {
  const tables = ["Company", "Technician", "ServiceType", "Job", "Payment"] as const;

  const ctx = await prisma.$queryRawUnsafe<
    Array<{
      current_database: string;
      current_schema: string;
      search_path: string;
    }>
  >(
    `SELECT
       current_database() AS current_database,
       current_schema() AS current_schema,
       current_setting('search_path') AS search_path`
  );

  console.log("DB_CONTEXT");
  console.log(ctx[0] ?? null);

  const baseTableCount = await prisma.$queryRawUnsafe<
    Array<{ count: string }>
  >(
    `SELECT COUNT(*)::text AS count
     FROM information_schema.tables
     WHERE table_type = 'BASE TABLE'`
  );

  console.log("BASE_TABLE_COUNT");
  console.log(baseTableCount[0]?.count ?? null);

  const sampleBaseTables = await prisma.$queryRawUnsafe<
    Array<{ table_schema: string; table_name: string }>
  >(
    `SELECT table_schema, table_name
     FROM information_schema.tables
     WHERE table_type = 'BASE TABLE'
     ORDER BY table_schema, table_name
     LIMIT 50`
  );

  console.log("BASE_TABLES_SAMPLE");
  console.log(sampleBaseTables);

  const publicBaseTables = await prisma.$queryRawUnsafe<
    Array<{ table_name: string }>
  >(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_type = 'BASE TABLE'
       AND table_schema = 'public'
     ORDER BY table_name
     LIMIT 200`
  );

  console.log("PUBLIC_BASE_TABLES_SAMPLE");
  console.log(publicBaseTables);

  // DEBUG: hardcoded checks (no parameter binding) to validate information_schema visibility.
  // This helps diagnose whether Prisma's parameter binding is causing empty results.
  const debugHardcoded = await prisma.$queryRawUnsafe<
    Array<{ table_name: string }>
  >(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_type = 'BASE TABLE'
       AND table_schema = 'public'
       AND table_name IN ('Company','Technician','ServiceType','Job','Payment')
     ORDER BY table_name`
  );

  console.log("DEBUG_HARDCODED_MATCHES");
  console.log(debugHardcoded);

  const schemaStats = await prisma.$queryRawUnsafe<
    Array<{ table_schema: string; base_table_count: string }>
  >(
    `SELECT table_schema,
            COUNT(*)::text AS base_table_count
     FROM information_schema.tables
     WHERE table_type = 'BASE TABLE'
       AND table_schema NOT IN ('pg_catalog','information_schema')
     GROUP BY table_schema
     ORDER BY base_table_count DESC, table_schema
     LIMIT 30`
  );

  console.log("NON_SYSTEM_SCHEMA_STATS");
  console.log(schemaStats);

  const escapeSqlStringLiteral = (value: string): string => value.replace(/'/g, "''");

  for (const t of tables) {
    const tableName = escapeSqlStringLiteral(t);

    // Exact table lookup + columns extraction (no $1 placeholders).
    const tableMatches = await prisma.$queryRawUnsafe<
      Array<{ table_schema: string; table_name: string }>
    >(
      `SELECT table_schema, table_name
       FROM information_schema.tables
       WHERE table_type = 'BASE TABLE'
         AND table_schema = 'public'
         AND table_name = '${tableName}'
       ORDER BY table_schema, table_name
       LIMIT 50`
    );

    console.log(`TABLE=${t}`);
    console.log("TABLE_MATCHES");
    console.log(tableMatches);

    if (tableMatches.length === 0) {
      console.log("NO_TABLE_MATCHES (exact)");
      console.log([]);
      continue;
    }

    const rows = await prisma.$queryRawUnsafe<
      Array<{ table_schema: string; table_name: string; column_name: string }>
    >(
      `SELECT table_schema, table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = '${tableName}'
       ORDER BY ordinal_position`
    );

    const cols = rows.map((r) => r.column_name);
    console.log(`${tableMatches[0].table_schema}.${tableMatches[0].table_name} =>`);
    console.log(cols);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await prisma.$disconnect();
  } catch (e) {
    console.warn("disconnect failed (ignored):", e);
  }
  process.exit(1);
});
