import { resolveAccountingConnector } from "./connectorResolver";
import type { CreateInvoiceInput } from "./types";

export async function createInvoice(data: CreateInvoiceInput) {
  const connector = await resolveAccountingConnector(data.companyId);
  return connector.createInvoice(data);
}

export async function getInvoiceStatus(companyId: string, invoiceId: string) {
  const connector = await resolveAccountingConnector(companyId);
  return connector.getInvoiceStatus(invoiceId);
}

export async function recordPayment(
  companyId: string,
  invoiceId: string,
  amount: number
) {
  const connector = await resolveAccountingConnector(companyId);
  return connector.recordPayment(invoiceId, amount);
}
