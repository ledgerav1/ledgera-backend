import { prisma } from "../prismaClient";

export async function vendorLeakage(companyId: string): Promise<{
  vendorLeakage: number;
  flag: boolean;
}> {
  const jobs = await prisma.job.findMany({ where: { companyId } });

  let vendorLeakage = 0;

  for (const job of jobs) {
    const expectedMaterial = job.invoicedAmount * 0.25;

    if (job.materialCost > expectedMaterial) {
      vendorLeakage += job.materialCost - expectedMaterial;
    }
  }

  return {
    vendorLeakage,
    flag: vendorLeakage > 0,
  };
}
