import { prisma } from "../prismaClient";

type PaymentRecord = {
  amount: number;
};

const PHANTOM_THRESHOLD =
  parseFloat(process.env.PHANTOM_DETECTION_THRESHOLD || "0.2");

/**
 * Detects:
 * 1. Phantom revenue (invoiced but not collected)
 * 2. Low margin jobs
 */
export async function scanForPhantomRevenue(companyId: string) {
  const jobs = await prisma.job.findMany({
    where: { companyId },
    include: {
      payments: true,
    },
  });

  for (const job of jobs) {
    // 💰 Total collected (cents)
    const totalPaid = (job.payments as PaymentRecord[]).reduce(
      (sum: number, payment: PaymentRecord) => sum + payment.amount,
      0
    );

    // 💰 Profit calculation (cents)
    const profit =
      job.invoicedAmount - (job.laborCost + job.materialCost);

    const margin =
      job.invoicedAmount > 0
        ? profit / job.invoicedAmount
        : 0;

    const isPhantom =
      job.invoicedAmount > 0 &&
      totalPaid <
        job.invoicedAmount * (1 - PHANTOM_THRESHOLD);

    const isLowMargin =
      margin < PHANTOM_THRESHOLD;

    await prisma.job.update({
      where: { id: job.id },
      data: {
        phantom: isPhantom,
        // Optional: you can add this field if you want
        // lowMarginFlag: isLowMargin
      },
    });
  }
}

/**
 * Marks a payment as recovered if it belongs
 * to a previously phantom job
 */
export async function attributeRecovery(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      job: true,
    },
  });

  if (!payment || !payment.job) return;

  if (payment.job.phantom) {
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        recovered: true,
      },
    });
  }
}
