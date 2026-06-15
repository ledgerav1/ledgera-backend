import { ebitdaForecast } from "../services/ebitdaForecast";
import { calculateLeakageScore } from "../services/leakageScoreEngine";
import { updateRecoveryMetrics } from "../services/recoveryMetricsEngine";
import { syncPayrollIntegration, type PayrollOAuthTokens } from "./payrollProvider";
import { syncQuickBooksIntegration, type QuickBooksOAuthTokens } from "./quickbooks";
import { syncServiceTitanIntegration, type ServiceTitanOAuthTokens } from "./serviceTitan";

export async function refreshCompanyIntelligence(companyId: string) {
  const [recoveryMetrics, leakageScore, ebitda] = await Promise.all([
    updateRecoveryMetrics(companyId),
    calculateLeakageScore(companyId),
    ebitdaForecast(companyId),
  ]);

  return {
    companyId,
    recoveryMetrics,
    leakageScore,
    ebitda,
  };
}

export async function syncServiceTitanAndRefresh(
  tokens: ServiceTitanOAuthTokens,
  companyId: string
) {
  const syncResult = await syncServiceTitanIntegration(tokens, companyId);
  const intelligence = await refreshCompanyIntelligence(companyId);

  return {
    syncResult,
    intelligence,
  };
}

export async function syncQuickBooksAndRefresh(
  tokens: QuickBooksOAuthTokens,
  companyId: string
) {
  const syncResult = await syncQuickBooksIntegration(tokens, companyId);
  const intelligence = await refreshCompanyIntelligence(companyId);

  return {
    syncResult,
    intelligence,
  };
}

export async function syncPayrollAndRefresh(
  tokens: PayrollOAuthTokens,
  companyId: string
) {
  const syncResult = await syncPayrollIntegration(tokens, companyId);
  const intelligence = await refreshCompanyIntelligence(companyId);

  return {
    syncResult,
    intelligence,
  };
}
