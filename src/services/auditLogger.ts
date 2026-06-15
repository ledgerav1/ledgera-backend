import fs from "fs";
import { prisma } from "../prismaClient";

type AuditInput = {
  companyId: string;
  entityType: string;
  entityId: string;
  action: string;
  amount?: number;
  metadata?: Record<string, unknown>;
};

type PaymentRecord = {
  amount: number;
};

export function logAudit(event: string, userId: string) {
  const entry = {
    event,
    userId,
    timestamp: new Date().toISOString(),
  };

  fs.appendFileSync("audit.log", JSON.stringify(entry) + "\n");
}

export async function logAuditEvent(input: AuditInput) {
  try {
    console.warn(
      "Audit logging skipped: no AuditLog model exists in the current Prisma schema.",
      input
    );
  } catch (error) {
    console.error("Failed to log audit event:", error);
  }
}

export async function getProvableNetRecovery(companyId: string): Promise<number> {
  const payments = (await prisma.payment.findMany({
    where: {
      companyId,
      recovered: true,
    },
    select: {
      amount: true,
    },
  })) as PaymentRecord[];

  return payments.reduce(
    (sum: number, payment: PaymentRecord) => sum + payment.amount,
    0
  );
}
