import type { BigQueryExportResult } from "../dwh/bigqueryExport";
import { exportLedgeraDatasetV1ToBigQuery } from "../dwh/bigqueryExport";
import type { LedgeraDatasetV1 } from "../dwh/types";

// This is a conceptual placeholder for a background job queue.
// In a real application, this would be implemented with a library like
// BullMQ, RabbitMQ, or a cloud service like AWS SQS.
interface DwhExportJobData {
  companyId: string;
  dataset: LedgeraDatasetV1;
}

class DwhExportQueue {
  async add(jobData: DwhExportJobData): Promise<BigQueryExportResult> {
    console.log(`[JobQueue] Adding DWH export job for company ${jobData.companyId}`);

    try {
      // Execute directly (placeholder for a real durable background worker).
      const result = await exportLedgeraDatasetV1ToBigQuery(jobData.companyId, jobData.dataset);
      console.log("[JobQueue] DWH BigQuery export result", result);
      return result;
    } catch (err) {
      console.error("[JobQueue] DWH BigQuery export failed", err);

      const exportedAt = jobData.dataset.exportedAt ?? new Date().toISOString();

      return {
        wroteToBigQuery: false,
        exportedAt,
        jobsFactRows: 0,
        paymentsFactRows: 0,
        technicianDimRows: 0,
        serviceTypeDimRows: 0,
      };
    }
  }
}

export const dwhExportQueue = new DwhExportQueue();
