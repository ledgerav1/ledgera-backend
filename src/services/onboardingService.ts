import { prisma } from "../prismaClient";
import { createKey } from "./apiKeyService";

export async function onboardCompany(name: string) {
  const company = await prisma.company.create({
    data: { name },
  });

  await prisma.serviceType.createMany({
    data: [
      { name: "Repair", companyId: company.id },
      { name: "Install", companyId: company.id },
      { name: "Maintenance", companyId: company.id },
    ],
  });

  const apiKey = await createKey(company.id);

  return {
    company,
    apiKey,
  };
}
