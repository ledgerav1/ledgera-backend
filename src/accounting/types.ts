export type AccountingSystemType = "quickbooks" | "netsuite";

export interface AccountingConnector {
  createInvoice(data: CreateInvoiceInput): Promise<InvoiceResponse>;
  getInvoiceStatus(invoiceId: string): Promise<InvoiceStatus>;
  recordPayment(invoiceId: string, amount: number): Promise<void>;

  /**
   * Intelligence-layer support
   * - COA / normalization input
   * - Reconciliation / harmonization input
   */
  fetchAccounts(companyId: string): Promise<SystemAccount[]>;
  fetchTransactions(
    companyId: string,
    startDate: string,
    endDate: string
  ): Promise<SystemTransaction[]>;
}

export interface CreateInvoiceInput {
  companyId: string;
  customerName: string;
  amount: number;
  description: string;
}

export interface InvoiceResponse {
  externalId: string;
  status: string;
}

export interface InvoiceStatus {
  externalId: string;
  status: string;
  paidAmount: number;
}

/**
 * System-specific account record.
 * Connectors translate their vendor schema -> this interface.
 */
export interface SystemAccount {
  externalId: string;
  name: string;
  /**
   * Vendor-specific account category/type.
   * Normalization layer will harmonize this into a unified type.
   */
  type: string;
}

/**
 * System-specific transaction record.
 * Connectors translate their vendor schema -> this interface.
 */
export interface SystemTransaction {
  externalId: string;
  date: string; // ISO date or timestamp string
  amount: number; // positive/negative depending on vendor semantics
  description?: string;
}

/**
 * Unified COA entry returned by normalization layer.
 */
export interface UnifiedChartOfAccountsEntry {
  externalId: string;
  name: string;
  unifiedType: string;
  sourceSystem: AccountingSystemType;
}
