import axios, { AxiosInstance } from "axios";
import { prisma } from "../prismaClient";

const prismaAny = prisma as any;
const serviceTitanJobEvent = prismaAny.serviceTitanJobEvent as
  | {
      create: (...args: unknown[]) => Promise<unknown>;
      findFirst: (...args: unknown[]) => Promise<unknown>;
    }
  | undefined;
const serviceTitanSyncRun = prismaAny.serviceTitanSyncRun as
  | {
      create: (...args: unknown[]) => Promise<unknown>;
      update: (...args: unknown[]) => Promise<unknown>;
    }
  | undefined;

function requireServiceTitanJobEvent() {
  if (!serviceTitanJobEvent) throw new Error("Prisma delegate serviceTitanJobEvent missing");
  return serviceTitanJobEvent;
}

function requireServiceTitanSyncRun() {
  if (!serviceTitanSyncRun) throw new Error("Prisma delegate serviceTitanSyncRun missing");
  return serviceTitanSyncRun;
}

export type ServiceTitanOAuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  tenantId: string;
};

export type ServiceTitanJobPartUsageCandidate = {
  partName: string;
  partExternalId: string | null;
  quantity: number;
  unitCost: number | null;
  totalCost: number | null;
  payload?: unknown;
};

export type ServiceTitanJob = {
  externalId: string;

  // Optional operational intelligence fields (depends on ServiceTitan’s /jobs payload)
  startedAt?: Date | null;
  jobStatus?: string | null;

  completedAt: Date;
  invoicedAmount: number;
  cashCollected: number;
  laborCost: number;
  materialCost: number;

  technicianName?: string | null;
  serviceTypeName?: string | null;

  // Best-effort: if /jobs payload includes equipment/parts attached, we’ll map it into
  // ServiceTitanJobPartUsage candidates.
  partUsageCandidates?: ServiceTitanJobPartUsageCandidate[];
};

export type ServiceTitanEstimate = {
  externalId: string;
  amount: number;
  status: string;
};

export type ServiceTitanTechHours = {
  technicianName: string;
  hours: number;
};

export type ServiceTitanCallback = {
  externalId: string;
  completedAt: Date;
};

export type ServiceTitanCloseRate = {
  estimateCount: number;
  closedCount: number;
  closeRate: number;
};

export type ServiceTitanNormalizedPayload = {
  companyId: string;
  jobs: ServiceTitanJob[];
  estimates: ServiceTitanEstimate[];
  techHours: ServiceTitanTechHours[];
  callbacks: ServiceTitanCallback[];
  closeRate: ServiceTitanCloseRate;
  syncedAt: Date;
};

type ServiceTitanFetchResult = {
  jobs: ServiceTitanJob[];
  estimates: ServiceTitanEstimate[];
  techHours: ServiceTitanTechHours[];
  callbacks: ServiceTitanCallback[];
  closeRate: ServiceTitanCloseRate;
};

function createClient(tokens: ServiceTitanOAuthTokens): AxiosInstance {
  return axios.create({
    baseURL: "https://api.servicetitan.io",
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      "x-tenant-id": tokens.tenantId,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number.parseFloat(value) || 0;
  return 0;
}

function toOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

async function resolveDemoLeadId(companyId: string, candidateExternalId: string) {
  if (!looksLikeUuid(candidateExternalId)) return null;

  const lead = await prisma.demoLead.findFirst({
    where: { id: candidateExternalId, companyId },
    select: { id: true },
  });

  return lead?.id ?? null;
}

function toOptionalDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  try {
    return toDate(value);
  } catch {
    return null;
  }
}

function toOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const v = value.trim();
    return v.length > 0 ? v : null;
  }
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function toCandidatesFromAny(value: unknown): ServiceTitanJobPartUsageCandidate[] {
  if (!Array.isArray(value)) return [];

  const candidates: ServiceTitanJobPartUsageCandidate[] = [];

  for (const entry of value) {
    if (typeof entry === "string") {
      candidates.push({
        partName: entry,
        partExternalId: null,
        quantity: 1,
        unitCost: null,
        totalCost: null,
        payload: entry,
      });
      continue;
    }

    if (!entry || typeof entry !== "object") continue;

    const record = entry as Record<string, unknown>;

    const partName =
      toOptionalString(record.partName) ??
      toOptionalString(record.name) ??
      toOptionalString(record.equipmentName) ??
      toOptionalString(record.part) ??
      toOptionalString(record.description) ??
      null;

    if (!partName) continue;

    const partExternalId =
      toOptionalString(record.partExternalId) ??
      toOptionalString(record.externalId) ??
      toOptionalString(record.id) ??
      toOptionalString(record.equipmentExternalId) ??
      toOptionalString(record.equipmentId) ??
      null;

    const quantity =
      toOptionalNumber(record.quantity) ??
      toOptionalNumber(record.qty) ??
      toOptionalNumber(record.count) ??
      1;

    const unitCost =
      toOptionalNumber(record.unitCost) ??
      toOptionalNumber(record.unit_price) ??
      toOptionalNumber(record.unitPrice) ??
      null;

    const totalCost =
      toOptionalNumber(record.totalCost) ??
      toOptionalNumber(record.total_price) ??
      toOptionalNumber(record.totalPrice) ??
      null;

    candidates.push({
      partName,
      partExternalId,
      quantity: typeof quantity === "number" && Number.isFinite(quantity) ? quantity : 1,
      unitCost,
      totalCost,
      payload: record,
    });
  }

  return candidates;
}

