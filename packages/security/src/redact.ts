const SECRET_KEY = /(secret|password|token|connection|apikey|authorization|enc)$/i;

/** Masque récursivement les valeurs sensibles avant écriture dans AuditLog / logs. */
export function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redactSecrets) as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEY.test(k) ? '[REDACTED]' : redactSecrets(v)]),
    ) as T;
  }
  return value;
}
