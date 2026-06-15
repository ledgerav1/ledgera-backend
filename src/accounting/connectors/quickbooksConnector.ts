import { getQuickBooksTokensForCompany } from "../../integrations/integrationCredentialService";
import type { AccountingConnector as AccountingConnectorType } from "../types";

import type {
  AccountingConnector,
  CreateInvoiceInput,
  InvoiceResponse,
  InvoiceStatus,
  SystemAccount,
  SystemTransaction,
} from "../types";

export class QuickBooksConnector implements AccountingConnectorType {
  async createInvoice(data: CreateInvoiceInput): Promise<InvoiceResponse> {
    // Ensures the connector owns credential access (no other layer should talk to QuickBooks directly).
    await getQuickBooksTokensForCompany(data.companyId);
    throw new Error("QuickBooksConnector.createInvoice not implemented yet");
  }

  async getInvoiceStatus(invoiceId: string): Promise<InvoiceStatus> {
    throw new Error("QuickBooksConnector.getInvoiceStatus not implemented yet");
  }

  async recordPayment(invoiceId: string, amount: number): Promise<void> {
    throw new Error("QuickBooksConnector.recordPayment not implemented yet");
  }

  async fetchAccounts(companyId: string): Promise<SystemAccount[]> {
    // Ensure connector owns credential access.
    await getQuickBooksTokensForCompany(companyId);
    void companyId;
    return [];
  }

  async fetchTransactions(
    companyId: string,
    startDate: string,
    endDate: string
  ): Promise<SystemTransaction[]> {
    // Ensure connector owns credential access.
    await getQuickBooksTokensForCompany(companyId);
    void companyId;
    void startDate;
    void endDate;
    return [];
  }
}
