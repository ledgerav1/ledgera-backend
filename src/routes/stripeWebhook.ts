import { Request, Response, Router } from "express";
import type { Stripe as StripeType } from "stripe";
import { prisma } from "../prismaClient";

const router = Router();

// ── Lazy Stripe initialisation (won't crash at module load) ─────

function getStripeClient(): StripeType | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Stripe = require("stripe");
  return new Stripe(key) as StripeType;
}

function getWebhookSecret(): string {
  return process.env.STRIPE_WEBHOOK_SECRET || "";
}

// ── Helpers ──────────────────────────────────────────────────────

function cents(amount: number | null | undefined): string {
  if (!amount) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount / 100);
}

function logEvent(type: string, data: Record<string, unknown>): void {
  console.log(`[Stripe] ${type}`, JSON.stringify(data, null, 2));
}

function extractJobIdFromText(text: string | null | undefined): string | null {
  if (!text) return null;

  const uuidMatch = text.match(
    /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/
  );
  if (uuidMatch?.[0]) return uuidMatch[0];

  const metaPatterns: RegExp[] = [
    /jobId[:=]\s*([A-Za-z0-9_-]{6,64})/i,
    /job[:=]\s*([A-Za-z0-9_-]{6,64})/i,
    /job\s*#?\s*([A-Za-z0-9_-]{6,64})/i,
  ];

  for (const re of metaPatterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1];
  }

  return null;
}

async function resolveJobIdFromInvoice(
  invoice: { metadata?: Record<string, unknown>; description?: string | null },
  companyId: string
): Promise<string | null> {
  const metaJobId =
    typeof invoice.metadata?.jobId === "string" ? invoice.metadata.jobId : null;
  const descJobId = extractJobIdFromText(invoice.description);
  const candidate = metaJobId ?? descJobId;
  if (!candidate) return null;

  const job = await prisma.job.findFirst({
    where: { id: candidate, companyId },
    select: { id: true },
  });
  return job?.id ?? null;
}

// ── Webhook route ────────────────────────────────────────────────

