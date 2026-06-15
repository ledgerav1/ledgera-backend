import { getNetSuiteTokensForCompany } from "../../integrations/integrationCredentialService";

import type {
  AccountingConnector,
  CreateInvoiceInput,
  InvoiceResponse,
  InvoiceStatus,
  SystemAccount,
  SystemTransaction,
} from "../types";

export class NetSuiteConnector implements AccountingConnector {
  async createInvoice(data: CreateInvoiceInput): Promise<InvoiceResponse> {
    // Ensures this connector owns credential access (no direct NetSuite API calls elsewhere).
    await getNetSuiteTokensForCompany(data.companyId);
    return { externalId: "netsuite_pending", status: "open" };
  }

  async getInvoiceStatus(invoiceId: string): Promise<InvoiceStatus> {
    await Promise.resolve();
    return { externalId: invoiceId, status: "open", paidAmount: 0 };
  }

  async recordPayment(invoiceId: string, amount: number): Promise<void> {
    await Promise.resolve();
    // Connector-specific NetSuite payment logic goes here.
    // For now we keep the app-side payment recording as-is.
    void invoiceId;
    void amount;
  }

  async fetchAccounts(companyId: string): Promise<SystemAccount[]> {
    await getNetSuiteTokensForCompany(companyId);
    return [];
  }

  async fetchTransactions(
    companyId: string,
    startDate: string,
    endDate: string
  ): Promise<SystemTransaction[]> {
    await getNetSuiteTokensForCompany(companyId);
    void startDate;
    void endDate;
    return [];
  }
}
