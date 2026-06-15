import { Request, Response, Router } from "express";
import { prisma } from "../prismaClient";

import {
  CalendlyInviteeCreatedPayload,
  createFollowUpSummary,
  createLeadFromCalendly,
} from "../services/demoPipelineService";

const router = Router();

router.post("/calendly/webhook", async (req: Request, res: Response) => {
  try {
    const payload = req.body as CalendlyInviteeCreatedPayload;
    const eventType = payload?.event || req.body?.event;

    if (eventType && eventType !== "invitee.created") {
      return res.status(200).json({ received: true, ignored: true, eventType });
    }

    const lead = await createLeadFromCalendly(payload);
    return res.status(201).json({ success: true, lead });
  } catch (error) {
    console.error("Calendly webhook processing failed:", error);
    return res.status(500).json({ error: "Failed to process Calendly webhook" });
  }
});

router.get("/leads", async (_req: Request, res: Response) => {
  try {
    const leads = await prisma.demoLead.findMany({
      orderBy: { createdAt: "desc" },
      include: { meetings: true, followUps: true },
    });

    return res.json(leads);
  } catch (error) {
    console.error("Failed to fetch demo leads:", error);
    return res.status(500).json({ error: "Failed to fetch demo leads" });
  }
});

router.get("/leads/:leadId", async (req: Request, res: Response) => {
  try {
    const lead = await prisma.demoLead.findUnique({
      where: { id: req.params.leadId },
      include: { meetings: true, followUps: true },
    });

    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    return res.json(lead);
  } catch (error) {
    console.error("Failed to fetch demo lead:", error);
    return res.status(500).json({ error: "Failed to fetch demo lead" });
  }
});

router.post("/leads/:leadId/follow-up", async (req: Request, res: Response) => {
  try {
    const followUp = await createFollowUpSummary(req.params.leadId);
    return res.status(201).json({ success: true, followUp });
  } catch (error) {
    console.error("Failed to generate follow-up summary:", error);
    return res.status(500).json({ error: "Failed to generate follow-up summary" });
  }
});

export default router;
