/**
 * Tolerant parsing helpers shared by the `lib/*-contract.ts` normalisers.
 * Every admin endpoint is read through one of these so a backend that is
 * half-deployed (snake_case vs camelCase, missing additive fields, bigint
 * strings) never blanks a page. Keep these presentation-free.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** First defined value among camelCase/snake_case aliases. */
export function pick(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key]
    if (value !== undefined) return value
  }
  return undefined
}

export function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** Integer ≥ 0 or null. Accepts bigint-as-string from raw SQL rows. */
export function nullableInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(n) && n >= 0 ? n : null
}

/** Integer (any sign) or null — for nets that can legitimately go negative. */
export function nullableSignedInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(n) ? n : null
}

/** Count/amount that defaults to 0 when absent or malformed. */
export function count(value: unknown, fallback = 0): number {
  return nullableInteger(value) ?? fallback
}

/** Signed integer defaulting to 0 (money totals that may be negative). */
export function signedCount(value: unknown, fallback = 0): number {
  return nullableSignedInteger(value) ?? fallback
}

/** Finite float or null (ratings, percentages, legacy GHS floats). */
export function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

export function numberOr(value: unknown, fallback: number): number {
  return nullableNumber(value) ?? fallback
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

/** Percentage of `part` in `whole`, one decimal, or null when whole is 0. */
export function pct(part: number, whole: number): number | null {
  if (!(whole > 0)) return null
  return Math.round((part / whole) * 1000) / 10
}
