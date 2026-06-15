export type LedgeraDatasetV1 = {
  datasetVersion: "ledgera_dataset_v1";
  exportedAt: string; // ISO

  company: {
    id: string;
    name: string;
    accountingSystem: string | null;
  };

  facts: {
    jobs: JobFactV1[];
    payments: PaymentFactV1[];
  };

  dimensions: {
    technicians: TechnicianDimV1[];
    serviceTypes: ServiceTypeDimV1[];
  };

  metrics: {
    cashFlow: {
      cashIn: number;
      cashOut: number;
      realCashFlow: number;
    };

    ebitdaForecast: {
      revenue: number;
      labor: number;
      materials: number;
      ebitda: number;
    };

    leakageScoreLatest: {
      score: number;
      signal: string;
      totalLeakage: number;
      uncollectedRevenue: number;
      underpricedServices: number;
      laborInefficiency: number;
      createdAt: string; // ISO
    } | null;

    arAging: Array<{
      jobId: string;
      daysOutstanding: number;
      balance: number;
    }>;

    partsLeakageScore: {
      score: number;
      signal: string;
      jobsWithParts: number;
      distinctParts: number;
      partsPerJob: number;
      totalQuantity: number;
      totalCost: number;
      topParts: Array<{
        partExternalId: string | null;
        partName: string;
        quantity: number;
        totalCost: number;
      }>;
    };

    profitByTechnician: Array<{
      technicianId: string;
      technicianName: string | null;
      profit: number;
    }>;

    profitByServiceType: Array<{
      serviceTypeId: string;
      serviceTypeName: string | null;
      profit: number;
    }>;
  };
};

export type JobFactV1 = {
  id: string;
  technicianId: string | null;
  serviceTypeId: string | null;

  invoicedAmount: number;
  cashCollected: number;

  laborCost: number;
  materialCost: number;

  completedAt: string; // ISO
  startedAt: string | null; // ISO

  jobStatus: string | null;
  phantom: boolean;

  createdAt: string; // ISO
};

export type PaymentFactV1 = {
  id: string;
  jobId: string | null;

  amount: number;
  receivedAt: string; // ISO
  recovered: boolean;

  createdAt: string; // ISO
};

export type TechnicianDimV1 = {
  id: string;
  name: string;
};

export type ServiceTypeDimV1 = {
  id: string;
  name: string;
};
