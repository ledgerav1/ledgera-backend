import { prisma } from "../../prismaClient";

const PHANTOM_THRESHOLD = parseFloat(process.env.PHANTOM_DETECTION_THRESHOLD || "0.2");

export async function scanForPhantomRevenue(companyId: string) {
    const jobs = await prisma.job.findMany({
        where: { companyId },
        include: {
            payments: true
        }
    });

    for (const job of jobs) {
        const totalPaid = job.payments.reduce(
            (sum: number, payment: (typeof job.payments)[number]) => sum + payment.amount,
            0
        );

        const profit = job.invoicedAmount - (job.laborCost + job.materialCost);
        const margin = job.invoicedAmount > 0 ? profit / job.invoicedAmount : 0;
        const isPhantom =
            job.invoicedAmount > 0 && totalPaid < job.invoicedAmount * (1 - PHANTOM_THRESHOLD);

        void margin;

        await prisma.job.update({
            where: { id: job.id },
            data: { phantom: isPhantom }
        });
    }
}

export async function attributeRecovery(paymentId: string) {
    const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
            job: true
        }
    });

    if (!payment || !payment.job) return;

    if (payment.job.phantom) {
        await prisma.payment.update({
            where: { id: paymentId },
            data: { recovered: true }
        });
    }
}
