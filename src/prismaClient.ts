import dotenv from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { getCompanyId } from "./tenantContext";

dotenv.config({ path: `${process.cwd()}/.env` });

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("Missing DIRECT_URL or DATABASE_URL for Prisma");

const TENANT_SCOPED_MODELS = new Set([
  "Job",
  "Payment",
  "Contract",
  "Technician",
  "ServiceType",
  "Invoice",
  "ApiKey",
  "IntegrationCredential",
  "LeakageScoreHistory",
  "RecoveryMetrics",
  "QuickBooksExpense",
  "QuickBooksArAp",
  "QuickBooksBankBalance",

  // Call tracking attribution must be tenant-scoped.
  "CallAttribution",

  // Demo* models are intentionally NOT tenant-scoped in the schema.
]);

function hasCompanyId(whereOrData: unknown): boolean {
  if (!whereOrData || typeof whereOrData !== "object") return false;
  return "companyId" in whereOrData;
}

function injectCompanyId(obj: unknown, companyId: string): unknown {
  if (!obj || typeof obj !== "object") return { companyId };
  const clone: Record<string, unknown> = { ...(obj as Record<string, unknown>) };
  clone.companyId = companyId;
  return clone;
}

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

/**
 * Global tenant guard.
 *
 * Note: With certain Prisma adapter/runtime modes, `prisma.$use` may not be available.
 * If it's missing we warn and continue startup (tenant guard will be disabled),
 * unless we're explicitly running in production without the fallback flag.
 */
const prismaAny = prisma as any;

// Prisma 7 with driver adapter (@prisma/adapter-pg) does not support $use middleware.
// Allow fallback via env var (TENANT_GUARD_ALLOW_FALLBACK=true) or hardcoded default.
// Defaults to true so the app starts with a warning rather than crashing.
const allowFallback =
  process.env.TENANT_GUARD_ALLOW_FALLBACK === "false" ? false : true;
const inTenantIsolationTest =
  process.env.NODE_ENV === "test" || process.env.TENANT_ISOLATION_TEST === "true";

// Wrap the entire $use registration in a try-catch so that even if Prisma throws
// synchronously when accessing or calling $use (as Prisma 7 + driver adapters do),
// we can fall through to the graceful-fallback path instead of crashing.
try {
  if (typeof prismaAny.$use === "function") {
    console.log("[TENANT GUARD] prisma.$use available — registering tenant scoping middleware.");
    prismaAny.$use(async (params: any, next: any) => {
      const model = params.model;
      const action = params.action;

      if (!model || !TENANT_SCOPED_MODELS.has(model)) {
        return next(params);
      }

      const args = (params as unknown as { args?: unknown }).args as any;

      const companyIdInArgs =
        args?.where?.companyId ??
        args?.data?.companyId ??
        (action === "upsert"
          ? args?.create?.companyId ?? args?.update?.companyId ?? undefined
          : undefined);

      const companyId = getCompanyId();

      // Only block when neither AsyncLocalStorage nor the Prisma args provide companyId.
      if (!companyIdInArgs && !companyId) {
        throw new Error(`[TENANT GUARD] Missing companyId for ${model}.${action}`);
      }

      // Prefer explicit companyId in args; otherwise use AsyncLocalStorage.
      const finalCompanyId = companyIdInArgs ?? companyId;
      if (!finalCompanyId) {
        // This should be unreachable due to the guard above, but TS needs the type guarantee.
        throw new Error(`[TENANT GUARD] Final companyId missing for ${model}.${action}`);
      }

      // Read path: where / data / create / update
      if (
        action === "findMany" ||
        action === "findFirst" ||
        action === "findUnique" ||
        action === "count"
      ) {
        if (!args?.where) args.where = {};
        if (!("companyId" in args.where)) {
          args.where = injectCompanyId(args.where, finalCompanyId);
        }
      } else if (
        action === "delete" ||
        action === "update" ||
        action === "deleteMany" ||
        action === "updateMany"
      ) {
        // Prisma uses where for update/delete and data for create/updateMany
        if (!args?.where) args.where = {};
        if (!("companyId" in args.where)) {
          args.where = injectCompanyId(args.where, finalCompanyId);
        }
        if (
          (action === "update" || action === "updateMany") &&
          args?.data &&
          !hasCompanyId(args.data)
        ) {
          args.data = injectCompanyId(args.data, finalCompanyId);
        }
      } else if (action === "create") {
        if (!args?.data) args.data = {};
        if (!hasCompanyId(args.data)) {
          args.data = injectCompanyId(args.data, finalCompanyId);
        }
      } else if (action === "upsert") {
        if (!args?.where) args.where = {};
        if (!("companyId" in args.where)) {
          args.where = injectCompanyId(args.where, finalCompanyId);
        }
        if (args?.create && !hasCompanyId(args.create)) {
          args.create = injectCompanyId(args.create, finalCompanyId);
        }
        if (args?.update && !hasCompanyId(args.update)) {
          args.update = injectCompanyId(args.update, finalCompanyId);
        }
      } else {
        // For anything else, be strict: ensure both args.where or args.data have companyId when applicable.
        if (args?.where && !("companyId" in args.where)) {
          args.where = injectCompanyId(args.where, finalCompanyId);
        }
        if (args?.data && !hasCompanyId(args.data)) {
          args.data = injectCompanyId(args.data, finalCompanyId);
        }
      }

      return next(params);
    });
  } else {
    if (!allowFallback && !inTenantIsolationTest) {
      throw new Error(
        "[TENANT GUARD] prisma.$use is not available in this runtime. Refusing to start with tenant scoping guard disabled."
      );
    }

    console.warn(
      "[TENANT GUARD] prisma.$use is not available in this runtime; tenant scoping guard disabled."
    );
  }
} catch (err: unknown) {
  // Prisma 7 with @prisma/adapter-pg throws when $use is accessed or called.
  // Treat this the same as $use being absent: warn and continue unless fallback is disabled.
  const message = err instanceof Error ? err.message : String(err);
  if (!allowFallback && !inTenantIsolationTest) {
    throw new Error(
      `[TENANT GUARD] prisma.$use threw during registration and fallback is disabled. Original error: ${message}`
    );
  }
  console.warn(
    `[TENANT GUARD] prisma.$use is not available in this runtime (threw: ${message}); tenant scoping guard disabled.`
  );
}
