import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
const IV_BYTES = 16; // 128-bit IV
const KEY_ENV = "TOKEN_ENCRYPTION_KEY"; // expected hex string (32 bytes => 64 hex chars)

function getKey(): Buffer {
  const keyHex = process.env[KEY_ENV];
  if (!keyHex || typeof keyHex !== "string") {
    throw new Error(`Missing environment variable ${KEY_ENV}`);
  }

  const key = Buffer.from(keyHex, "hex");
  // aes-256-cbc => 32 byte key
  if (key.length !== 32) {
    throw new Error(`${KEY_ENV} must decode to 32 bytes (aes-256 key). Got ${key.length} bytes.`);
  }

  return key;
}

const ENCRYPTED_VALUE_REGEX = /^[0-9a-fA-F]{32}:[0-9a-fA-F]+$/; // ivHex(16 bytes=32 chars) + ":" + cipherHex

function isLikelyEncrypted(value: string): boolean {
  return ENCRYPTED_VALUE_REGEX.test(value);
}

/**
 * Encrypts token text for at-rest storage.
 * Returns: "<ivHex>:<cipherHex>"
 */
export function encryptToken(plainText: string): string {
  // Allow empty strings to remain empty (helps avoid breaking existing semantics)
  if (plainText.length === 0) return plainText;

  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);

  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts a token previously encrypted with encryptToken().
 * If the value doesn't look encrypted (e.g. legacy plaintext), returns it as-is.
 */
export function decryptToken(maybeEncrypted: string): string {
  if (maybeEncrypted.length === 0) return maybeEncrypted;
  if (!isLikelyEncrypted(maybeEncrypted)) return maybeEncrypted;

  const [ivHex, cipherHex] = maybeEncrypted.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const encryptedText = Buffer.from(cipherHex, "hex");

  try {
    const key = getKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    // If decryption fails, treat as legacy plaintext (or corrupted ciphertext).
    return maybeEncrypted;
  }
}
