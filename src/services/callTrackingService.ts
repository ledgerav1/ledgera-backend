import type { Prisma } from "@prisma/client";
import { prisma } from "../prismaClient";
import { normalizePhone } from "./phoneNormalization";

type TwilioCallParams = {
  companyId: string;

  fromPhoneRaw: string | null;
  toPhoneRaw: string | null;

  fromPhoneNormalized: string | null;
  toPhoneNormalized: string | null;

  rawParams: Record<string, string>;
};

function mapTwilioCallStatus(callStatus: string | undefined): { status: string | null; providerEventType: string | null } {
  if (!callStatus) return { status: null, providerEventType: null };

  const v = callStatus.toLowerCase();

  // Common Twilio Voice statuses: in-progress, ringing, answered, completed, no-answer, busy, failed
  if (v === "completed") return { status: "completed", providerEventType: "call_completed" };
  if (v === "in-progress" || v === "in_progress") return { status: "in_progress", providerEventType: "call_in_progress" };
  if (v === "answered") return { status: "answered", providerEventType: "call_answered" };
  if (v === "no-answer" || v === "no_answer") return { status: "missed", providerEventType: "call_no_answer" };
  if (v === "busy") return { status: "missed", providerEventType: "call_busy" };

  if (v === "failed") return { status: "failed", providerEventType: "call_failed" };

  return { status: callStatus, providerEventType: `twilio_${callStatus}` };
}

export async function createTwilioCallEventAndAttribute(params: TwilioCallParams) {
  const providerEventId = params.rawParams.CallSid ?? params.rawParams.callSid ?? null;

  const { status, providerEventType } = mapTwilioCallStatus(params.rawParams.CallStatus);

  const rawPayload: Prisma.InputJsonValue = params.rawParams as unknown as object;

  // Reuse existing call event if Twilio retries delivery with the same CallSid.
  const existing =
    providerEventId && typeof providerEventId === "string"
      ? await prisma.callEvent.findFirst({
          where: {
            provider: "twilio",
            providerEventId,
          } as any,
        })
      : null;

  const callEvent = existing
    ? await prisma.callEvent.update({
        where: { id: existing.id },
        data: {
          fromPhoneRaw: params.fromPhoneRaw,
          toPhoneRaw: params.toPhoneRaw,
          fromPhoneNormalized: params.fromPhoneNormalized,
          startedAt: null,
          endedAt: null,
          durationSeconds: null,
          status,
          providerEventType,
          rawPayload,
        },
      })
    : await prisma.callEvent.create({
        data: {
          provider: "twilio",
          providerEventId: providerEventId ?? null,
          providerEventType: providerEventType ?? null,
          fromPhoneRaw: params.fromPhoneRaw,
          toPhoneRaw: params.toPhoneRaw,
          fromPhoneNormalized: params.fromPhoneNormalized,
          rawPayload,
          status,
        },
      });

  // Attribution: only attribute when we can map the from phone → DemoLead.phoneNumberNormalized for this tenant.
  let demoLeadId: string | null = null;
  let jobId: string | null = null;

  if (params.fromPhoneNormalized) {
    const lead = await prisma.demoLead.findFirst({
      where: {
        companyId: params.companyId,
        phoneNumberNormalized: params.fromPhoneNormalized,
      },
      select: { id: true },
    });

    demoLeadId = lead?.id ?? null;

    if (demoLeadId) {
      const job = await prisma.job.findFirst({
        where: {
          companyId: params.companyId,
          demoLeadId: demoLeadId,
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });

      jobId = job?.id ?? null;
    }
  }

  // Upsert CallAttribution to avoid duplicates on retry.
  // callEventId is unique (schema constraint).
  let attribution: { id: string; demoLeadId: string | null; jobId: string | null } | null = null;

  try {
    attribution = await prisma.callAttribution.upsert({
      where: { callEventId: callEvent.id },
      update: {
        demoLeadId,
        jobId,
        attributionType: "phone_to_demoLead_to_job",
      },
      create: {
        companyId: params.companyId,
        callEventId: callEvent.id,
        demoLeadId,
        jobId,
        attributionType: "phone_to_demoLead_to_job",
      },
    });
  } catch (err) {
    // If upsert fails for any reason, don't break webhook ingestion.
    // We'll log and return partial.
    console.error("Call attribution upsert failed:", err);
  }

  return {
    callEventId: callEvent.id,
    attributed: Boolean(attribution && (attribution.demoLeadId || attribution.jobId)),
    demoLeadId,
    jobId,
    attributionId: attribution?.id ?? null,
  };
}
