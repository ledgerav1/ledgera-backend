import Stripe from "stripe";
import { Request, Response, Router } from "express";
import { prisma } from "../prismaClient";

type StripeEvent = {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
};

type StripeInvoice = {
  id: string;
  customer: string | null;
  amount_paid: number;
  amount_due: number;
  attempt_count: number;
  description?: string | null;
  metadata?: Record<string, unknown>;
};

type StripeCustomer = {
  id: string;
  email?: string | null;
  name?: string | null;
};

type StripePaymentIntent = {
  id: string;
  customer: string | null;
  amount_received: number;
  amount: number;
  description?: string | null;
  last_payment_error?: {
    message?: string | null;
  } | null;
};

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

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
  invoice: StripeInvoice,
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

router.post("/", async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"] as string;

  let event: StripeEvent;
  try {
    const rawEvent = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET) as {
      id: string;
      type: string;
      data: {
        object: unknown;
      };
    };
    event = {
      id: rawEvent.id,
      type: rawEvent.type,
      data: {
        object: rawEvent.data.object as Record<string, unknown>,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Stripe] Webhook signature verification failed:", message);
    return res.status(400).json({ error: "Invalid webhook signature" });
  }

  try {
    const existing = await prisma.stripeEvent.findUnique({
      where: { stripeEventId: event.id },
    });
    if (existing) {
      console.log(`[Stripe] Duplicate event skipped: ${event.id}`);
      return res.sendStatus(200);
    }

    await prisma.stripeEvent.create({
      data: {
        stripeEventId: event.id,
        type: event.type,
        processed: false,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Stripe] Failed to record event:", message);
    return res.status(500).json({ error: "Event recording failed" });
  }

  try {
    switch (event.type) {
      case "invoice.paid": {
        const invoice = event.data.object as StripeInvoice;
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
        const invoice = event.data.object as StripeInvoice;
        const custId = invoice.customer as string;
        const amount = cents(invoice.amount_due);

        logEvent("invoice.payment_failed", {
          invoiceId: invoice.id,
          customer: custId,
          amount,
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
            `[Stripe] Payment FAILED for ${company.name}: ${amount} (attempt ${invoice.attempt_count})`
          );
        }
        break;
      }

      case "invoice.marked_uncollectible": {
        const invoice = event.data.object as StripeInvoice;
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
        const invoice = event.data.object as StripeInvoice;
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

          console.warn(`[Stripe] Invoice OVERDUE for ${company.name}: ${cents(invoice.amount_due)}`);
        }
        break;
      }

      case "customer.created": {
        const customer = event.data.object as StripeCustomer;

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
        const customer = event.data.object as StripeCustomer;

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
        const pi = event.data.object as StripePaymentIntent;
        const custId = pi.customer as string | null;
        const amount = cents(pi.amount_received);

        logEvent("payment_intent.succeeded", {
          paymentIntentId: pi.id,
          customer: custId,
          amount,
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

            console.log(`[Stripe] Setup fee received from ${company.name}: ${amount}`);
          }
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object as StripePaymentIntent;
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
