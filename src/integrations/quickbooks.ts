import axios, { AxiosInstance } from "axios";
import { prisma } from "../prismaClient";

export type QuickBooksOAuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  realmId: string;
};

export type QuickBooksPayrollExpense = {
  externalId: string;
  amount: number;
  category: string;
  postedAt: Date;
};

export type QuickBooksRentExpense = {
  externalId: string;
  amount: number;
  postedAt: Date;
};

export type QuickBooksEquipmentExpense = {
  externalId: string;
  amount: number;
  postedAt: Date;
};

export type QuickBooksInsuranceExpense = {
  externalId: string;
  amount: number;
  postedAt: Date;
};

export type QuickBooksArApBalance = {
  receivables: number;
  payables: number;
};

export type QuickBooksBankBalance = {
  externalId: string;
  accountName: string;
  balance: number;
};

export type QuickBooksNormalizedPayload = {
  companyId: string;
  payroll: QuickBooksPayrollExpense[];
  rent: QuickBooksRentExpense[];
  equipment: QuickBooksEquipmentExpense[];
  insurance: QuickBooksInsuranceExpense[];
  arAp: QuickBooksArApBalance;
  bankBalances: QuickBooksBankBalance[];
  syncedAt: Date;
};

type QuickBooksFetchResult = Omit<QuickBooksNormalizedPayload, "companyId" | "syncedAt">;

