import { prisma } from "../prismaClient";

export async function updateWeeklyTargetStatus(weeklyTargetId: string) {
    void prisma;
    void weeklyTargetId;

    // `WeeklyTarget` is not defined in the current Prisma schema,
    // so `prisma.weeklyTarget` does not exist on the generated client.
    // This service is temporarily a no-op until the model is added back
    // to `prisma/schema.prisma` and the Prisma client is regenerated.
    return;
}
