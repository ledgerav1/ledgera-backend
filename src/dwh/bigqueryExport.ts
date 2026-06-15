import { BigQuery } from "@google-cloud/bigquery";
import type { LedgeraDatasetV1 } from "./types";

export type BigQueryExportResult = {
  wroteToBigQuery: boolean;
  exportedAt: string;
  jobsFactRows: number;
  paymentsFactRows: number;
  technicianDimRows: number;
  serviceTypeDimRows: number;
};

function maybeTrim(value: string | undefined): string | undefined {
  return value?.trim() ? value.trim() : undefined;
}

function requireBigQueryEnv(): {
  projectId: string;
  datasetId: string;
  keyFilename?: string;
} {
  const projectId = requireEnv("BQ_PROJECT_ID");
  const datasetId = requireEnv("BQ_DATASET_ID");

  // Optional for local/dev:
  const keyFilename = maybeTrim(process.env.BQ_SERVICE_ACCOUNT_KEY_PATH);

  return { projectId, datasetId, keyFilename };
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing ENV: ${key}`);
  }
  return value;
}

async function insertRows(
  bigquery: BigQuery,
  datasetId: string,
  tableName: string,
  rows: Array<Record<string, unknown>>
): Promise<number> {
  if (rows.length === 0) return 0;

  const table = bigquery.dataset(datasetId).table(tableName);
  // Throws on failure.
  await table.insert(rows, { ignoreUnknownValues: true, skipInvalidRows: true });

  return rows.length;
}

/**
 * Dual-write adapter:
 * - companyId is treated as tenant_id
 * - exportedAt is the dataset.exportedAt timestamp
 *
 * NOTE: Tables must already exist with a schema compatible with inserted row fields.
 */
export async function exportLedgeraDatasetV1ToBigQuery(
  companyId: string,
  dataset: LedgeraDatasetV1
): Promise<BigQueryExportResult> {
  const exportedAt = dataset.exportedAt ?? new Date().toISOString();

  const projectId = maybeTrim(process.env.BQ_PROJECT_ID);
  const datasetId = maybeTrim(process.env.BQ_DATASET_ID);
  const keyFilename = maybeTrim(process.env.BQ_SERVICE_ACCOUNT_KEY_PATH);

  // If not configured, do not write (so local staging still works).
  if (!projectId || !datasetId) {
    return {
      wroteToBigQuery: false,
      exportedAt,
      jobsFactRows: 0,
      paymentsFactRows: 0,
      technicianDimRows: 0,
      serviceTypeDimRows: 0,
    };
  }

  const client = new BigQuery({
    projectId,
    ...(keyFilename ? { keyFilename } : {}),
  });

  const jobsRows: Array<Record<string, unknown>> = dataset.facts.jobs.map((j) => ({
    tenant_id: companyId,
    exported_at: exportedAt,
    job_id: j.id,
    technician_id: j.technicianId,
    service_type_id: j.serviceTypeId,

    invoiced_amount: j.invoicedAmount,
    cash_collected: j.cashCollected,

    labor_cost: j.laborCost,
    material_cost: j.materialCost,

    completed_at: j.completedAt,
    started_at: j.startedAt,

    job_status: j.jobStatus,
    phantom: j.phantom,

    created_at: j.createdAt,
  }));

  const paymentRows: Array<Record<string, unknown>> = dataset.facts.payments.map((p) => ({
    tenant_id: companyId,
    exported_at: exportedAt,
    payment_id: p.id,
    job_id: p.jobId,

    amount: p.amount,
    received_at: p.receivedAt,
    recovered: p.recovered,

    created_at: p.createdAt,
  }));

  const technicianRows: Array<Record<string, unknown>> = dataset.dimensions.technicians.map((t) => ({
    tenant_id: companyId,
    exported_at: exportedAt,
    technician_id: t.id,
    technician_name: t.name,
  }));

  const serviceTypeRows: Array<Record<string, unknown>> = dataset.dimensions.serviceTypes.map((st) => ({
    tenant_id: companyId,
    exported_at: exportedAt,
    service_type_id: st.id,
    service_type_name: st.name,
  }));

  const [jobsFactRows, paymentsFactRows, technicianDimRows, serviceTypeDimRows] = await Promise.all(
    [
      insertRows(client, datasetId, "jobs_fact_v1", jobsRows),
      insertRows(client, datasetId, "payments_fact_v1", paymentRows),
      insertRows(client, datasetId, "technician_dim_v1", technicianRows),
      insertRows(client, datasetId, "service_type_dim_v1", serviceTypeRows),
    ]
  );

  return {
    wroteToBigQuery: true,
    exportedAt,
    jobsFactRows,
    paymentsFactRows,
    technicianDimRows,
    serviceTypeDimRows,
  };
}

// Export env validator for future use (not required right now).
export function getBigQueryConfigOrThrow() {
  return requireBigQueryEnv();
}
