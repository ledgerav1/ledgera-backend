import crypto from "crypto";
import express, { Request, Response, Router } from "express";
import { Prisma } from "@prisma/client";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import { requireCompanyIdMatch } from "../middleware/tenantCompanyAccess";
import { requireCompanyIdInBodyMatchAuth } from "../middleware/tenantCompanyBodyAccess";
import { tenantContextMiddleware } from "../middleware/tenantContextMiddleware";
import { prisma } from "../prismaClient";
import { registerWebhook, sendFirmaDoc } from "../services/firmaService";
import { runWithCompanyId } from "../tenantContext";

const router = Router();

// Register webhook automatically when server starts (only runs once — skips if already registered)
if (process.env.FIRMA_WEBHOOK_URL) {
  registerWebhook(process.env.FIRMA_WEBHOOK_URL).catch(console.error);
}

// ─────────────────────────────────────────────────────────────────
// POST /contracts/firma/send
// Generates PDF, creates Firma.dev signing request, saves to Prisma
// ─────────────────────────────────────────────────────────────────
router.post(
  "/send",
  authenticate,
  tenantContextMiddleware,
  requireCompanyIdInBodyMatchAuth("companyId"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        clientName,
        clientContact,
        clientEmail,
        state = "Delaware",
        locationCount = 1,
        monthlyFee = 1250,
        setupFee = 2500,
        documentType = "msa",
        documentLabel = "Master Service Agreement",
      } = req.body as {
        clientName?: string;
        clientContact?: string;
        clientEmail?: string;
        state?: string;
        locationCount?: number;
        monthlyFee?: number;
        setupFee?: number;
        documentType?: string;
        documentLabel?: string;
      };

      const authedCompanyId = req.user?.id;
      if (!authedCompanyId) return res.status(401).json({ error: "Unauthorized" });

      if (!clientName || !clientEmail || !clientContact) {
        return res.status(400).json({
          error: "clientName, clientContact, and clientEmail are required",
        });
      }

      // 1) Send via Firma.dev
      const result = await sendFirmaDoc({
        clientName,
        clientContact,
        clientEmail,
        state,
        locationCount,
        monthlyFee,
        setupFee,
        documentType,
        documentLabel,
      });

      // 2) Persist to Prisma (use authenticated tenant, not body)
      const contract = await prisma.contract.create({
        data: {
          companyId: authedCompanyId,
          clientName,
          clientEmail,
          planType: documentType,
          monthlyFee,
          setupFee,
          locationCount,
          performanceKicker: false,
          active: false,
          envelopeId: result.signingRequestId,
          envelopeStatus: "sent",
        },
      });

      return res.status(201).json({
        success: true,
        contractId: contract.id,
        signingRequestId: result.signingRequestId,
        status: result.status,
        signingUrl: result.signingUrl,
        expiresAt: result.expiresAt,
        message: `Document sent to ${clientEmail} via Firma.dev for signing.`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Firma.dev send failed";
      // Keep error logs server-side only
      console.error("Firma.dev send error:", message);
      return res.status(500).json({ error: "Failed to send document via Firma.dev" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────
// POST /contracts/firma/webhook
// Firma.dev calls this on signing events (no auth; external system).
// ─────────────────────────────────────────────────────────────────
function parseFirmaSignatureHeader(
  headerValue: string | undefined
): { t: string; v1: string } | null {
  if (!headerValue) return null;

  // Format: t=1707500000,v1=abc123def456...
  const parts = headerValue
    .split(",")
    .map((p) => p.trim())
    .map((p) => p.split("="))
    .filter((kv) => kv.length === 2) as Array<[string, string]>;

  const map: Record<string, string> = {};
  for (const [k, v] of parts) map[k] = v;

  const t = map["t"];
  const v1 = map["v1"];
  if (!t || !v1) return null;

  return { t, v1 };
}

function verifyFirmaSignature(opts: {
  payloadUtf8: string;
  signatureHeader: string | undefined;
  secret: string;
  maxAgeSeconds: number;
}): boolean {
  const parsed = parseFirmaSignatureHeader(opts.signatureHeader);
  if (!parsed) return false;

  const timestampSeconds = Number(parsed.t);
  if (!Number.isFinite(timestampSeconds)) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const ageSeconds = nowSeconds - timestampSeconds;
  if (Math.abs(ageSeconds) > opts.maxAgeSeconds) return false;

  // Signed payload format: {timestamp}.{json_body} (raw JSON body string)
  const signedPayload = `${parsed.t}.${opts.payloadUtf8}`;

  const expectedSignatureHex = crypto
    .createHmac("sha256", opts.secret)
    .update(signedPayload)
    .digest("hex");

  const sigBuf = Buffer.from(parsed.v1, "hex");
  const expectedBuf = Buffer.from(expectedSignatureHex, "hex");
  if (sigBuf.length !== expectedBuf.length) return false;

  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    try {
      const firmaWebhookSecret = process.env.FIRMA_WEBHOOK_SECRET;
      if (!firmaWebhookSecret) {
        console.error("FIRMA_WEBHOOK_SECRET is not configured");
        return res.status(500).json({ error: "Server misconfigured" });
      }

      const payloadBuffer = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(String((req.body as unknown) ?? ""), "utf8");
      const payloadUtf8 = payloadBuffer.toString("utf8");

      const signatureNew = req.headers["x-firma-signature"] as string | undefined;
      const signatureOld = req.headers["x-firma-signature-old"] as string | undefined;

      const verifiedCurrent = verifyFirmaSignature({
        payloadUtf8,
        signatureHeader: signatureNew,
        secret: firmaWebhookSecret,
        maxAgeSeconds: 300,
      });

      const verifiedOld = !verifiedCurrent
        ? verifyFirmaSignature({
            payloadUtf8,
            signatureHeader: signatureOld,
            secret: firmaWebhookSecret,
            maxAgeSeconds: 300,
          })
        : false;

      if (!verifiedCurrent && !verifiedOld) {
        return res.status(401).json({ error: "Invalid webhook signature" });
      }

      const event = JSON.parse(payloadUtf8) as any;

      const signingRequestId: string =
        event?.data?.id ?? event?.data?.signing_request_id ?? event?.signing_request_id ?? "";
      const eventType: string = event?.type ?? event?.event ?? "";

      if (!signingRequestId) return res.sendStatus(200);

      const contract = await prisma.contract.findFirst({
        where: { envelopeId: signingRequestId },
        select: { id: true, companyId: true },
      });

      if (!contract) {
        console.warn("Firma webhook: no contract for signing request", signingRequestId);
        return res.sendStatus(200);
      }

      const updates: Prisma.ContractUpdateInput = {
        envelopeStatus: eventType,
      };

      if (eventType === "signing_request.completed") {
        updates.signedAt = new Date();
        updates.active = true;

        const finalUrl =
          event?.data?.final_document_download_url ??
          event?.data?.final_document_download_url;
        if (typeof finalUrl === "string" && finalUrl.length > 0) {
          updates.signedPdfPath = finalUrl;
        }
      }

      if (
        eventType === "signing_request.cancelled" ||
        eventType === "signing_request.expired"
      ) {
        updates.active = false;
      }

      await runWithCompanyId(contract.companyId, async () => {
        await prisma.contract.update({
          where: { id: contract.id },
          data: updates,
        });
      });

      return res.sendStatus(200);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Firma webhook error";
      console.error("Firma webhook error:", message);
      // Fail closed but don’t block retries if parsing fails; signature already checked.
      return res.sendStatus(500);
    }
  }
);

// ─────────────────────────────────────────────────────────────────
// GET /contracts/firma/company/:companyId
// ─────────────────────────────────────────────────────────────────
router.get(
  "/company/:companyId",
  authenticate,
  tenantContextMiddleware,
  requireCompanyIdMatch("companyId"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const contracts = await prisma.contract.findMany({
        where: { companyId: req.params.companyId },
        orderBy: { createdAt: "desc" },
      });
      return res.json(contracts);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch contracts";
      console.error(message);
      return res.status(500).json({ error: "Failed to fetch contracts" });
    }
  }
);

export default router;
