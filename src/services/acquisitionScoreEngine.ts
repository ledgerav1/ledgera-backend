import { prisma } from "../prismaClient";

type ContractRecord = {
  signedAt: Date | null;
};

type JobRecord = {
  cashCollected: number;
  laborCost: number;
  materialCost: number;
  invoicedAmount: number;
};

export async function acquisitionScoreEngine(companyId: string): Promise<{
  acquisitionScore: number;
  signal: string;
}> {
  const [contracts, jobs] = await Promise.all([
    prisma.contract.findMany({ where: { companyId } }),
    prisma.job.findMany({ where: { companyId } }),
  ]);

  const typedContracts = contracts as ContractRecord[];
  const typedJobs = jobs as JobRecord[];

  const signedContracts = typedContracts.filter((contract: ContractRecord) => Boolean(contract.signedAt)).length;
  const totalContracts = typedContracts.length;
  const recoveredRevenue = typedJobs.reduce(
    (sum: number, job: JobRecord) => sum + Math.max(job.cashCollected - (job.laborCost + job.materialCost), 0),
    0
  );

  const contractConversion = totalContracts === 0 ? 0 : signedContracts / totalContracts;
  const revenueEfficiency =
    typedJobs.length === 0
      ? 0
      : recoveredRevenue /
        Math.max(
          typedJobs.reduce((sum: number, job: JobRecord) => sum + job.invoicedAmount, 0),
          1
        );

  const acquisitionScore = Number(((contractConversion * 60) + (revenueEfficiency * 40)).toFixed(2));

  let signal = "WEAK";
  if (acquisitionScore >= 80) signal = "STRONG";
  else if (acquisitionScore >= 60) signal = "GOOD";
  else if (acquisitionScore >= 40) signal = "FAIR";

  return {
    acquisitionScore,
    signal,
  };
}

export const acquisitionScore = acquisitionScoreEngine;
