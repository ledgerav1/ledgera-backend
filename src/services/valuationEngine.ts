import { ebitdaForecast } from "./ebitdaForecast";

export async function valuationMetrics(companyId: string) {
  const { ebitda } = await ebitdaForecast(companyId);

  const multiple = 5;
  const valuation = ebitda * multiple;

  return {
    ebitda,
    valuation,
    valuationReadiness:
      ebitda > 1_000_000 ? "Institutional Ready" : "Operational Improve",
  };
}
