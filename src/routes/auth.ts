import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { Request, Response, Router } from "express";
import { z } from "zod";
import { prisma } from "../prismaClient";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is not set");
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

const strictLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

const RegisterSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  companyName: z.string().min(1, "Company name is required"),
  sizeTier: z.string().optional(),
});

const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type AuthTokenPayload = {
  sub: string;
  companyId: string;
  userId: string;
  email: string;
  role: string;
};

type AuthResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    role: string;
    companyId: string;
  };
  company: {
    id: string;
    name: string;
    accountingSystem: string;
  };
};

type AuthUserRecord = {
  id: string;
  email: string;
  password: string;
  role: string;
  companyId: string;
};

function issueAuthToken(payload: AuthTokenPayload) {
  return jwt.sign(payload, JWT_SECRET as string, {
    algorithm: "HS256",
    expiresIn: "7d",
  });
}

function serializeAuthResponse(
  user: { id: string; email: string; role: string; companyId: string },
  company: { id: string; name: string; accountingSystem: string }
): AuthResponse {
  return {
    token: issueAuthToken({
      sub: user.companyId,
      companyId: user.companyId,
      userId: user.id,
      email: user.email,
      role: user.role,
    }),
    user,
    company,
  };
}

const router = Router();

router.post("/register", authLimiter, async (req: Request, res: Response) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  const { email, password, companyName } = parsed.data;

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const created = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: companyName.trim(),
        },
      });

      const user = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          password: passwordHash,
          role: "client",
          companyId: company.id,
        },
      });

      return { company, user };
    });

    const response = serializeAuthResponse(
      {
        id: created.user.id,
        email: created.user.email,
        role: created.user.role,
        companyId: created.company.id,
      },
      {
        id: created.company.id,
        name: created.company.name,
        accountingSystem: created.company.accountingSystem,
      }
    );

    return res.status(201).json(response);
  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/login", strictLoginLimiter, async (req: Request, res: Response) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  const { email, password } = parsed.data;

  try {
    const user = (await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        password: true,
        role: true,
        companyId: true,
      },
    })) as AuthUserRecord | null;

    if (!user) {
      await bcrypt.compare(password, "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345");
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        id: true,
        name: true,
        accountingSystem: true,
      },
    });

    if (!company) {
      return res.status(500).json({ error: "Company record is missing for this account" });
    }

    const response = serializeAuthResponse(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
      },
      company
    );

    return res.json(response);
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Login failed" });
  }
});

export default router;
