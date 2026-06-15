import fs from "fs";
import path from "path";
import type { LedgeraDatasetV1 } from "./types";

export type LocalStagingExportResult = {
  exportDir: string;
  datasetPath: string;
  latestPath: string;
};

function getLocalStagingDir(): string {
  return process.env.DWH_LOCAL_STAGING_DIR?.trim() || "./dwh_staging";
}

function ensureDirExists(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function exportLedgeraDatasetV1ToLocalStaging(
  companyId: string,
  dataset: LedgeraDatasetV1
): LocalStagingExportResult {
  const baseDir = path.resolve(getLocalStagingDir());

  const exportedAt = dataset.exportedAt || new Date().toISOString();
  const ts = safeFileName(exportedAt);

  const companyDir = path.join(baseDir, companyId);
  ensureDirExists(companyDir);

  const exportDir = path.join(companyDir, `dataset_v1_${ts}`);
  ensureDirExists(exportDir);

  const datasetPath = path.join(exportDir, "ledgera_dataset_v1.json");
  const latestPath = path.join(companyDir, "ledgera_dataset_v1_latest.json");

  fs.writeFileSync(datasetPath, JSON.stringify(dataset, null, 2), { encoding: "utf8" });
  fs.writeFileSync(latestPath, JSON.stringify(dataset, null, 2), { encoding: "utf8" });

  return { exportDir, datasetPath, latestPath };
}
