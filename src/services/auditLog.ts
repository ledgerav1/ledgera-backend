import fs from "fs";
import path from "path";
import { prisma } from "../prismaClient";

type AuditFallbackRecord = {
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  createdAt: string;
  fallback: true;
  errorMessage: string;
};

function fallbackAuditPath(): string {
  const backupDir = process.env.BACKUP_DIR ?? "./backups";
  return path.join(backupDir, "audit_evidence_fallback.jsonl");
}

function ensureFallbackDirExists(filePath: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

export async function logAction(
  userId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  companyId: string | null = null
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        companyId,
        action,
        entity,
        entityId,
      },
    });
  } catch (err: unknown) {
    // Do not block backup/restore on audit-log TLS errors.
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const rec: AuditFallbackRecord = {
      userId,
      action,
      entity,
      entityId,
      createdAt: new Date().toISOString(),
      fallback: true,
      errorMessage,
    };

    try {
      const filePath = fallbackAuditPath();
      ensureFallbackDirExists(filePath);
      fs.appendFileSync(filePath, JSON.stringify(rec) + "\n", { encoding: "utf8" });
    } catch {
      // Swallow fallback errors too—backup/restore must keep running.
    }
  }
}
