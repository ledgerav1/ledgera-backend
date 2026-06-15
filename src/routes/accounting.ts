import { Response, Router } from "express";
import type { CreateInvoiceInput } from "../accounting/types";
import { authenticate, authorize, type AuthenticatedRequest } from "../middleware/auth";
import { requireCompanyIdMatch } from "../middleware/tenantCompanyAccess";
import { tenantContextMiddleware } from "../middleware/tenantContextMiddleware";

import {
  createInvoice,
  getInvoiceStatus,
  recordPayment,
} from "../accounting/accountingService";

const router = Router();

function handleConnectorError(res: Response, err: unknown) {
  const message = err instanceof Error ? err.message : "Accounting operation failed";

  // QuickBooks connector is currently explicitly “not implemented”.
  if (message.toLowerCase().includes("not implemented")) {
    return res.status(501).json({ error: message });
  }

  return res.status(500).json({ error: message });
}

router.get("/", (_req, res) => {
  res.json({ ok: true, service: "accounting" });
});

router.post(
  "/:companyId/invoices",
  authenticate,
  tenantContextMiddleware,
  requireCompanyIdMatch("companyId"),
  authorize("admin"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const companyId = req.params.companyId;
      const customerName = String(req.body?.customerName ?? "");
      const amountRaw = req.body?.amount;
      const description = String(req.body?.description ?? "");
      const amount = typeof amountRaw === "number" ? amountRaw : Number(amountRaw);

      if (!customerName) return res.status(400).json({ error: "customerName is required" });
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: "amount must be a positive number" });
      }

      const input: CreateInvoiceInput = {
        companyId,
        customerName,
        amount,
        description,
      };

      const result = await createInvoice(input);
      return res.json(result);
    } catch (err) {
      if (err instanceof Error && err.message === "Unauthorized") {
        return res.status(401).json({ error: "Unauthorized" });
      }
      return handleConnectorError(res, err);
    }
  }
);

router.get(
  "/:companyId/invoices/:invoiceId",
  authenticate,
  tenantContextMiddleware,
  requireCompanyIdMatch("companyId"),
  authorize("admin"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const companyId = req.params.companyId;
      const invoiceId = req.params.invoiceId;

      if (!invoiceId) return res.status(400).json({ error: "invoiceId is required" });

      const status = await getInvoiceStatus(companyId, invoiceId);
      return res.json(status);
    } catch (err) {
      if (err instanceof Error && err.message === "Unauthorized") {
        return res.status(401).json({ error: "Unauthorized" });
      }
      return handleConnectorError(res, err);
    }
  }
);

router.post(
  "/:companyId/invoices/:invoiceId/payments",
  authenticate,
  tenantContextMiddleware,
  requireCompanyIdMatch("companyId"),
  authorize("admin"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const companyId = req.params.companyId;
      const invoiceId = req.params.invoiceId;
      const amountRaw = req.body?.amount;
      const amount = typeof amountRaw === "number" ? amountRaw : Number(amountRaw);

      if (!invoiceId) return res.status(400).json({ error: "invoiceId is required" });
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: "amount must be a positive number" });
      }

      await recordPayment(companyId, invoiceId, amount);

      return res.json({ ok: true });
    } catch (err) {
      if (err instanceof Error && err.message === "Unauthorized") {
        return res.status(401).json({ error: "Unauthorized" });
      }
      return handleConnectorError(res, err);
    }
  }
);

export default router;