function createClient(tokens: QuickBooksOAuthTokens): AxiosInstance {
  return axios.create({
    baseURL: "https://quickbooks.api.intuit.com/v3/company",
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number.parseFloat(value) || 0;
  return 0;
}

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function normalizeItems(items: unknown[] | undefined): Record<string, unknown>[] {
  return Array.isArray(items) ? (items as Record<string, unknown>[]) : [];
}

export async function fetchQuickBooksData(
  tokens: QuickBooksOAuthTokens
): Promise<QuickBooksFetchResult> {
  const client = createClient(tokens);
  const companyPath = `/${tokens.realmId}`;

  const [payrollResponse, rentResponse, equipmentResponse, insuranceResponse, arApResponse, bankResponse] =
    await Promise.all([
      client.get(`${companyPath}/reports/payroll`),
      client.get(`${companyPath}/reports/rent`),
      client.get(`${companyPath}/reports/equipment`),
      client.get(`${companyPath}/reports/insurance`),
      client.get(`${companyPath}/reports/ar-ap`),
      client.get(`${companyPath}/reports/bank-balances`),
    ]);

  const payroll = normalizeItems(payrollResponse.data?.items ?? payrollResponse.data?.Rows).map(
    (item: Record<string, unknown>) => ({
      externalId: String(item.id ?? item.externalId ?? item.txnId ?? ""),
      amount: toNumber(item.amount ?? item.total ?? item.value ?? 0),
      category: String(item.category ?? item.accountName ?? "payroll"),
      postedAt: toDate(item.postedAt ?? item.txnDate ?? item.date ?? new Date()),
    })
  );

  const rent = normalizeItems(rentResponse.data?.items ?? rentResponse.data?.Rows).map(
    (item: Record<string, unknown>) => ({
      externalId: String(item.id ?? item.externalId ?? item.txnId ?? ""),
      amount: toNumber(item.amount ?? item.total ?? item.value ?? 0),
      postedAt: toDate(item.postedAt ?? item.txnDate ?? item.date ?? new Date()),
    })
  );

  const equipment = normalizeItems(equipmentResponse.data?.items ?? equipmentResponse.data?.Rows).map(
    (item: Record<string, unknown>) => ({
      externalId: String(item.id ?? item.externalId ?? item.txnId ?? ""),
      amount: toNumber(item.amount ?? item.total ?? item.value ?? 0),
      postedAt: toDate(item.postedAt ?? item.txnDate ?? item.date ?? new Date()),
    })
  );

  const insurance = normalizeItems(insuranceResponse.data?.items ?? insuranceResponse.data?.Rows).map(
    (item: Record<string, unknown>) => ({
      externalId: String(item.id ?? item.externalId ?? item.txnId ?? ""),
      amount: toNumber(item.amount ?? item.total ?? item.value ?? 0),
      postedAt: toDate(item.postedAt ?? item.txnDate ?? item.date ?? new Date()),
    })
  );

  const arAp = {
    receivables: toNumber(arApResponse.data?.receivables ?? arApResponse.data?.ar ?? 0),
    payables: toNumber(arApResponse.data?.payables ?? arApResponse.data?.ap ?? 0),
  };

  const bankBalances = normalizeItems(bankResponse.data?.items ?? bankResponse.data?.Accounts).map(
    (item: Record<string, unknown>) => ({
      externalId: String(
        item.id ?? item.externalId ?? item.txnId ?? item.accountId ?? item.name ?? ""
      ),
      accountName: String(item.name ?? item.accountName ?? "Unknown"),
      balance: toNumber(item.balance ?? item.currentBalance ?? 0),
    })
  );

  return {
    payroll,
    rent,
    equipment,
    insurance,
    arAp,
    bankBalances,
  };
}

async function persistExpenseCategory(
  companyId: string,
  category: "payroll" | "rent" | "equipment" | "insurance",
  records: Array<{ externalId: string; amount: number; postedAt: Date }>
) {
  const upserts = records
    .filter((r) => r.externalId.trim().length > 0)
    .map((r) =>
      prisma.quickBooksExpense.upsert({
        where: {
          companyId_category_externalId: {
            companyId,
            category,
            externalId: r.externalId,
          },
        },
        update: {
          amount: r.amount,
          postedAt: r.postedAt,
        },
        create: {
          companyId,
          category,
          externalId: r.externalId,
          amount: r.amount,
          postedAt: r.postedAt,
        },
      })
    );

  await Promise.all(upserts);

  return {
    category,
    synced: upserts.length,
  };
}

async function persistPayrollExpensesFromQuickBooks(
  companyId: string,
  records: QuickBooksPayrollExpense[]
) {
  // Truth layer: always write payroll -> PayrollExpense.
  const provider = "quickbooks";

  const upserts = records
    .filter((r) => r.externalId.trim().length > 0)
    .map((r) =>
      prisma.payrollExpense.upsert({
        where: {
          companyId_provider_externalId: {
            companyId,
            provider,
            externalId: r.externalId,
          },
        },
        update: {
          amount: r.amount,
          postedAt: r.postedAt,
          category: r.category,
        },
        create: {
          companyId,
          provider,
          externalId: r.externalId,
          category: r.category,
          amount: r.amount,
          postedAt: r.postedAt,
        },
      })
    );

  await Promise.all(upserts);

  return {
    provider,
    synced: upserts.length,
  };
}

export async function persistQuickBooksData(payload: QuickBooksNormalizedPayload) {
  // Truth layer payroll comes from PayrollExpense.
  // QuickBooksExpense is kept for non-payroll categories.
  const [payrollTruth, rent, equipment, insurance] = await Promise.all([
    persistPayrollExpensesFromQuickBooks(payload.companyId, payload.payroll),
    persistExpenseCategory(payload.companyId, "rent", payload.rent),
    persistExpenseCategory(payload.companyId, "equipment", payload.equipment),
    persistExpenseCategory(payload.companyId, "insurance", payload.insurance),
  ]);

  const arApUpsert = prisma.quickBooksArAp.upsert({
    where: { companyId: payload.companyId },
    update: {
      receivables: payload.arAp.receivables,
      payables: payload.arAp.payables,
    },
    create: {
      companyId: payload.companyId,
      receivables: payload.arAp.receivables,
      payables: payload.arAp.payables,
    },
  });

  const bankUpserts = payload.bankBalances
    .filter((b) => b.externalId.trim().length > 0)
    .map((b) =>
      prisma.quickBooksBankBalance.upsert({
        where: {
          companyId_externalId: {
            companyId: payload.companyId,
            externalId: b.externalId,
          },
        },
        update: {
          accountName: b.accountName,
          balance: b.balance,
        },
        create: {
          companyId: payload.companyId,
          externalId: b.externalId,
          accountName: b.accountName,
          balance: b.balance,
        },
      })
    );

  await Promise.all([arApUpsert, Promise.all(bankUpserts)]);

  return {
    payrollTruth,
    rent,
    equipment,
    insurance,
    arAp: payload.arAp,
    bankBalancesSynced: payload.bankBalances.length,
  };
}

export async function syncQuickBooksIntegration(tokens: QuickBooksOAuthTokens, companyId: string) {
  const data = await fetchQuickBooksData(tokens);
  const normalized: QuickBooksNormalizedPayload = {
    companyId,
    ...data,
    syncedAt: new Date(),
  };

  const result = await persistQuickBooksData(normalized);

  return {
    ...result,
    normalized,
  };
}