router.post("/", async (req: Request, res: Response) => {
  const stripe = getStripeClient();
  const webhookSecret = getWebhookSecret();

  if (!stripe || !webhookSecret) {
    return res.status(503).json({
      error: "Stripe is not configured (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET)",
    });
  }

  const sig = req.headers["stripe-signature"] as string;

  // --- Verify signature ---
  let event: { id: string; type: string; data: { object: Record<string, unknown> } };
  try {
    const raw = stripe.webhooks.constructEvent(
      req.body,
      sig,
      webhookSecret
    ) as unknown as {
      id: string;
      type: string;
      data: { object: Record<string, unknown> };
    };
    event = raw;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Stripe] Webhook signature verification failed:", message);
    return res.status(400).json({ error: "Invalid webhook signature" });
  }

  // --- Deduplicate ---
  try {
    const existing = await prisma.stripeEvent.findUnique({
      where: { stripeEventId: event.id },
    });
    if (existing) {
      console.log(`[Stripe] Duplicate event skipped: ${event.id}`);
      return res.sendStatus(200);
    }
    await prisma.stripeEvent.create({
      data: { stripeEventId: event.id, type: event.type, processed: false },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Stripe] Failed to record event:", message);
    return res.status(500).json({ error: "Event recording failed" });
  }

  // --- Handle event ---
  const obj = event.data.object;

  try {
    switch (event.type) {
      case "invoice.paid": {
        const invoice = obj as {
          id: string;
          customer: string | null;
          amount_paid: number;
          description?: string | null;
          metadata?: Record<string, unknown>;
        };
        const amount = cents(invoice.amount_paid);
        const custId = invoice.customer as string;

        logEvent("invoice.paid", {
          invoiceId: invoice.id,
          customer: custId,
          amount,
          description: invoice.description,
          metadataKeys: invoice.metadata ? Object.keys(invoice.metadata) : [],
        });

        const company = await prisma.company.findFirst({
          where: { stripeCustomerId: custId },
        });
        if (company) {
          const jobId = await resolveJobIdFromInvoice(invoice, company.id);
          await prisma.payment.create({
            data: {
              companyId: company.id,
              jobId: jobId ?? null,
              amount: invoice.amount_paid,
              receivedAt: new Date(),
              recovered: true,
            },
          });
          await prisma.company.update({
            where: { id: company.id },
            data: { subscriptionStatus: "active" },
          });
          console.log(
            `[Stripe] Payment recorded for ${company.name}: ${amount}${
              jobId ? ` (linked jobId=${jobId})` : ""
            }`
          );
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = obj as {
          id: string;
          customer: string | null;
          amount_due: number;
          attempt_count: number;
        };
        const custId = invoice.customer as string;
        logEvent("invoice.payment_failed", {
          invoiceId: invoice.id,
          customer: custId,
          amount: cents(invoice.amount_due),
          attemptCount: invoice.attempt_count,
        });
        const company = await prisma.company.findFirst({
          where: { stripeCustomerId: custId },
        });
        if (company) {
          await prisma.company.update({
            where: { id: company.id },
            data: { subscriptionStatus: "past_due" },
          });
          console.warn(
            `[Stripe] Payment FAILED for ${company.name}: ${cents(invoice.amount_due)} (attempt ${invoice.attempt_count})`
          );
        }
        break;
      }

      case "invoice.marked_uncollectible": {
        const invoice = obj as { id: string; customer: string | null; amount_due: number };
        const custId = invoice.customer as string;
        logEvent("invoice.marked_uncollectible", {
          invoiceId: invoice.id,
          customer: custId,
          amount: cents(invoice.amount_due),
        });
        const company = await prisma.company.findFirst({
          where: { stripeCustomerId: custId },
        });
        if (company) {
          await prisma.company.update({
            where: { id: company.id },
            data: { subscriptionStatus: "unpaid" },
          });
          console.warn(`[Stripe] Invoice marked UNCOLLECTIBLE for ${company.name}`);
        }
        break;
      }

      case "invoice.overdue": {
        const invoice = obj as { id: string; customer: string | null; amount_due: number };
        const custId = invoice.customer as string;
        logEvent("invoice.overdue", {
          invoiceId: invoice.id,
          customer: custId,
          amount: cents(invoice.amount_due),
        });
        const company = await prisma.company.findFirst({
          where: { stripeCustomerId: custId },
        });
        if (company) {
          await prisma.company.update({
            where: { id: company.id },
            data: { subscriptionStatus: "past_due" },
          });
          console.warn(
            `[Stripe] Invoice OVERDUE for ${company.name}: ${cents(invoice.amount_due)}`
          );
        }
        break;
      }

      case "customer.created": {
        const customer = obj as { id: string; email?: string | null; name?: string | null };
        logEvent("customer.created", {
          customerId: customer.id,
          email: customer.email,
          name: customer.name,
        });
        if (customer.email) {
          const company = await prisma.company.findFirst({
            where: { stripeCustomerId: customer.id },
          });
          if (company && !company.stripeCustomerId) {
            await prisma.company.update({
              where: { id: company.id },
              data: { stripeCustomerId: customer.id },
            });
          }
        }
        break;
      }

      case "customer.deleted": {
        const customer = obj as { id: string; email?: string | null };
        logEvent("customer.deleted", {
          customerId: customer.id,
          email: customer.email,
        });
        const company = await prisma.company.findFirst({
          where: { stripeCustomerId: customer.id },
        });
        if (company) {
          await prisma.company.update({
            where: { id: company.id },
            data: {
              subscriptionStatus: "cancelled",
              stripeCustomerId: null,
              stripeSubId: null,
            },
          });
          console.warn(`[Stripe] Customer DELETED — ${company.name} cancelled`);
        }
        break;
      }

      case "payment_intent.succeeded": {
        const pi = obj as {
          id: string;
          customer: string | null;
          amount_received: number;
          description?: string | null;
        };
        const custId = pi.customer as string | null;
        logEvent("payment_intent.succeeded", {
          paymentIntentId: pi.id,
          customer: custId,
          amount: cents(pi.amount_received),
          description: pi.description,
        });
        if (custId) {
          const company = await prisma.company.findFirst({
            where: { stripeCustomerId: custId },
          });
          if (company) {
            await prisma.payment.create({
              data: {
                companyId: company.id,
                amount: pi.amount_received,
                receivedAt: new Date(),
                recovered: true,
              },
            });
            console.log(`[Stripe] Setup fee received from ${company.name}: ${cents(pi.amount_received)}`);
          }
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = obj as {
          id: string;
          customer: string | null;
          amount: number;
          last_payment_error?: { message?: string | null } | null;
        };
        const custId = pi.customer as string | null;
        const error = pi.last_payment_error?.message ?? "Unknown error";
        logEvent("payment_intent.payment_failed", {
          paymentIntentId: pi.id,
          customer: custId,
          amount: cents(pi.amount),
          error,
        });
        if (custId) {
          const company = await prisma.company.findFirst({
            where: { stripeCustomerId: custId },
          });
          if (company) {
            console.warn(
              `[Stripe] Setup fee FAILED for ${company.name}: ${cents(pi.amount)} — ${error}`
            );
          }
        }
        break;
      }

      default:
        console.log(`[Stripe] Unhandled event type: ${event.type}`);
    }

    await prisma.stripeEvent.update({
      where: { stripeEventId: event.id },
      data: { processed: true },
    });

    return res.sendStatus(200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[Stripe] Handler error for ${event.type}:`, message);
    return res.sendStatus(200);
  }
});

export default router;