function extractJobPartUsageCandidates(job: Record<string, unknown>): ServiceTitanJobPartUsageCandidate[] {
  // Best-effort heuristics for equipment/parts attached on the job.
  // We intentionally keep this defensive because ServiceTitan payload shapes vary by account/version.
  const possibleFields = [
    "equipmentIds",
    "equipmentIdsList",
    "equipment",
    "equipments",
    "jobEquipment",
    "jobEquipments",
    "jobEquipmentIds",
    "attachedEquipment",
    "attachedEquipments",
    "parts",
    "jobParts",
    "partUsages",
    "partUsage",
    "partsUsed",
  ];

  for (const field of possibleFields) {
    const value = job[field];
    const candidates = toCandidatesFromAny(value);
    if (candidates.length > 0) return candidates;
  }

  // Sometimes the payload nests inside an object like { items: [...] }
  for (const field of possibleFields) {
    const value = job[field];
    if (value && typeof value === "object") {
      const nestedItems = (value as Record<string, unknown>).items;
      const nestedCandidates = toCandidatesFromAny(nestedItems);
      if (nestedCandidates.length > 0) return nestedCandidates;
    }
  }

  return [];
}

export async function fetchServiceTitanData(
  tokens: ServiceTitanOAuthTokens
): Promise<ServiceTitanFetchResult> {
  const client = createClient(tokens);

  const [jobsResponse, estimatesResponse, hoursResponse, callbacksResponse, closeRateResponse] =
    await Promise.all([
      client.get("/jobs"),
      client.get("/estimates"),
      client.get("/technicians/hours"),
      client.get("/callbacks"),
      client.get("/estimates/close-rate"),
    ]);

  const jobs = (jobsResponse.data?.items ?? jobsResponse.data ?? []).map(
    (job: Record<string, unknown>) => {
      const externalId = String(job.id ?? job.externalId ?? "");
      return {
        externalId,
        startedAt:
          toOptionalDate(job.startedAt ?? job.started_at ?? job.createdAt ?? job.created_at) ?? null,
        jobStatus: toOptionalString(
          job.jobStatus ?? job.job_status ?? job.status ?? job.state ?? null
        ),
        completedAt: toDate(job.completedAt ?? job.completed_at ?? new Date()),
        invoicedAmount: toNumber(job.invoicedAmount ?? job.invoiced_amount ?? job.total ?? 0),
        cashCollected: toNumber(job.cashCollected ?? job.cash_collected ?? job.paid ?? 0),
        laborCost: toNumber(job.laborCost ?? job.labor_cost ?? 0),
        materialCost: toNumber(job.materialCost ?? job.material_cost ?? 0),
        technicianName: (job.technicianName ?? job.technician_name ?? null) as string | null,
        serviceTypeName: (job.serviceTypeName ?? job.service_type_name ?? null) as string | null,
        partUsageCandidates: extractJobPartUsageCandidates(job),
      };
    }
  );

  const estimates = (estimatesResponse.data?.items ?? estimatesResponse.data ?? []).map(
    (estimate: Record<string, unknown>) => ({
      externalId: String(estimate.id ?? estimate.externalId ?? ""),
      amount: toNumber(estimate.amount ?? estimate.total ?? 0),
      status: String(estimate.status ?? "unknown"),
    })
  );

  const techHours = (hoursResponse.data?.items ?? hoursResponse.data ?? []).map(
    (item: Record<string, unknown>) => ({
      technicianName: String(item.technicianName ?? item.technician_name ?? "Unknown"),
      hours: toNumber(item.hours ?? item.totalHours ?? 0),
    })
  );

  const callbacks = (callbacksResponse.data?.items ?? callbacksResponse.data ?? []).map(
    (callback: Record<string, unknown>) => ({
      externalId: String(callback.id ?? callback.externalId ?? ""),
      completedAt: toDate(callback.completedAt ?? callback.completed_at ?? new Date()),
    })
  );

  const closeRate = {
    estimateCount: toNumber(
      closeRateResponse.data?.estimateCount ??
        closeRateResponse.data?.estimate_count ??
        estimates.length
    ),
    closedCount: toNumber(
      closeRateResponse.data?.closedCount ?? closeRateResponse.data?.closed_count ?? 0
    ),
    closeRate: toNumber(
      closeRateResponse.data?.closeRate ?? closeRateResponse.data?.close_rate ?? 0
    ),
  };

  return { jobs, estimates, techHours, callbacks, closeRate };
}

