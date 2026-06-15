import { prisma } from "../prismaClient";

export async function getPlatformStats(companyId: string) {
  const metrics = await prisma.recoveryMetrics.findMany({
    where: { companyId },
  });

  const totalRecovered = metrics.reduce((sum, m) => sum + m.totalRecovered, 0);

  const averageRecoveredPerClient =
    metrics.length === 0 ? 0 : totalRecovered / metrics.length;

  const totalAttempts = metrics.reduce((sum, m) => sum + m.totalRecoveryAttempts, 0);

  const totalSuccess = metrics.reduce((sum, m) => sum + m.successfulRecoveries, 0);

  const successRate = totalAttempts === 0 ? 0 : (totalSuccess / totalAttempts) * 100;

  const avgEBITDALift =
    metrics.length === 0
      ? 0
      : metrics.reduce((sum, m) => sum + m.totalEBITDALift, 0) / metrics.length;

  return {
    totalRecoveredAllTime: totalRecovered,
    averageRecoveredPerClient,
    recoverySuccessRate: Number(successRate.toFixed(2)),
    averageEBITDALiftPerClient: avgEBITDALift,
  };
}
