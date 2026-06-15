import { prisma } from "../prismaClient";

type JobRecord = {
  cashCollected: number;
  invoicedAmount: number;
  phantom: boolean;
};

export async function recoveryAutomationEngine(companyId: string): Promise<{
  automatedRecoveryValue: number;
  recoverableJobs: number;
  flag: boolean;
}> {
  const jobs = (await prisma.job.findMany({ where: { companyId } })) as JobRecord[];

  const recoverableJobs = jobs.filter(
    (job: JobRecord) => job.cashCollected < job.invoicedAmount || job.phantom
  ).length;

  const automatedRecoveryValue = jobs.reduce((sum: number, job: JobRecord) => {
    if (job.cashCollected >= job.invoicedAmount && !job.phantom) {
      return sum;
    }

    const outstanding = Math.max(job.invoicedAmount - job.cashCollected, 0);
    const phantomAdjustment = job.phantom ? job.invoicedAmount : 0;
    return sum + outstanding + phantomAdjustment;
  }, 0);

  return {
    automatedRecoveryValue,
    recoverableJobs,
    flag: automatedRecoveryValue > 0,
  };
}
