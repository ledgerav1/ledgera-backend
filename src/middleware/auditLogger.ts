import { logAction } from "../services/auditLog";

export async function logAccess(
  userId: string,
  action: string,
  resource: string,
  companyId: string
): Promise<void> {
  // Delegate to the existing audit logger to preserve fallback behavior.
  // Repo schema uses `entity`/`entityId` (not `resource`/`entityId` from your snippet).
  await logAction(userId, action, resource, null, companyId);
}
