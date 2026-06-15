import { prisma } from "../prismaClient";

type EbitdaJob = {
  cashCollected: number;
  laborCost: number;
  materialCost: number;
};

export async function ebitdaForecast(companyId: string): Promise<{
  revenue: number;
  labor: number;
  materials: number;
  ebitda: number;
}> {
  const [jobs, payroll, qbMaterials] = await Promise.all([
    prisma.job.findMany({
      where: { companyId },
      select: {
        cashCollected: true,
        laborCost: true,
        materialCost: true,
      },
    }),
    prisma.payrollExpense.aggregate({
      where: { companyId },
      _sum: { amount: true },
    }),
    prisma.quickBooksExpense.aggregate({
      where: { companyId, category: { not: "payroll" } },
      _sum: { amount: true },
    }),
  ]);

  const revenue = jobs.reduce((s: number, j: EbitdaJob) => s + j.cashCollected, 0);
  const laborFromJobs = jobs.reduce((s: number, j: EbitdaJob) => s + j.laborCost, 0);
  const materialsFromJobs = jobs.reduce((s: number, j: EbitdaJob) => s + j.materialCost, 0);

  const labor = laborFromJobs + (payroll._sum.amount ?? 0);
  const materials = materialsFromJobs + (qbMaterials._sum.amount ?? 0);
  const ebitda = revenue - labor - materials;

  return { revenue, labor, materials, ebitda };
}
