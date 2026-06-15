import { prisma } from "../prismaClient";

type MoneyAgg = { _sum: { amount: number | null } };
type JobsAgg = { _sum: { laborCost: number | null; materialCost: number | null } };

function isPrismaTableMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: unknown };
  return maybe.code === "P2021";
}

async function safeAggregate<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isPrismaTableMissing(error)) return fallback;
    throw error;
  }
}

export async function calculateRealCashFlow(companyId: string): Promise<{
  cashIn: number;
  cashOut: number;
  realCashFlow: number;
}> {
  const paymentsAgg = await safeAggregate<MoneyAgg>(
    () =>
      prisma.payment.aggregate({
        where: { companyId, recovered: true },
        _sum: { amount: true },
      }),
    { _sum: { amount: 0 } }
  );

  const jobsAgg = await safeAggregate<JobsAgg>(
    () =>
      prisma.job.aggregate({
        where: { companyId },
        _sum: { laborCost: true, materialCost: true },
      }),
    { _sum: { laborCost: 0, materialCost: 0 } }
  );

  const qbNonPayrollExpensesAgg = await safeAggregate<MoneyAgg>(
    () =>
      prisma.quickBooksExpense.aggregate({
        where: { companyId, category: { not: "payroll" } },
        _sum: { amount: true },
      }),
    { _sum: { amount: 0 } }
  );

  const payrollAgg = await safeAggregate<MoneyAgg>(
    () =>
      prisma.payrollExpense.aggregate({
        where: { companyId },
        _sum: { amount: true },
      }),
    { _sum: { amount: 0 } }
  );

  const cashIn = paymentsAgg._sum.amount ?? 0;
  const laborCost = jobsAgg._sum.laborCost ?? 0;
  const materialCost = jobsAgg._sum.materialCost ?? 0;

  const qbNonPayrollExpensesTotal = qbNonPayrollExpensesAgg._sum.amount ?? 0;
  const payrollTotal = payrollAgg._sum.amount ?? 0;

  // Mirror ebitdaForecast:
  // labor = job labor + payroll
  // materials = job materials
  // additional non-payroll QB expenses are treated as cash out beyond those two buckets.
  const cashOut = laborCost + materialCost + qbNonPayrollExpensesTotal + payrollTotal;

  return {
    cashIn,
    cashOut,
    realCashFlow: cashIn - cashOut,
  };
}
