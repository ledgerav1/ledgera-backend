import { prisma } from "../prismaClient";

type PaymentRecord = {
  amount: number;
  recovered: boolean;
  receivedAt: Date;
  createdAt: Date;
};

export async function updateRecoveryMetrics(companyId: string) {
  const payments = (await prisma.payment.findMany({
    where: { companyId },
  })) as PaymentRecord[];

  const recoveredPayments = payments.filter((payment: PaymentRecord) => payment.recovered);

  const totalRecovered = recoveredPayments.reduce(
    (sum: number, payment: PaymentRecord) => sum + payment.amount,
    0
  );

  const totalRecoveryAttempts = payments.length;
  const successfulRecoveries = recoveredPayments.length;

  let firstRecoveryAt: Date | null = null;
  let averageRecoveryTime: number | null = null;

  if (recoveredPayments.length > 0) {
    firstRecoveryAt = recoveredPayments
      .map((payment: PaymentRecord) => payment.receivedAt)
      .sort((a: Date, b: Date) => a.getTime() - b.getTime())[0];

    const recoveryTimes = recoveredPayments.map((payment: PaymentRecord) => {
      const days =
        (new Date(payment.receivedAt).getTime() - new Date(payment.createdAt).getTime()) /
        (1000 * 60 * 60 * 24);
      return days;
    });

    averageRecoveryTime =
      recoveryTimes.reduce((a: number, b: number) => a + b, 0) / recoveryTimes.length;
  }

  const successRate =
    totalRecoveryAttempts === 0 ? 0 : (successfulRecoveries / totalRecoveryAttempts) * 100;

  const metrics = await prisma.recoveryMetrics.upsert({
    where: { companyId },
    update: {
      totalRecovered,
      totalRecoveryAttempts,
      successfulRecoveries,
      firstRecoveryAt,
      averageRecoveryTime,
    },
    create: {
      companyId,
      totalRecovered,
      totalRecoveryAttempts,
      successfulRecoveries,
      firstRecoveryAt,
      averageRecoveryTime,
    },
  });

  return {
    ...metrics,
    successRate: Number(successRate.toFixed(2)),
  };
}
