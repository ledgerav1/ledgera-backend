import Stripe from "stripe";
import { STRIPE_SECRET_KEY } from "../env";

const stripe = new Stripe(STRIPE_SECRET_KEY);

export async function createSetupInvoice(customerId: string) {
  return stripe.invoiceItems.create({
    customer: customerId,
    amount: 250000,
    currency: "usd",
    description: "Ledgera Setup Fee",
  });
}

export async function createMonthlySubscription(customerId: string, priceId: string) {
  return stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
  });
}

export { stripe };
