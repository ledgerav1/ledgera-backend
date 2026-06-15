import { Response } from "express";
import { runRestoreTestOnce } from "../backup/restoreTestService";
import { asyncHandler } from "../middleware/asyncHandler";
import { AuthenticatedRequest } from "../middleware/auth";

export const triggerRestoreTest = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id ?? null;

    const result = await runRestoreTestOnce(userId);

    res.json({
      ok: true,
      backupFile: result.backupFile,
      tempDbName: result.tempDbName,
      validation: result.validation,
    });
  }
);
