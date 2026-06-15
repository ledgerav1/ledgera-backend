import { acquisitionScoreEngine } from "./acquisitionScoreEngine";
import { calculateLeakageScore } from "./leakageScoreEngine";
import { pricingEngine } from "./pricingEngine";
import { vendorLeakage } from "./vendorLeakageEngine";

type DiligenceReport = {
  acquisitionScore: number;
  investable: boolean;
  leakageScore: number;
  totalLeakage: number;
  vendorLeakage: number;
  pricingLeakage: number;
  signal: "PREMIUM TARGET" | "GOOD TARGET" | "FIX BEFORE SALE";
};

export async function diligenceReportEngine(companyId: string): Promise<DiligenceReport> {
  const [leakage, acquisition, vendor, pricing] = await Promise.all([
    calculateLeakageScore(companyId),
    acquisitionScoreEngine(companyId),
    vendorLeakage(companyId),
    pricingEngine(companyId),
  ]);

  const acquisitionScore = acquisition.acquisitionScore;
  const investable = acquisitionScore >= 60;

  return {
    acquisitionScore,
    investable,
    leakageScore: leakage.score,
    totalLeakage: leakage.totalLeakage,
    vendorLeakage: vendor.vendorLeakage,
    pricingLeakage: pricing.recommendedSetupFee + pricing.recommendedMonthlyFee,
    signal:
      acquisitionScore > 80
        ? "PREMIUM TARGET"
        : acquisitionScore > 60
          ? "GOOD TARGET"
          : "FIX BEFORE SALE",
  };
}

export const diligenceReport = diligenceReportEngine;