async function upsertJob(companyId: string, job: ServiceTitanJob) {
  if (!job.externalId) return null;

  const demoLeadId = await resolveDemoLeadId(companyId, job.externalId);

  const technician = job.technicianName
    ? await prisma.technician.upsert({
        where: {
          id: `${companyId}:${job.technicianName}`,
        },
        update: { name: job.technicianName, companyId },
        create: {
          id: `${companyId}:${job.technicianName}`,
          name: job.technicianName,
          companyId,
        },
      })
    : null;

  const serviceType = job.serviceTypeName
    ? await prisma.serviceType.upsert({
        where: {
          id: `${companyId}:${job.serviceTypeName}`,
        },
        update: { name: job.serviceTypeName, companyId },
        create: {
          id: `${companyId}:${job.serviceTypeName}`,
          name: job.serviceTypeName,
          companyId,
        },
      })
    : null;

  return prisma.job.upsert({
    where: { id: job.externalId },
    update: {
      companyId,
      demoLeadId,
      technicianId: technician?.id ?? null,
      serviceTypeId: serviceType?.id ?? null,
      invoicedAmount: job.invoicedAmount,
      cashCollected: job.cashCollected,
      laborCost: job.laborCost,
      materialCost: job.materialCost,
      completedAt: job.completedAt,
      startedAt: job.startedAt ?? null,
      jobStatus: job.jobStatus ?? null,
    },
    create: {
      id: job.externalId,
      companyId,
      demoLeadId,
      technicianId: technician?.id ?? null,
      serviceTypeId: serviceType?.id ?? null,
      invoicedAmount: job.invoicedAmount,
      cashCollected: job.cashCollected,
      laborCost: job.laborCost,
      materialCost: job.materialCost,
      completedAt: job.completedAt,
      startedAt: job.startedAt ?? null,
      jobStatus: job.jobStatus ?? null,
    },
  });
}

async function persistJobSnapshotEvent(params: {
  companyId: string;
  jobExternalId: string;
  occurredAt: Date;
  eventType: string;
  payload: unknown;
}) {
  return requireServiceTitanJobEvent().create({
    data: {
      companyId: params.companyId,
      jobExternalId: params.jobExternalId,
      eventType: params.eventType,
      occurredAt: params.occurredAt,
      payload: params.payload as any,
    },
  });
}

function aggregateCandidates(
  candidates: ServiceTitanJobPartUsageCandidate[]
): Array<Omit<ServiceTitanJobPartUsageCandidate, "payload"> & { payload: unknown }> {
  const map = new Map<
    string,
    {
      partName: string;
      partExternalId: string | null;
      quantity: number;
      unitCost: number | null;
      totalCost: number | null;
      totalCostProvided: boolean;
      payloads: unknown[];
    }
  >();

  for (const c of candidates) {
    const key = `${c.partExternalId ?? ""}::${c.partName}`;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, {
        partName: c.partName,
        partExternalId: c.partExternalId,
        quantity: c.quantity,
        unitCost: c.unitCost,
        totalCost: c.totalCost,
        totalCostProvided: c.totalCost !== null,
        payloads: c.payload !== undefined ? [c.payload] : [],
      });
      continue;
    }

    existing.quantity += c.quantity;

    if (c.totalCost !== null) {
      existing.totalCostProvided = true;
      existing.totalCost = (existing.totalCost ?? 0) + c.totalCost;
    }

    if (existing.unitCost === null && c.unitCost !== null) {
      existing.unitCost = c.unitCost;
    }

    if (c.payload !== undefined) existing.payloads.push(c.payload);
  }

  return Array.from(map.values()).map((v) => {
    const unitCost =
      v.totalCostProvided && v.quantity > 0 ? (v.totalCost ?? 0) / v.quantity : v.unitCost;

    return {
      partName: v.partName,
      partExternalId: v.partExternalId,
      quantity: v.quantity,
      unitCost: typeof unitCost === "number" && Number.isFinite(unitCost) ? unitCost : null,
      totalCost: v.totalCostProvided ? v.totalCost ?? null : null,
      payload: { aggregatedFrom: v.payloads.length },
    };
  });
}

