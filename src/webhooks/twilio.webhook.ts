import twilio from "twilio";
import { Request, Response, Router } from "express";
import { createTwilioCallEventAndAttribute } from "../services/callTrackingService";
import { normalizePhone } from "../services/phoneNormalization";

const router = Router();

function requireString(value: unknown, name: string): string {
  if (typeof value === "string" && value.trim().length > 0) return value;
  throw new Error(`Missing/invalid ${name}`);
}

function buildFullUrl(req: Request): string {
  const protocol = (req.protocol ?? "http").replace(/:$/, "");
  const host = req.get("host");
  const originalUrl = req.originalUrl ?? "";
  if (!host) return `${protocol}://localhost${originalUrl}`;
  return `${protocol}://${host}${originalUrl}`;
}

router.post("/:companyId", async (req: Request, res: Response) => {
  try {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) return res.status(500).json({ error: "Server misconfigured: TWILIO_AUTH_TOKEN missing" });

    const companyId = requireString(req.params.companyId, "companyId");
    const signature = req.headers["x-twilio-signature"];
    if (typeof signature !== "string" || signature.trim().length === 0) {
      return res.status(401).json({ error: "Missing X-Twilio-Signature" });
    }

    // Twilio signs the exact URL it called + all parameters in the request (form params for x-www-form-urlencoded).
    // For this endpoint we expect express.urlencoded() to have populated req.body as a key/value object.
    const params = (req.body ?? {}) as Record<string, string>;

    const url = buildFullUrl(req);

    // Use Twilio's official validation logic (HMAC-SHA1, evolving params).
    const isValid = (twilio as any).validateRequest(authToken, signature, url, params);
    if (!isValid) return res.status(401).json({ error: "Invalid Twilio webhook signature" });

    // Best-effort normalization for from/to.
    const fromPhoneRaw = (params.From ?? params.Caller ?? params.CallerNumber ?? params.FromNumber ?? null) as string | null;
    const toPhoneRaw = (params.To ?? params.Destination ?? params.ToNumber ?? null) as string | null;

    const callParams = {
      companyId,
      fromPhoneRaw,
      toPhoneRaw,
      fromPhoneNormalized: normalizePhone(fromPhoneRaw),
      toPhoneNormalized: normalizePhone(toPhoneRaw),
      // keep whole param bag for auditing/debugging
      rawParams: params,
    };

    const result = await createTwilioCallEventAndAttribute(callParams);

    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    // Webhooks should fail safely and quickly.
    console.error("Twilio webhook processing failed:", error);
    return res.status(500).json({ error: "Failed to process Twilio webhook" });
  }
});

// Optional: Twilio can send GET callbacks for some configurations; accept quickly.
router.get("/:companyId", async (req: Request, res: Response) => {
  // We treat GET the same way as POST for signature verification (Twilio includes query params in the signed URL).
  try {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) return res.status(500).json({ error: "Server misconfigured: TWILIO_AUTH_TOKEN missing" });

    const companyId = requireString(req.params.companyId, "companyId");
    const signature = req.headers["x-twilio-signature"];
    if (typeof signature !== "string" || signature.trim().length === 0) {
      return res.status(401).json({ error: "Missing X-Twilio-Signature" });
    }

    const params = (req.query ?? {}) as unknown as Record<string, string>;
    const url = buildFullUrl(req);

    const isValid = (twilio as any).validateRequest(authToken, signature, url, params);
    if (!isValid) return res.status(401).json({ error: "Invalid Twilio webhook signature" });

    const fromPhoneRaw = (params.From ?? params.Caller ?? null) as string | null;
    const toPhoneRaw = (params.To ?? params.Destination ?? null) as string | null;

    const callParams = {
      companyId,
      fromPhoneRaw,
      toPhoneRaw,
      fromPhoneNormalized: normalizePhone(fromPhoneRaw),
      toPhoneNormalized: normalizePhone(toPhoneRaw),
      rawParams: params,
    };

    const result = await createTwilioCallEventAndAttribute(callParams);

    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    console.error("Twilio webhook GET processing failed:", error);
    return res.status(500).json({ error: "Failed to process Twilio webhook" });
  }
});

export default router;
