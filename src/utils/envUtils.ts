export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error("Missing ENV:", key);
    process.exit(1);
  }
  return value;
}
