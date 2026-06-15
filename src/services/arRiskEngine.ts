import { prisma } from "../prismaClient";

type ArRiskJob = {
  id: string;
  completedAt: Date;
  invoicedAmount: number;
  cashCollected: number;
};

export async function arAging(companyId: string): Promise<
  {
    jobId: string;
    daysOutstanding: number;
    balance: number;
  }[]
> {
  const jobs = (await prisma.job.findMany({
    where: { companyId },
    select: {
      id: true,
      completedAt: true,
      invoicedAmount: true,
      cashCollected: true,
    },
  })) as ArRiskJob[];

  const now = new Date();

  return jobs.map((job) => {
    const days =
      (now.getTime() - new Date(job.completedAt).getTime()) / (1000 * 60 * 60 * 24);

    const balance = job.invoicedAmount - job.cashCollected;

    return {
      jobId: job.id,
      daysOutstanding: Math.floor(days),
      balance,
    };
  });
}
