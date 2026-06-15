export type LeadIntelInput = {
  company: string;
  revenueRange?: string | null;
  techCount?: number | null;
  currentSoftware?: string | null;
};

export type CallSummaryInput = {
  mainPainPoints: string[];
  revenueLeaks: string[];
  buyingSignals: string[];
  urgencyLevel: "low" | "medium" | "high";
  recommendedNextStep: string;
};

export type FollowUpMessageInput = {
  company: string;
  painPoints: string[];
  revenueLeaks: string[];
};

function joinLines(lines: string[]) {
  return lines.filter(Boolean).join("\n");
}

export function buildPreCallPrompt(lead: LeadIntelInput) {
  return joinLines([
    "You are a financial intelligence analyst for HVAC businesses.",
    "",
    "Analyze this company before a sales call.",
    `Company: ${lead.company}`,
    `Estimated Revenue: ${lead.revenueRange || "Unknown"}`,
    `Tech Count: ${lead.techCount ?? "Unknown"}`,
    `Current Software: ${lead.currentSoftware || "Unknown"}`,
    "",
    "Return:",
    "1. Likely operational inefficiencies",
    "2. Cash flow risks",
    "3. Dispatch / invoicing weaknesses",
    "4. Where profit is likely leaking",
    "5. Best angle to position Ledgera",
  ]);
}

export function buildCallSummaryPrompt() {
  return joinLines([
    "Summarize this HVAC sales call:",
    "",
    "- Main pain points",
    "- Revenue leaks",
    "- Buying signals",
    "- Urgency level",
    "- Recommended next step",
  ]);
}

export function buildFollowUpMessage(input: FollowUpMessageInput) {
  const painPoints = input.painPoints.join(", ") || "operational inefficiencies";
  const leaks = input.revenueLeaks.join(", ") || "cash flow and profit leakage";
  return `Based on what you shared, there are likely 2–3 areas where ${input.company} is losing profit — mainly around ${painPoints} and ${leaks}. We should review the highest-leverage fixes next.`;
}
