export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;

  const raw = String(phone).trim();
  if (!raw) return null;

  // Strip common wrappers
  const withoutTel = raw.replace(/^tel:/i, "");

  // Keep leading + if present; keep digits otherwise.
  const hasPlus = withoutTel.startsWith("+");

  const digitsOnly = withoutTel.replace(/[^\d]/g, "");
  if (!digitsOnly) return null;

  // Heuristic: if 10 digits, assume US country code +1
  if (digitsOnly.length === 10) {
    return hasPlus ? `+${digitsOnly}` : `+1${digitsOnly}`;
  }

  // Heuristic: if 11 digits starting with 1, treat as US +1
  if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) {
    return hasPlus ? `+${digitsOnly}` : `+${digitsOnly}`;
  }

  // For everything else, return digits with leading + if the original had it.
  return hasPlus ? `+${digitsOnly}` : digitsOnly;
}

export function isNormalizedPhoneEqual(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) return false;
  return na === nb;
}
