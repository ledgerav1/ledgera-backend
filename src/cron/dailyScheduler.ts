import { scanForPhantomRevenue } from "../services/phantomDetector";
import { checkGuarantees } from "../services/guaranteeChecker";
import { prisma } from "../prismaClient";

export async function runDaily(companyId: string) {
    try {
        await scanForPhantomRevenue(companyId);
        console.log(`✅ Phantom scan completed for company ${companyId}`);
    } catch (error) {
        console.error(`❌ Phantom scan failed for company ${companyId}:`, error);
    }
}

export async function runGuaranteeCheck() {
    try {
        await checkGuarantees();
        console.log("✅ Guarantee checks completed");
    } catch (error) {
        console.error("❌ Guarantee check failed:", error);
    }
}

// Run for all companies
export async function runDailyForAll() {
    const companies = await prisma.company.findMany();
    for (const company of companies) {
        await runDaily(company.id);
    }
    await runGuaranteeCheck();
}
