import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_ENV = "TOKEN_ENCRYPTION_KEY"; // expected hex string (32 bytes => 64 hex chars)

/**
 * Uses AES-256-GCM with a 32-byte key derived from TOKEN_ENCRYPTION_KEY (hex).
 *
 * Returns individual components so callers can store iv/tag/cipher in fields.
 */
function getKey(): Buffer {
  const keyHex = process.env[KEY_ENV];
  if (!keyHex || typeof keyHex !== "string") {
    throw new Error(`Missing environment variable ${KEY_ENV}`);
  }

  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error(`${KEY_ENV} must decode to 32 bytes (aes-256 key). Got ${key.length} bytes.`);
  }

  return key;
}

export type EncryptedPayload = {
  iv: string; // hex
  content: string; // hex cipher
  tag: string; // hex auth tag
};

export function encrypt(text: string): EncryptedPayload {
  if (text.length === 0) return { iv: "", content: "", tag: "" };

  const key = getKey();
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString("hex"),
    content: encrypted.toString("hex"),
    tag: authTag.toString("hex"),
  };
}

export function decrypt(payload: EncryptedPayload): string {
  if (!payload?.iv || !payload?.content || !payload?.tag) return "";

  const key = getKey();
  const iv = Buffer.from(payload.iv, "hex");
  const encryptedText = Buffer.from(payload.content, "hex");
  const authTag = Buffer.from(payload.tag, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
  return decrypted.toString("utf8");
}
