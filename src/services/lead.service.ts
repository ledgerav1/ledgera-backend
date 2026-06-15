import { Prisma } from "@prisma/client";
import { prisma } from "../prismaClient";

export type DemoLeadRecord = {
  name: string;
  company: string;
  email: string;
  revenueRange?: string | null;
  techCount?: number | null;
  currentSoftware?: string | null;

  // Optional tenant scoping for lead→job traceability.
  companyId?: string | null;

  bookingTime: Date;
  calendlyEventUri?: string | null;
  calendlyEventName?: string | null;

  phoneNumber?: string | null;
  phoneNumberNormalized?: string | null;

  rawPayload?: Prisma.InputJsonValue;
};

export async function createLead(data: DemoLeadRecord) {
  return prisma.demoLead.create({
    data,
  });
}

export async function updateLeadMeetingInfo(
  leadId: string,
  meeting: {
    joinUrl: string | null;
    hostUrl: string | null;
    zoomMeetingId: string | null;
  }
) {
  return prisma.demoLead.update({
    where: { id: leadId },
    data: {
      zoomJoinUrl: meeting.joinUrl,
      zoomHostUrl: meeting.hostUrl,
      zoomMeetingId: meeting.zoomMeetingId,
    },
  });
}

export async function getDemoLeads() {
  return prisma.demoLead.findMany({
    orderBy: { createdAt: "desc" },
    include: { meetings: true, followUps: true },
  });
}

export async function getDemoLeadById(leadId: string) {
  return prisma.demoLead.findUnique({
    where: { id: leadId },
    include: { meetings: true, followUps: true },
  });
}
