import { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { arAging } from "../services/arRiskEngine";
import { getCallMetrics } from "../services/callMetricsEngine";
import { calculateRealCashFlow } from "../services/cashFlowEngine";
import { computeDashboardMetrics } from "../services/dashboardMetricsEngine";
import { calculateDispatchInefficiency } from "../services/dispatchInefficiencyEngine";
import { ebitdaForecast } from "../services/ebitdaForecast";
import { calculateLeakageScore } from "../services/leakageScoreEngine";
import { marginAnalysis } from "../services/marginEngine";
import { calculatePartsLeakageScore } from "../services/partsLeakageScoreEngine";
import { calculatePricingInconsistency } from "../services/pricingInconsistencyEngine";
import { revenuePerTech } from "../services/productivityEngine";
import { profitAlertEngine } from "../services/profitAlertEngine";
import { profitByService } from "../services/serviceProfitEngine";
import { technicianEfficiency } from "../services/technicianEfficiencyEngine";
import { profitByTechnician } from "../services/technicianProfitEngine";

export const cashFlow = asyncHandler(async (req: Request, res: Response) => {
  const result = await calculateRealCashFlow(req.params.companyId);
  res.json(result);
});

export const techProfit = asyncHandler(async (req: Request, res: Response) => {
  const result = await profitByTechnician(req.params.companyId);
  res.json(result);
});

export const productivity = asyncHandler(async (req: Request, res: Response) => {
  const result = await revenuePerTech(req.params.companyId);
  res.json(result);
});

export const arRisk = asyncHandler(async (req: Request, res: Response) => {
  const result = await arAging(req.params.companyId);
  res.json(result);
});

export const ebitda = asyncHandler(async (req: Request, res: Response) => {
  const result = await ebitdaForecast(req.params.companyId);
  res.json(result);
});

export const serviceProfit = asyncHandler(async (req: Request, res: Response) => {
  const result = await profitByService(req.params.companyId);
  res.json(result);
});

export const leakageScore = asyncHandler(async (req: Request, res: Response) => {
  const result = await calculateLeakageScore(req.params.companyId);
  res.json(result);
});

export const partsLeakageScore = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await calculatePartsLeakageScore(req.params.companyId);
    res.json(result);
  }
);

function parseWindowDays(req: Request, fallback: number): number {
  const windowDaysRaw = req.query.windowDays;
  const windowDays =
    typeof windowDaysRaw === "string" && windowDaysRaw.trim().length > 0
      ? Number.parseInt(windowDaysRaw, 10)
      : fallback;

  return Number.isFinite(windowDays) ? windowDays : fallback;
}

export const pricingInconsistency = asyncHandler(async (req: Request, res: Response) => {
  const result = await calculatePricingInconsistency(req.params.companyId);
  res.json(result);
});

export const dispatchInefficiency = asyncHandler(async (req: Request, res: Response) => {
  const windowDays = parseWindowDays(req, 30);
  const result = await calculateDispatchInefficiency(req.params.companyId, windowDays);
  res.json(result);
});

export const techEfficiency = asyncHandler(async (req: Request, res: Response) => {
  const windowDays = parseWindowDays(req, 30);
  const result = await technicianEfficiency(req.params.companyId, windowDays);
  res.json(result);
});

export const callMetrics = asyncHandler(async (req: Request, res: Response) => {
  const windowDays = parseWindowDays(req, 30);

  const result = await getCallMetrics(req.params.companyId, windowDays);
  res.json(result);
});

export const marginInsights = asyncHandler(async (req: Request, res: Response) => {
  const result = await marginAnalysis(req.params.companyId);
  res.json(result);
});

export const profitAlerts = asyncHandler(async (req: Request, res: Response) => {
  const windowDays = parseWindowDays(req, 30);
  const result = await profitAlertEngine(req.params.companyId, windowDays);
  res.json(result);
});

export const dashboardMetrics = asyncHandler(async (req: Request, res: Response) => {
  const windowDays = parseWindowDays(req, 30);
  const result = await computeDashboardMetrics(req.params.companyId, windowDays);
  res.json(result);
});