async function persistJobPartUsage(params: {
  companyId: string;
  jobExternalId: string;
  candidates: ServiceTitanJobPartUsageCandidate[];
}) {
  const candidates = params.candidates ?? [];
  if (candidates.length === 0) return;

  const aggregated = aggregateCandidates(candidates).filter((c) => c.partName.trim().length > 0);

  if (aggregated.length === 0) return;

  await prisma.serviceTitanJobPartUsage.deleteMany({
    where: {
      companyId: params.companyId,
      jobExternalId: params.jobExternalId,
    },
  });

  await prisma.serviceTitanJobPartUsage.createMany({
    data: aggregated.map((c) => ({
      companyId: params.companyId,
      jobExternalId: params.jobExternalId,
      partName: c.partName,
      partExternalId: c.partExternalId,
      quantity: c.quantity,
      unitCost: c.unitCost,
      totalCost: c.totalCost,
      payload: c.payload as any,
    })),
  });
}

export async function persistServiceTitanData(payload: ServiceTitanNormalizedPayload) {
  const upserts = payload.jobs.map(async (job) => {
    const previous = await prisma.serviceTitanJobEvent.findFirst({
      where: { companyId: payload.companyId, jobExternalId: job.externalId },
      orderBy: { occurredAt: "desc" },
      select: { payload: true },
    });

    const previousObj = previous?.payload as Record<string, unknown> | null;
    const previousJobStatus =
      typeof previousObj?.jobStatus === "string" ? previousObj?.jobStatus : null;

    await upsertJob(payload.companyId, job);

    await persistJobSnapshotEvent({
      companyId: payload.companyId,
      jobExternalId: job.externalId,
      occurredAt: payload.syncedAt,
      eventType: "JOB_SYNC_SNAPSHOT",
      payload: {
        completedAt: job.completedAt,
        startedAt: job.startedAt,
        jobStatus: job.jobStatus,
        invoicedAmount: job.invoicedAmount,
        cashCollected: job.cashCollected,
        laborCost: job.laborCost,
        materialCost: job.materialCost,
        technicianName: job.technicianName,
        serviceTypeName: job.serviceTypeName,
      },
    });

    // Persist job part usage (best-effort from /jobs payload fields).
    if (job.partUsageCandidates && job.partUsageCandidates.length > 0) {
      await persistJobPartUsage({
        companyId: payload.companyId,
        jobExternalId: job.externalId,
        candidates: job.partUsageCandidates,
      });
    }

    // MVP: emit JOB_STATUS_CHANGED when ServiceTitan /jobs jobStatus differs from the last stored event.
    // This keeps a timeline we can later extend with startedAt/GPS/parts usage.
    if (job.jobStatus && previousJobStatus !== job.jobStatus) {
      await requireServiceTitanJobEvent().create({
        data: {
          companyId: payload.companyId,
          jobExternalId: job.externalId,
          eventType: "JOB_STATUS_CHANGED",
          occurredAt: payload.syncedAt,
          payload: {
            from: previousJobStatus,
            to: job.jobStatus,
            // include the same snapshot fields for easier downstream analytics
            completedAt: job.completedAt,
            startedAt: job.startedAt,
            invoicedAmount: job.invoicedAmount,
            cashCollected: job.cashCollected,
            laborCost: job.laborCost,
            materialCost: job.materialCost,
            technicianName: job.technicianName,
            serviceTypeName: job.serviceTypeName,
          } as any,
        },
      });
    }
  });

  await Promise.all(upserts);

  return {
    jobsSynced: payload.jobs.length,
    estimatesSynced: payload.estimates.length,
    techHoursSynced: payload.techHours.length,
    callbacksSynced: payload.callbacks.length,
  };
}

export async function syncServiceTitanIntegration(
  tokens: ServiceTitanOAuthTokens,
  companyId: string
) {
  const data = await fetchServiceTitanData(tokens);

  const normalized: ServiceTitanNormalizedPayload = {
    companyId,
    ...data,
    syncedAt: new Date(),
  };

  const syncRun = await requireServiceTitanSyncRun().create({
    data: {
      companyId,
    },
  });

  const result = await persistServiceTitanData(normalized);

  await requireServiceTitanSyncRun().update({
    where: { id: (syncRun as any).id },
    data: {
      jobCount: result.jobsSynced,
      estimateCount: result.estimatesSynced,
      techHoursCount: result.techHoursSynced,
      callbackCount: result.callbacksSynced,
      closeRateJson: normalized.closeRate as any,
    },
  });

  return {
    ...result,
    normalized,
  };
}
