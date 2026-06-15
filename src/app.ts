import * as Sentry from "@sentry/node";
import accountingRouter from "./routes/accounting";
import acquisitionRouter from "./routes/acquisition";
import adminRouter from "./routes/admin.routes";
import aiExecutiveReportRouter from "./routes/aiExecutiveReport";
import aiHaikuRouter from "./routes/aiHaiku";
import analyticsRouter from "./routes/analytics";
import authRouter from "./routes/auth";
import billingRouter from "./routes/billing";
import calendlyWebhookRouter from "./webhooks/calendly.webhook";
import companiesRouter from "./routes/companies";
import cors from "cors";
import diligenceRouter from "./routes/diligence";
import dwhRouter from "./routes/dwh";
import ebitdaRouter from "./routes/ebitdaSimulator";
import executiveDashboardRouter from "./routes/executiveDashboard";
import express from "express";
import firmaRouter from "./routes/firmaContracts";
import helmet from "helmet";
import integrationsRouter from "./routes/integrations";
import invoicesRouter from "./routes/invoices";
import jobsRouter from "./routes/jobs";
import morgan from "morgan";
import oauthRouter from "./routes/oauth";
import onboardRouter from "./routes/onboard.routes";
import paymentsRouter from "./routes/payments";
import rateLimit from "express-rate-limit";
import stripeWebhookRouter from "./routes/stripeWebhook";
import twilioWebhookRouter from "./webhooks/twilio.webhook";
import { tenantContextMiddleware } from "./middleware/tenantContextMiddleware";

const app = express();

const appRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests",
});

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

app.use(
  "/webhooks/stripe",
  express.raw({ type: "application/json" }),
  strictLimiter,
  stripeWebhookRouter
);

app.use(express.json());

app.use(
  "/webhooks/twilio",
  express.urlencoded({ extended: false }),
  strictLimiter,
  twilioWebhookRouter
);

app.use(
  helmet({
    contentSecurityPolicy: true,
    crossOriginEmbedderPolicy: true,
  })
);
app.use(morgan("combined"));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  })
);
const corsAllowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsOrigin(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
) {
  // Non-browser requests (no Origin header) should still work.
  if (!origin) return callback(null, true);

  // If not configured:
  // - production: deny cross-origin
  // - non-production: allow (to avoid breaking local dev)
  if (corsAllowedOrigins.length === 0) {
    const isProd = (process.env.NODE_ENV ?? "") === "production";
    return callback(null, !isProd);
  }

  callback(null, corsAllowedOrigins.includes(origin));
}

app.use(
  cors({
    origin: corsOrigin,
    credentials: false,
  })
);

app.use(appRateLimit);

app.use("/oauth", oauthRouter);

const sentryDsn = process.env.SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    tracesSampleRate: 1.0,
    integrations: [Sentry.expressIntegration()],
  });
}

app.use("/auth", authRouter);
app.use("/admin", adminRouter);
app.use("/companies", companiesRouter);
app.use("/jobs", jobsRouter);
app.use("/invoices", invoicesRouter);
app.use("/onboard", onboardRouter);
app.use("/payments", paymentsRouter);
app.use("/billing", billingRouter);
app.use("/analytics", analyticsRouter);
app.use("/integrations", integrationsRouter);
app.use("/accounting", accountingRouter);
app.use("/contracts/firma", firmaRouter);
app.use("/diligence", diligenceRouter);
app.use("/acquisition", acquisitionRouter);
app.use("/simulate", ebitdaRouter);
app.use("/executive", executiveDashboardRouter);
app.use("/ai/executive-report", aiExecutiveReportRouter);
app.use("/ai/haiku", aiHaikuRouter);
app.use(
  "/webhooks/calendly",
  express.raw({ type: "application/json" }),
  strictLimiter,
  calendlyWebhookRouter
);
app.use("/dwh", dwhRouter);


app.get("/health", (_, res) => {
  res.json({ status: "ok" });
});

if (sentryDsn) {
  Sentry.setupExpressErrorHandler(app);
}

export default app;
