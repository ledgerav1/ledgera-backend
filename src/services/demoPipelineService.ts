import { prisma } from "../prismaClient";
import { buildCallSummaryPrompt, buildFollowUpMessage, buildPreCallPrompt } from "./ai.service";
import { createLead, getDemoLeadById, updateLeadMeetingInfo } from "./lead.service";
import { normalizePhone } from "./phoneNormalization";
import { createZoomMeeting } from "./zoom.service";

export type CalendlyInviteeCreatedPayload = {
  event?: string;
  payload?: {
    invitee?: {
      name?: string;
      email?: string;
      text_reminder_number?: string;
    };
    event?: {
      start_time?: string;
      end_time?: string;
      uri?: string;
      name?: string;
    };
    questions_and_answers?: Array<{
      question?: string;
      answer?: string;
    }>;
    tracking?: Record<string, string | undefined>;
  };
};

export type ZoomMeetingInput = {
  leadId: string;
  topic: string;
  startTime: Date;
  durationMinutes?: number;
};

function getQuestionAnswer(
  questionsAndAnswers: Array<{ question?: string; answer?: string }> | undefined,
  needle: string
): string | null {
  const match = questionsAndAnswers?.find((item) =>
    item.question?.toLowerCase().includes(needle.toLowerCase())
  );
  const answer = match?.answer?.trim();
  return answer ? answer : null;
}

function getCalendlyQuestionValue(
  payload: CalendlyInviteeCreatedPayload["payload"],
  needle: string
): string | null {
  return getQuestionAnswer(payload?.questions_and_answers, needle);
}

export async function createLeadFromCalendly(payload: CalendlyInviteeCreatedPayload) {
  const invitee = payload.payload?.invitee;
  const event = payload.payload?.event;

  const email = invitee?.email?.trim();
  if (!email) {
    throw new Error("Calendly payload missing invitee email");
  }

  const name = invitee?.name?.trim() || email;
  const company = getCalendlyQuestionValue(payload.payload, "company") || "Unknown Company";
  const revenueRange = getCalendlyQuestionValue(payload.payload, "revenue");
  const techCountValue = getCalendlyQuestionValue(payload.payload, "tech");
  const currentSoftware = getCalendlyQuestionValue(payload.payload, "software");
  const phoneNumber = invitee?.text_reminder_number?.trim() || null;
  const phoneNumberNormalized = normalizePhone(phoneNumber);
  const bookingTime = event?.start_time ? new Date(event.start_time) : new Date();

  const companyRow = await prisma.company.findFirst({
    where: { name: company },
  });

  const lead = await createLead({
    name,
    company,
    companyId: companyRow?.id ?? null,
    email,
    revenueRange,
    techCount: techCountValue ? Number.parseInt(techCountValue, 10) : null,
    currentSoftware,
    bookingTime,
    calendlyEventUri: event?.uri ?? null,
    calendlyEventName: event?.name ?? null,
    phoneNumber,
    phoneNumberNormalized,
    rawPayload: payload as unknown as object,
  });

  const zoomMeeting = await createZoomForLead({
    leadId: lead.id,
    topic: `${company} | Ledgera Demo`,
    startTime: bookingTime,
  });

  await updateLeadMeetingInfo(lead.id, zoomMeeting);

  return getDemoLeadById(lead.id);
}

export async function createZoomForLead(input: ZoomMeetingInput) {
  const meetingDuration = Number(process.env.ZOOM_MEETING_DURATION_MINUTES || 45);
  return createZoomMeeting(
    {
      leadId: input.leadId,
      topic: input.topic,
      startTime: input.startTime,
    },
    Number.isFinite(meetingDuration) ? meetingDuration : 45
  );
}

export async function createFollowUpSummary(leadId: string) {
  const lead = await getDemoLeadById(leadId);

  if (!lead) {
    throw new Error("Lead not found");
  }

  const painPoints = [
    `Company: ${lead.company}`,
    lead.revenueRange ? `Revenue range: ${lead.revenueRange}` : null,
    lead.techCount != null ? `Tech count: ${lead.techCount}` : null,
    lead.currentSoftware ? `Current software: ${lead.currentSoftware}` : null,
  ].filter(Boolean) as string[];

  return {
    leadId: lead.id,
    status: "generated",
    summaryPrompt: buildCallSummaryPrompt(),
    preCallPrompt: buildPreCallPrompt({
      company: lead.company,
      revenueRange: lead.revenueRange,
      techCount: lead.techCount,
      currentSoftware: lead.currentSoftware,
    }),
    followUpMessage: buildFollowUpMessage({
      company: lead.company,
      painPoints,
      revenueLeaks: ["cash flow visibility", "job costing leaks", "AR cycle delays"],
    }),
    painPoints,
    recommendedAngle: "Cash flow visibility, job costing leaks, and AR cycle reduction",
    nextStep: "Send a tailored insight report and book the decision-maker follow-up",
  };
}
