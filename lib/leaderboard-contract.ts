import { isRecord, count, nullableNumber, nullableString, oneOf, pick } from './contract-utils.ts'

/**
 * `GET /admin/reports/providers/leaderboard` and `GET /admin/reports/clients/top`.
 * Rankings are over the requested date range only (completed bookings by
 * `completedAt` for providers; bookings created in range for clients) — they
 * deliberately differ from the lifetime figures on `/admin/reports/providers`.
 * All money is integer pesewas.
 */
export const PROVIDER_LEADERBOARD_VERTICALS = ['all', 'drivers', 'artisans'] as const
export type ProviderLeaderboardVertical = (typeof PROVIDER_LEADERBOARD_VERTICALS)[number]

export const CLIENT_LEADERBOARD_VERTICALS = ['all', 'rides', 'artisans'] as const
export type ClientLeaderboardVertical = (typeof CLIENT_LEADERBOARD_VERTICALS)[number]

export interface ProviderLeaderboardRow {
  providerId: string
  userId: string | null
  role: 'driver' | 'artisan'
  fullName: string
  phone: string | null
  verificationStatus: string | null
  regionName: string | null
  completedCount: number
  cancelledCount: number
  /** Completed bookings whose money-in payment has settled (≤ completedCount). */
  settledCount: number
  grossFaresPesewas: number
  commissionPesewas: number
  commissionReliefPesewas: number
  subsidyPesewas: number
  earningsPesewas: number
  avgRating: number | null
  ratingCount: number
}

export interface ProviderLeaderboardPage {
  items: ProviderLeaderboardRow[]
  total: number
}

export interface ProviderLeaderboardReport {
  from: string
  to: string
  vertical: ProviderLeaderboardVertical
  page: number
  limit: number
  drivers: ProviderLeaderboardPage | null
  artisans: ProviderLeaderboardPage | null
}

export interface TopClientRow {
  clientId: string
  userId: string | null
  fullName: string
  phone: string | null
  requestedCount: number
  completedCount: number
  cancelledCount: number
  totalSpendPesewas: number
  promoReceivedPesewas: number
  lastBookingAt: string | null
}

export interface TopClientsReport {
  from: string
  to: string
  vertical: ClientLeaderboardVertical
  limit: number
  items: TopClientRow[]
}

export function normaliseProviderLeaderboardRow(raw: unknown, fallbackRole: 'driver' | 'artisan'): ProviderLeaderboardRow | null {
  if (!isRecord(raw)) return null
  const providerId = nullableString(pick(raw, 'providerId', 'provider_id', 'id'))
  if (!providerId) return null
  const role = raw.role === 'driver' || raw.role === 'artisan' ? raw.role : fallbackRole
  const completedCount = count(pick(raw, 'completedCount', 'completed_count'))
  return {
    providerId,
    userId: nullableString(pick(raw, 'userId', 'user_id')),
    role,
    fullName: nullableString(pick(raw, 'fullName', 'full_name', 'name')) ?? (role === 'driver' ? 'Driver' : 'Artisan'),
    phone: nullableString(raw.phone),
    verificationStatus: nullableString(pick(raw, 'verificationStatus', 'verification_status')),
    regionName: nullableString(pick(raw, 'regionName', 'region_name')),
    completedCount,
    cancelledCount: count(pick(raw, 'cancelledCount', 'cancelled_count')),
    settledCount: Math.min(completedCount, count(pick(raw, 'settledCount', 'settled_count'), completedCount)),
    grossFaresPesewas: count(pick(raw, 'grossFaresPesewas', 'gross_fares_pesewas')),
    commissionPesewas: count(pick(raw, 'commissionPesewas', 'commission_pesewas')),
    commissionReliefPesewas: count(pick(raw, 'commissionReliefPesewas', 'commission_relief_pesewas')),
    subsidyPesewas: count(pick(raw, 'subsidyPesewas', 'subsidy_pesewas')),
    earningsPesewas: count(pick(raw, 'earningsPesewas', 'earnings_pesewas')),
    avgRating: nullableNumber(pick(raw, 'avgRating', 'avg_rating')),
    ratingCount: count(pick(raw, 'ratingCount', 'rating_count')),
  }
}

function normalisePage(raw: unknown, role: 'driver' | 'artisan'): ProviderLeaderboardPage | null {
  if (!isRecord(raw)) return null
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .map(r => normaliseProviderLeaderboardRow(r, role))
    .filter((r): r is ProviderLeaderboardRow => r !== null)
    // Defensive: the backend sorts, but never trust order for a ranking.
    .sort((a, b) => b.completedCount - a.completedCount || b.grossFaresPesewas - a.grossFaresPesewas || a.providerId.localeCompare(b.providerId))
  return { items, total: count(raw.total, items.length) }
}

export function normaliseProviderLeaderboard(raw: unknown, requested: { vertical: ProviderLeaderboardVertical; page?: number; limit?: number }): ProviderLeaderboardReport {
  const record = isRecord(raw) ? raw : {}
  return {
    from: nullableString(record.from) ?? '',
    to: nullableString(record.to) ?? '',
    vertical: oneOf(record.vertical, PROVIDER_LEADERBOARD_VERTICALS, requested.vertical),
    page: Math.max(1, count(record.page, requested.page ?? 1)),
    limit: count(record.limit, requested.limit ?? 20),
    drivers: normalisePage(record.drivers, 'driver'),
    artisans: normalisePage(record.artisans, 'artisan'),
  }
}

export function normaliseTopClientRow(raw: unknown): TopClientRow | null {
  if (!isRecord(raw)) return null
  const clientId = nullableString(pick(raw, 'clientId', 'client_id', 'id'))
  if (!clientId) return null
  return {
    clientId,
    userId: nullableString(pick(raw, 'userId', 'user_id')),
    fullName: nullableString(pick(raw, 'fullName', 'full_name', 'name')) ?? 'Client',
    phone: nullableString(raw.phone),
    requestedCount: count(pick(raw, 'requestedCount', 'requested_count')),
    completedCount: count(pick(raw, 'completedCount', 'completed_count')),
    cancelledCount: count(pick(raw, 'cancelledCount', 'cancelled_count')),
    totalSpendPesewas: count(pick(raw, 'totalSpendPesewas', 'total_spend_pesewas')),
    promoReceivedPesewas: count(pick(raw, 'promoReceivedPesewas', 'promo_received_pesewas')),
    lastBookingAt: nullableString(pick(raw, 'lastBookingAt', 'last_booking_at')),
  }
}

export function normaliseTopClients(raw: unknown, requested: { vertical: ClientLeaderboardVertical; limit?: number }): TopClientsReport {
  const record = isRecord(raw) ? raw : {}
  const items = (Array.isArray(record.items) ? record.items : [])
    .map(normaliseTopClientRow)
    .filter((r): r is TopClientRow => r !== null)
    .sort((a, b) => b.completedCount - a.completedCount || b.totalSpendPesewas - a.totalSpendPesewas || a.clientId.localeCompare(b.clientId))
  return {
    from: nullableString(record.from) ?? '',
    to: nullableString(record.to) ?? '',
    vertical: oneOf(record.vertical, CLIENT_LEADERBOARD_VERTICALS, requested.vertical),
    limit: count(record.limit, requested.limit ?? items.length),
    items,
  }
}
