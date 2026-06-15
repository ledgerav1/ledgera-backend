import { prisma } from "../prismaClient";
import { pricingEngine } from "./pricingEngine";
import { vendorLeakage } from "./vendorLeakageEngine";

type FixInputs = {
  fixPricing?: boolean;
  fixVendorCosts?: boolean;
  fixCollections?: boolean;
};

type EbitdaLiftSimulation = {
  projectedEBITDALift: number;
  valuationIncrease: number;
  appliedFixes: FixInputs;
};

type JobRecord = {
  invoicedAmount: number;
  cashCollected: number;
};

export async function ebitdaLiftSimulator(
  companyId: string,
  fixes: FixInputs
): Promise<EbitdaLiftSimulation> {
  const jobs = (await prisma.job.findMany({ where: { companyId } })) as JobRecord[];
  const pricing = await pricingEngine(companyId);
  const vendor = await vendorLeakage(companyId);

  let lift = 0;

  if (fixes.fixPricing) {
    const pricingLift = Math.max(pricing.recommendedMonthlyFee + pricing.recommendedSetupFee, 0);
    lift += pricingLift;
  }

  if (fixes.fixVendorCosts) {
    lift += vendor.vendorLeakage;
  }

  if (fixes.fixCollections) {
    const uncollected = jobs.reduce((sum, job) => sum + Math.max(job.invoicedAmount - job.cashCollected, 0), 0);
    lift += uncollected;
  }

  const multiple = 5;
  const valuationIncrease = lift * multiple;

  return {
    projectedEBITDALift: Math.round(lift),
    valuationIncrease: Math.round(valuationIncrease),
    appliedFixes: fixes,
  };
}
