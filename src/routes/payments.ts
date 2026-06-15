import { Request, Response, Router } from "express";
import { prisma } from "../prismaClient";
import { logAuditEvent } from "../services/auditLogger";

const router = Router();

const prismaClient = prisma as typeof prisma & {
    invoice: {
        findUnique: (args: {
            where: { id: string };
            include?: { job?: boolean };
        }) => Promise<any>;
    };
    payment: {
        create: (args: {
            data: {
                invoiceId: string;
                companyId: string;
                amount: number;
                paidDate: Date;
            };
        }) => Promise<any>;
        findUnique: (args: { where: { id: string } }) => Promise<any>;
    };
};

router.post("/", async (req: Request, res: Response) => {
    try {
        const { invoiceId, amount, paidDate } = req.body;

        const invoice = await prismaClient.invoice.findUnique({
            where: { id: invoiceId },
            include: { job: true }
        });

        if (!invoice) {
            return res.status(404).json({ error: "Invoice not found" });
        }

        const payment = await prismaClient.payment.create({
            data: {
                invoiceId,
                companyId: invoice.companyId,
                amount,
                paidDate: new Date(paidDate)
            }
        });

        await logAuditEvent({
            companyId: invoice.companyId,
            entityType: "payment",
            entityId: payment.id,
            action: "payment_recorded",
            amount
        });

        res.json(payment);
    } catch (error) {
        console.error("Error creating payment:", error);
        res.status(500).json({ error: "Failed to create payment" });
    }
});

router.get("/:id", async (req, res) => {
    try {
        const payment = await prismaClient.payment.findUnique({
            where: { id: req.params.id }
        });
        res.json(payment || { error: "Payment not found" });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch payment" });
    }
});

export default router;
