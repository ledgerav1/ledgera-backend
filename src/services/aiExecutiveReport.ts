import OpenAI from "openai";
import { ebitdaForecast } from "./ebitdaForecast";
import { marginAnalysis } from "./marginEngine";

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  return new OpenAI({ apiKey });
}

export async function generateExecutiveReport(companyId: string): Promise<string> {

  const margin = await marginAnalysis(companyId);
  const forecast = await ebitdaForecast(companyId);

  const prompt = `
Analyze this HVAC company data:
Margin: ${JSON.stringify(margin)}
Forecast: ${JSON.stringify(forecast)}

Provide:
- Key risks
- Margin leaks
- Productivity issues
- Immediate action steps
`.trim();

  const openai = getOpenAIClient();

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned an empty response");

  return content;
}
