import { prisma } from "../prismaClient";
import { NetSuiteConnector } from "./connectors/netsuiteConnector";
import { QuickBooksConnector } from "./connectors/quickbooksConnector";
import type { AccountingConnector } from "./types";

export type AccountingSystem = "quickbooks" | "netsuite";

export async function resolveAccountingConnector(companyId: string): Promise<AccountingConnector> {
  const company = await prisma.company.findFirst({
    where: { id: companyId },
    select: { accountingSystem: true },
  });

  if (!company) {
    throw new Error(`Company not found: ${companyId}`);
  }

  const accountingSystem = company.accountingSystem as AccountingSystem;

  switch (accountingSystem) {
    case "quickbooks":
      return new QuickBooksConnector();
    case "netsuite":
      return new NetSuiteConnector();
    default: {
      const neverValue: never = accountingSystem;
      throw new Error(`Unsupported accountingSystem: ${neverValue}`);
    }
  }
}
