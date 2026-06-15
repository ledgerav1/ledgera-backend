import crypto from "crypto";
import dotenv from "dotenv";
import path from "path";

dotenv.config({
  path: path.resolve(__dirname, "..", "..", ".env"),
});

const { prisma } = require("../prismaClient") as typeof import("../prismaClient");

async function main() {
  const companyId = crypto.randomUUID();
  const technicianId = crypto.randomUUID();
  const serviceTypeId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const paymentId = crypto.randomUUID();

  const companyName = "DWH Smoke Co";
  const technicianName = "Smoke Tech";
  const serviceTypeName = "Smoke Service";
  const jobCompletedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  const invoicedAmount = 5000;
  const cashCollected = 2500;
  const laborCost = 1800;
  const materialCost = 700;

  const paymentReceivedAt = new Date(jobCompletedAt.getTime() + 2 * 24 * 60 * 60 * 1000);

  // Intentionally omit Company.accountingSystem to avoid DB schema mismatch in this environment.
  const now = new Date();
  await prisma.$executeRaw`
    INSERT INTO "Company" ("id","name","createdAt","updatedAt")
    VALUES (${companyId}, ${companyName}, ${now}, ${now});
  `;

  await prisma.$executeRaw`
    INSERT INTO "Technician" ("id","name","companyId")
    VALUES (${technicianId}, ${technicianName}, ${companyId});
  `;

  await prisma.$executeRaw`
    INSERT INTO "ServiceType" ("id","name","companyId")
    VALUES (${serviceTypeId}, ${serviceTypeName}, ${companyId});
  `;

  await prisma.$executeRaw`
    INSERT INTO "Job" (
      "id","companyId","technicianId","serviceTypeId",
      "invoicedAmount","cashCollected",
      "laborCost","materialCost",
      "completedAt","startedAt","jobStatus","phantom"
    )
    VALUES (
      ${jobId}, ${companyId}, ${technicianId}, ${serviceTypeId},
      ${invoicedAmount}, ${cashCollected},
      ${laborCost}, ${materialCost},
      ${jobCompletedAt}, null, null, false
    );
  `;

  await prisma.$executeRaw`
    INSERT INTO "Payment" ("id","companyId","jobId","amount","receivedAt","recovered")
    VALUES (${paymentId}, ${companyId}, ${jobId}, ${cashCollected}, ${paymentReceivedAt}, false);
  `;

  console.log(companyId);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
