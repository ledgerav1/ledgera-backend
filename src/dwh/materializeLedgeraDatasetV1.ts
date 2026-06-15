import { prisma } from "../prismaClient";
import { arAging } from "../services/arRiskEngine";
import { calculateRealCashFlow } from "../services/cashFlowEngine";
import { ebitdaForecast } from "../services/ebitdaForecast";
import { calculateLeakageScore } from "../services/leakageScoreEngine";
import { calculatePartsLeakageScore } from "../services/partsLeakageScoreEngine";
import { profitByService } from "../services/serviceProfitEngine";
import { profitByTechnician } from "../services/technicianProfitEngine";

import type {
  LedgeraDatasetV1,
  PaymentFactV1,
  JobFactV1,
  TechnicianDimV1,
  ServiceTypeDimV1,
} from "./types";

function toIso(date: Date): string {
  return date.toISOString();
}

function nullableToIso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

export async function materializeLedgeraDatasetV1(companyId: string): Promise<LedgeraDatasetV1> {
  const [company, jobs, payments, technicians, serviceTypes] = await Promise.all([
    prisma.company.findFirst({
      where: { id: companyId },
      select: { id: true, name: true },
    }),
    prisma.job.findMany({
      where: { companyId },
      select: {
        id: true,
        technicianId: true,
        serviceTypeId: true,

        invoicedAmount: true,
        cashCollected: true,

        laborCost: true,
        materialCost: true,

        completedAt: true,
        startedAt: true,
        jobStatus: true,
        phantom: true,

        createdAt: true,
      },
    }),
    prisma.payment.findMany({
      where: { companyId },
      select: {
        id: true,
        jobId: true,
        amount: true,
        receivedAt: true,
        recovered: true,
        createdAt: true,
      },
    }),
    prisma.technician.findMany({
      where: { companyId },
      select: { id: true, name: true },
    }),
    prisma.serviceType.findMany({
      where: { companyId },
      select: { id: true, name: true },
    }),
  ]);

  if (!company) {
    throw new Error(`Company not found for companyId=${companyId}`);
  }

  const jobsFacts: JobFactV1[] = jobs.map((j) => ({
    id: j.id,
    technicianId: j.technicianId ?? null,
    serviceTypeId: j.serviceTypeId ?? null,

    invoicedAmount: j.invoicedAmount,
    cashCollected: j.cashCollected,

    laborCost: j.laborCost,
    materialCost: j.materialCost,

    completedAt: toIso(j.completedAt),
    startedAt: nullableToIso(j.startedAt),

    jobStatus: j.jobStatus ?? null,
    phantom: j.phantom,

    createdAt: toIso(j.createdAt),
  }));

  const paymentFacts: PaymentFactV1[] = payments.map((p) => ({
    id: p.id,
    jobId: p.jobId ?? null,

    amount: p.amount,
    receivedAt: toIso(p.receivedAt),
    recovered: p.recovered,

    createdAt: toIso(p.createdAt),
  }));

  const techniciansDim: TechnicianDimV1[] = technicians.map((t) => ({
    id: t.id,
    name: t.name,
  }));

  const serviceTypesDim: ServiceTypeDimV1[] = serviceTypes.map((st) => ({
    id: st.id,
    name: st.name,
  }));

  const [cashFlow, ebitda, arAgingResult, partsLeakage, profByTechnician, profByServiceMap] =
    await Promise.all([
      calculateRealCashFlow(companyId),
      ebitdaForecast(companyId),
      arAging(companyId),
      calculatePartsLeakageScore(companyId),
      profitByTechnician(companyId),
      profitByService(companyId),
    ]);

  const latestLeakageHistory = await prisma.leakageScoreHistory.findFirst({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    select: {
      score: true,
      signal: true,
      totalLeakage: true,
      uncollectedRevenue: true,
      underpricedServices: true,
      laborInefficiency: true,
      createdAt: true,
    },
  });

  let leakageScoreLatest: LedgeraDatasetV1["metrics"]["leakageScoreLatest"] = latestLeakageHistory
    ? {
        score: latestLeakageHistory.score,
        signal: latestLeakageHistory.signal,
        totalLeakage: latestLeakageHistory.totalLeakage,
        uncollectedRevenue: latestLeakageHistory.uncollectedRevenue,
        underpricedServices: latestLeakageHistory.underpricedServices,
        laborInefficiency: latestLeakageHistory.laborInefficiency,
        createdAt: toIso(latestLeakageHistory.createdAt),
      }
    : null;

  // If there's no prior leakage history, compute once so the dataset isn't missing this metric.
  if (!leakageScoreLatest) {
    await calculateLeakageScore(companyId);
    const computedLatest = await prisma.leakageScoreHistory.findFirst({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      select: {
        score: true,
        signal: true,
        totalLeakage: true,
        uncollectedRevenue: true,
        underpricedServices: true,
        laborInefficiency: true,
        createdAt: true,
      },
    });

    if (computedLatest) {
      leakageScoreLatest = {
        score: computedLatest.score,
        signal: computedLatest.signal,
        totalLeakage: computedLatest.totalLeakage,
        uncollectedRevenue: computedLatest.uncollectedRevenue,
        underpricedServices: computedLatest.underpricedServices,
        laborInefficiency: computedLatest.laborInefficiency,
        createdAt: toIso(computedLatest.createdAt),
      };
    }
  }

  const profByTechnicianRows = Object.entries(profByTechnician).map(
    ([technicianId, profit]) => ({
      technicianId,
      technicianName: techniciansDim.find((t) => t.id === technicianId)?.name ?? null,
      profit,
    })
  );

  const serviceTypeNameById = new Map(serviceTypesDim.map((st) => [st.id, st.name]));
  const profByServiceTypeRows = Object.entries(profByServiceMap).map(
    ([serviceTypeId, profit]) => ({
      serviceTypeId,
      serviceTypeName: serviceTypeNameById.get(serviceTypeId) ?? null,
      profit,
    })
  );

  const dataset: LedgeraDatasetV1 = {
    datasetVersion: "ledgera_dataset_v1",
    exportedAt: new Date().toISOString(),
    company: {
      id: company.id,
      name: company.name,
      accountingSystem: null,
    },
    facts: {
      jobs: jobsFacts,
      payments: paymentFacts,
    },
    dimensions: {
      technicians: techniciansDim,
      serviceTypes: serviceTypesDim,
    },
    metrics: {
      cashFlow: cashFlow,
      ebitdaForecast: ebitda,
      leakageScoreLatest: leakageScoreLatest,
      arAging: arAgingResult,
      partsLeakageScore: partsLeakage,
      profitByTechnician: profByTechnicianRows,
      profitByServiceType: profByServiceTypeRows,
    },
  };

  return dataset;
}
