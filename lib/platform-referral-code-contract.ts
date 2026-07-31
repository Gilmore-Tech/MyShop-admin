export const PLATFORM_REFERRAL_CODE_PATTERN = /^MYSHOP-[A-Z0-9]{6}$/

export interface PlatformReferralUsageCounts {
  total: number
  byRole: {
    client: number
    driver: number
    artisan: number
  }
}

export interface PlatformReferralCodeItem {
  id: string
  code: string
  campaignName: string
  isActive: boolean
  createdAt: string
  lastUsedAt: string | null
  deactivatedAt: string | null
  deactivationReason: string | null
  counts: PlatformReferralUsageCounts
}

export interface PlatformReferralDailyCount extends PlatformReferralUsageCounts {
  date: string
}

export interface PlatformReferralCodeListResponse {
  items: PlatformReferralCodeItem[]
  pagination: {
    page: number
    limit: number
    total: number
  }
  aggregates: PlatformReferralUsageCounts & {
    daily: PlatformReferralDailyCount[]
  }
  signupAttributionEnabled: boolean
}

type JsonObject = Record<string, unknown>

function objectAt(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Unsafe platform referral response: ${label} must be an object.`)
  }
  return value as JsonObject
}

function valueAt(object: JsonObject, camel: string, snake: string = camel): unknown {
  return object[camel] ?? object[snake]
}

function stringAt(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Unsafe platform referral response: ${label} must be a non-empty string.`)
  }
  return value
}

function nullableStringAt(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null
  return stringAt(value, label)
}

function booleanAt(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Unsafe platform referral response: ${label} must be a boolean.`)
  }
  return value
}

function countAt(value: unknown, label: string): number {
  const count = typeof value === 'number' ? value : Number.NaN
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`Unsafe platform referral response: ${label} must be a non-negative integer.`)
  }
  return count
}

function positiveCountAt(value: unknown, label: string): number {
  const count = countAt(value, label)
  if (count === 0) {
    throw new Error(`Unsafe platform referral response: ${label} must be positive.`)
  }
  return count
}

function timestampAt(value: unknown, label: string): string {
  const timestamp = stringAt(value, label)
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new Error(`Unsafe platform referral response: ${label} must be a timestamp.`)
  }
  return timestamp
}

function nullableTimestampAt(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null
  return timestampAt(value, label)
}

function normaliseCounts(raw: unknown, label: string): PlatformReferralUsageCounts {
  const counts = objectAt(raw, label)
  const byRole = objectAt(valueAt(counts, 'byRole', 'by_role'), `${label}.byRole`)
  const result: PlatformReferralUsageCounts = {
    total: countAt(counts.total, `${label}.total`),
    byRole: {
      client: countAt(byRole.client, `${label}.byRole.client`),
      driver: countAt(byRole.driver, `${label}.byRole.driver`),
      artisan: countAt(byRole.artisan, `${label}.byRole.artisan`),
    },
  }
  const roleTotal = result.byRole.client + result.byRole.driver + result.byRole.artisan
  if (roleTotal !== result.total) {
    throw new Error(`Unsafe platform referral response: ${label} totals do not reconcile.`)
  }
  return result
}

export function normalisePlatformReferralCodeItem(raw: unknown): PlatformReferralCodeItem {
  const item = objectAt(raw, 'item')
  const code = stringAt(item.code, 'item.code')
  if (!PLATFORM_REFERRAL_CODE_PATTERN.test(code)) {
    throw new Error('Unsafe platform referral response: item.code has an invalid format.')
  }
  const result: PlatformReferralCodeItem = {
    id: stringAt(item.id, 'item.id'),
    code,
    campaignName: stringAt(valueAt(item, 'campaignName', 'campaign_name'), 'item.campaignName'),
    isActive: booleanAt(valueAt(item, 'isActive', 'is_active'), 'item.isActive'),
    createdAt: timestampAt(valueAt(item, 'createdAt', 'created_at'), 'item.createdAt'),
    lastUsedAt: nullableTimestampAt(
      valueAt(item, 'lastUsedAt', 'last_used_at'),
      'item.lastUsedAt',
    ),
    deactivatedAt: nullableTimestampAt(
      valueAt(item, 'deactivatedAt', 'deactivated_at'),
      'item.deactivatedAt',
    ),
    deactivationReason: nullableStringAt(
      valueAt(item, 'deactivationReason', 'deactivation_reason'),
      'item.deactivationReason',
    ),
    counts: normaliseCounts(item.counts, 'item.counts'),
  }
  const hasDeactivationTimestamp = result.deactivatedAt !== null
  const hasDeactivationReason = result.deactivationReason !== null
  if (
    hasDeactivationTimestamp !== hasDeactivationReason ||
    result.isActive === hasDeactivationTimestamp
  ) {
    throw new Error('Unsafe platform referral response: item deactivation state is inconsistent.')
  }
  return result
}

function normaliseDailyCount(raw: unknown): PlatformReferralDailyCount {
  const row = objectAt(raw, 'aggregates.daily item')
  const date = stringAt(row.date, 'aggregates.daily.date')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Unsafe platform referral response: aggregates.daily.date is invalid.')
  }
  return { date, ...normaliseCounts(row, 'aggregates.daily counts') }
}

export function normalisePlatformReferralCodeListResponse(
  raw: unknown,
): PlatformReferralCodeListResponse {
  const response = objectAt(raw, 'root')
  const items = response.items
  if (!Array.isArray(items)) {
    throw new Error('Unsafe platform referral response: items must be an array.')
  }
  const pagination = objectAt(response.pagination, 'pagination')
  const aggregates = objectAt(response.aggregates, 'aggregates')
  const daily = aggregates.daily
  if (!Array.isArray(daily)) {
    throw new Error('Unsafe platform referral response: aggregates.daily must be an array.')
  }
  const aggregateCounts = normaliseCounts(aggregates, 'aggregates')
  return {
    items: items.map(normalisePlatformReferralCodeItem),
    pagination: {
      page: positiveCountAt(pagination.page, 'pagination.page'),
      limit: positiveCountAt(pagination.limit, 'pagination.limit'),
      total: countAt(pagination.total, 'pagination.total'),
    },
    aggregates: {
      ...aggregateCounts,
      daily: daily.map(normaliseDailyCount),
    },
    signupAttributionEnabled: booleanAt(
      valueAt(response, 'signupAttributionEnabled', 'signup_attribution_enabled'),
      'signupAttributionEnabled',
    ),
  }
}

export function normalisePlatformReferralCodeInput(value: string): string {
  return value.trim().toUpperCase()
}
