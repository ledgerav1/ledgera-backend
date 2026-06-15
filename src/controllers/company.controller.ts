import { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { prisma } from "../prismaClient";
import { AppError } from "./AppError";

export const createCompany = asyncHandler(async (req: Request, res: Response) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) {
    throw new AppError("Company name is required", 400);
  }

  const company = await prisma.company.create({
    data: { name },
  });

  res.status(201).json(company);
});

export const getCompany = asyncHandler(async (req: Request, res: Response) => {
  const company = await prisma.company.findUnique({
    where: { id: req.params.id },
  });

  if (!company) {
    throw new AppError("Company not found", 404);
  }

  res.json(company);
});
