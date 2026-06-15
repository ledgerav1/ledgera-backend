import { v4 as uuid } from "uuid";
import { prisma } from "../prismaClient";

export async function createKey(companyId: string) {
  const key = `ledg_${uuid()}`;

  return prisma.apiKey.create({
    data: { key, companyId },
  });
}
