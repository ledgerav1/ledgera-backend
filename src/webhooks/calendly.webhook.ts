import crypto from "crypto";
import { Request, Response, Router } from "express";
import { prisma } from "../prismaClient";
import { createFollowUpSummary, createLeadFromCalendly } from "../services/demoPipelineService";

const router = Router();

type CalendlySignatureParts = { t: string; v1: string };

function parseCalendlyWebhookSignature(headerValue: string | undefined): CalendlySignatureParts | null {
  if (!headerValue) return null;

  // Format: "t=<ts>,v1=<hex>"
  const parts = headerValue
    .split(",")
    .map((p) => p.trim())
    .map((p) => p.split("="))
    .filter((kv) => kv.length === 2);

  const map: Record<string, string> = {};
  for (const [k, v] of parts) map[k] = v;

  const t = map["t"];
  const v1 = map["v1"];
  if (!t || !v1) return null;

  return { t, v1 };
}

function verifyCalendlyWebhookSignature(opts: {
  rawBodyUtf8: string;
  signatureHeader: string | undefined;
  signingKey: string;
  maxAgeSeconds: number;
}): boolean {
  const parsed = parseCalendlyWebhookSignature(opts.signatureHeader);
  if (!parsed) return false;

  const timestampSeconds = Number(parsed.t);
  if (!Number.isFinite(timestampSeconds)) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const ageSeconds = nowSeconds - timestampSeconds;
  if (Math.abs(ageSeconds) > opts.maxAgeSeconds) return false;

  // Signed payload format is: `${timestamp}.${rawBody}`
  const signedPayload = `${parsed.t}.${opts.rawBodyUtf8}`;

  const expectedHex = crypto.createHmac("sha256", opts.signingKey).update(signedPayload).digest("hex");

  const sigBuf = Buffer.from(parsed.v1, "hex");
  const expectedBuf = Buffer.from(expectedHex, "hex");

  if (sigBuf.length !== expectedBuf.length) return false;

  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

router.post("/", async (req: Request, res: Response) => {
  try {
    const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
    if (!signingKey) {
      console.error("CALENDLY_WEBHOOK_SIGNING_KEY is not configured");
      return res.status(500).json({ error: "Server misconfigured" });
    }

    // `src/app.ts` mounts this endpoint with express.raw(), so req.body should be a Buffer.
    const rawBodyBuffer = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(String((req.body ?? "") as unknown), "utf8");
    const rawBodyUtf8 = rawBodyBuffer.toString("utf8");

    const signatureHeader = req.headers["calendly-webhook-signature"] as string | undefined;
    const verified = verifyCalendlyWebhookSignature({
      rawBodyUtf8,
      signatureHeader,
      signingKey,
      maxAgeSeconds: 300,
    });

    if (!verified) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }

    // After verification, parse JSON payload
    const payload = JSON.parse(rawBodyUtf8) as {
      event?: string;
      payload?: { event?: { name?: string } } | undefined;
      // Keep it permissive; we only use event-type detection and pass whole payload downstream.
      [key: string]: unknown;
    };

    const eventType = payload?.event || payload?.payload?.event?.name;

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
