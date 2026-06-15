import { prisma } from "../../prismaClient";

/**
 * Reconciles recovery flags using the existing schema.
 *
 * Since there is no `Guarantee` model in Prisma, this service treats
 * "guarantee checks" as verification that payments tied to phantom jobs
 * are marked as recovered once they exist.
 */
export async function checkGuarantees() {
  const payments = await prisma.payment.findMany({
    where: {
      recovered: false,
      jobId: { not: null },
    },
    include: {
      job: true,
    },
  });

  for (const payment of payments) {
    if (!payment.job) continue;

    if (payment.job.phantom) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { recovered: true },
      });
    }
  }
}
