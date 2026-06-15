function requireEnv(key: string): string {
  if (!process.env[key]) {
    console.error("Missing ENV:", key);
    process.exit(1);
  }

  return process.env[key] as string;
}

export const PORT = process.env.PORT || 3000;
export const JWT_SECRET = requireEnv("JWT_SECRET");

if (JWT_SECRET.trim().length < 64) {
  throw new Error("JWT_SECRET must be at least 64 characters (random)");
}

export const DATABASE_URL = requireEnv("DATABASE_URL");
export const STRIPE_SECRET_KEY = requireEnv("STRIPE_SECRET_KEY");
