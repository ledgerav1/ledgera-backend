import { Response } from "express";
import { exportLedgeraDatasetV1ToLocalStaging } from "../dwh/localStagingExport";
import { materializeLedgeraDatasetV1 } from "../dwh/materializeLedgeraDatasetV1";
import { AuthenticatedRequest } from "../middleware/auth";
import { logAction } from "../services/auditLog";
import { AppError } from "./AppError";
import { asyncHandler } from "./asyncHandler";
import { dwhExportQueue } from "./dwhExportJob";

export const materializeDatasetV1 = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { companyId } = req.params;
    if (!companyId) {
      throw new AppError("Missing companyId", 400);
    }

    const userId = req.user?.id ?? null;

    // Compute the canonical dataset (single source of truth)
    const dataset = await materializeLedgeraDatasetV1(companyId);

    const localExportResult = exportLedgeraDatasetV1ToLocalStaging(companyId, dataset);

    // Execute BigQuery export (via the queue placeholder).
    const bigQueryExportResult = await dwhExportQueue.add({ companyId, dataset });

    await logAction(
      userId,
      "dwh_materialize",
      "LedgeraDatasetV1",
      dataset.exportedAt,
      companyId
    );

    res.json({
      datasetVersion: dataset.datasetVersion,
      company: dataset.company,
      exportedAt: dataset.exportedAt,
      localExportResult,
      bigQueryExportResult,
    });
  }
);
