import { prisma } from "../prismaClient";

export async function seedDemo() {
    try {
        // 1️⃣ Create demo company
        const company = await prisma.company.create({
            data: {
                name: "Demo HVAC Co"
            }
        });

        console.log("✅ Created demo company:", company.name);

        // 2️⃣ User/auth seeding is skipped because the current Prisma schema
        // does not define a User model/delegate.
        console.log("ℹ️ Skipping demo user creation: no User model in Prisma schema");

        // 3️⃣ Create some related demo records used by jobs
        const technician = await prisma.technician.create({
            data: {
                name: "Demo Tech",
                companyId: company.id
            }
        });

        const serviceType = await prisma.serviceType.create({
            data: {
                name: "HVAC Service",
                companyId: company.id
            }
        });

        console.log("✅ Created demo technician and service type");

        // 4️⃣ Seed 30 demo jobs
        for (let i = 1; i <= 30; i++) {
            const completedAt = new Date();
            completedAt.setDate(completedAt.getDate() - i);

            const invoicedAmount = 1000 + Math.random() * 4000;
            const laborCost = 400 + Math.random() * 200;
            const materialCost = 200 + Math.random() * 100;
            const cashCollected = i % 3 === 0 ? invoicedAmount : 0;

            const job = await prisma.job.create({
                data: {
                    companyId: company.id,
                    technicianId: technician.id,
                    serviceTypeId: serviceType.id,
                    invoicedAmount,
                    cashCollected,
                    laborCost,
                    materialCost,
                    completedAt,
                    phantom: false
                }
            });

            // Create payment for collected jobs
            if (cashCollected > 0) {
                await prisma.payment.create({
                    data: {
                        jobId: job.id,
                        companyId: company.id,
                        amount: cashCollected,
                        receivedAt: new Date(completedAt.getTime() + 2 * 24 * 60 * 60 * 1000),
                        recovered: Math.random() < 0.5
                    }
                });
            }
        }

        console.log("✅ Seeded 30 jobs and related payments");
        console.log("🎯 Demo seeding complete!");
    } catch (error) {
        console.error("❌ Seeding failed:", error);
        throw error;
    }
}

export async function clearDemo() {
    try {
        const company = await prisma.company.findFirst({
            where: { name: "Demo HVAC Co" }
        });

        if (!company) {
            console.log("No demo company found");
            return;
        }

        // Delete in dependency order
        await prisma.payment.deleteMany({
            where: { companyId: company.id }
        });
        await prisma.job.deleteMany({
            where: { companyId: company.id }
        });
        await prisma.technician.deleteMany({
            where: { companyId: company.id }
        });
        await prisma.serviceType.deleteMany({
            where: { companyId: company.id }
        });
        await prisma.company.delete({
            where: { id: company.id }
        });

        console.log("✅ Demo data cleared");
    } catch (error) {
        console.error("❌ Clear failed:", error);
        throw error;
    }
}

if (require.main === module) {
    const command = process.argv[2] as string;
    if (command === "clear") {
        clearDemo()
            .catch(console.error)
            .finally(() => process.exit());
    } else {
        seedDemo()
            .catch(console.error)
            .finally(() => process.exit());
    }
}
