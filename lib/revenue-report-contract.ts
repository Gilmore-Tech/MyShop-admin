import { isRecord, nullableNumber, numberOr, count, nullableString } from './contract-utils.ts'

/**
 * `GET /admin/reports/revenue` — the one legacy endpoint that speaks GHS
 * floats. Additive promo fields (promo/loyalty/subsidy/relief and the nets)
 * default to 0 on backends that predate them; `netCommissionAfterPromoGhs`
 * is derived client-side when absent so the Revenue by Date page can render
 * Gross / Promo / Net from any deployment.
 *
 * Definitions (agreed with stakeholders):
 *   gross revenue            = commissionGhs (platform commission on pre-promo fares)
 *   promo funded             = subsidyGhs    (promo + loyalty the platform paid for)
 *   net revenue              = commission − commissionRelief − subsidy
 */
export type RevenueGroupBy = 'day' | 'week' | 'month' | 'year'

export interface VerticalRevenue {
  collectionsGhs: number
  commissionGhs: number
  payoutsGhs: number
  refundsGhs: number
  totalPayments: number
  promoGhs: number
  loyaltyGhs: number
  subsidyGhs: number
  commissionReliefGhs: number
  netCommissionAfterPromoGhs: number
}

export interface RevenueDataPoint {
  period: string
  collectionsGhs: number
  commissionGhs: number
  payoutsGhs: number
  tipsGhs: number
  // Refunds returned to clients and dispute-clawbacks recovered from providers
  // in this period. netRevenueGhs = commission − refunds + clawbacks (the
  // platform's true take; can be negative in a refund-heavy period).
  refundsGhs: number
  clawbacksGhs: number
  netRevenueGhs: number
  totalPayments: number
  successfulPayments: number
  paymentSuccessRatePct: number | null
  momoCount: number
  cardCount: number
  cashCount: number
  promoGhs: number
  loyaltyGhs: number
  subsidyGhs: number
  commissionReliefGhs: number
  netCommissionAfterPromoGhs: number
  netRevenueAfterPromoGhs: number
  /** Per-vertical split (rides vs artisan services); optional on older backends. */
  byVertical?: {
    rides: VerticalRevenue
    artisans: VerticalRevenue
  }
}

export interface RevenueReport {
  from: string
  to: string
  groupBy: string
  periods: RevenueDataPoint[]
}

function ghs(record: Record<string, unknown>, camel: string, snake: string): number {
  return numberOr(record[camel] ?? record[snake], 0)
}

function normaliseVertical(raw: unknown): VerticalRevenue | null {
  if (!isRecord(raw)) return null
  const commissionGhs = ghs(raw, 'commissionGhs', 'commission_ghs')
  const promoGhs = ghs(raw, 'promoGhs', 'promo_ghs')
  const loyaltyGhs = ghs(raw, 'loyaltyGhs', 'loyalty_ghs')
  const subsidyGhs = nullableNumber(raw.subsidyGhs ?? raw.subsidy_ghs) ?? promoGhs + loyaltyGhs
  const commissionReliefGhs = ghs(raw, 'commissionReliefGhs', 'commission_relief_ghs')
  return {
    collectionsGhs: ghs(raw, 'collectionsGhs', 'collections_ghs'),
    commissionGhs,
    payoutsGhs: ghs(raw, 'payoutsGhs', 'payouts_ghs'),
    refundsGhs: ghs(raw, 'refundsGhs', 'refunds_ghs'),
    totalPayments: count(raw.totalPayments ?? raw.total_payments),
    promoGhs,
    loyaltyGhs,
    subsidyGhs,
    commissionReliefGhs,
    netCommissionAfterPromoGhs:
      nullableNumber(raw.netCommissionAfterPromoGhs ?? raw.net_commission_after_promo_ghs) ??
      commissionGhs - commissionReliefGhs - subsidyGhs,
  }
}

export function normaliseRevenueDataPoint(raw: unknown): RevenueDataPoint | null {
  if (!isRecord(raw)) return null
  const period = nullableString(raw.period ?? raw.date)
  if (!period) return null

  const commissionGhs = ghs(raw, 'commissionGhs', 'commission_ghs')
  const refundsGhs = ghs(raw, 'refundsGhs', 'refunds_ghs')
  const clawbacksGhs = ghs(raw, 'clawbacksGhs', 'clawbacks_ghs')
  const netRevenueGhs =
    nullableNumber(raw.netRevenueGhs ?? raw.net_revenue_ghs) ?? commissionGhs - refundsGhs + clawbacksGhs
  const promoGhs = ghs(raw, 'promoGhs', 'promo_ghs')
  const loyaltyGhs = ghs(raw, 'loyaltyGhs', 'loyalty_ghs')
  const subsidyGhs = nullableNumber(raw.subsidyGhs ?? raw.subsidy_ghs) ?? promoGhs + loyaltyGhs
  const commissionReliefGhs = ghs(raw, 'commissionReliefGhs', 'commission_relief_ghs')
  const netCommissionAfterPromoGhs =
    nullableNumber(raw.netCommissionAfterPromoGhs ?? raw.net_commission_after_promo_ghs) ??
    commissionGhs - commissionReliefGhs - subsidyGhs

  const verticals = isRecord(raw.byVertical) ? raw.byVertical : isRecord(raw.by_vertical) ? raw.by_vertical : null
  const rides = verticals ? normaliseVertical(verticals.rides) : null
  const artisans = verticals ? normaliseVertical(verticals.artisans) : null

  return {
    period,
    collectionsGhs: ghs(raw, 'collectionsGhs', 'collections_ghs'),
    commissionGhs,
    payoutsGhs: ghs(raw, 'payoutsGhs', 'payouts_ghs'),
    tipsGhs: ghs(raw, 'tipsGhs', 'tips_ghs'),
    refundsGhs,
    clawbacksGhs,
    netRevenueGhs,
    totalPayments: count(raw.totalPayments ?? raw.total_payments),
    successfulPayments: count(raw.successfulPayments ?? raw.successful_payments),
    paymentSuccessRatePct: nullableNumber(raw.paymentSuccessRatePct ?? raw.payment_success_rate_pct),
    momoCount: count(raw.momoCount ?? raw.momo_count),
    cardCount: count(raw.cardCount ?? raw.card_count),
    cashCount: count(raw.cashCount ?? raw.cash_count),
    promoGhs,
    loyaltyGhs,
    subsidyGhs,
    commissionReliefGhs,
    netCommissionAfterPromoGhs,
    netRevenueAfterPromoGhs:
      nullableNumber(raw.netRevenueAfterPromoGhs ?? raw.net_revenue_after_promo_ghs) ??
      netRevenueGhs - commissionReliefGhs - subsidyGhs,
    ...(rides && artisans ? { byVertical: { rides, artisans } } : {}),
  }
}

export function normaliseRevenueReport(raw: unknown, fallbackGroupBy = 'day'): RevenueReport {
  if (!isRecord(raw)) return { from: '', to: '', groupBy: fallbackGroupBy, periods: [] }
  const source = Array.isArray(raw.periods) ? raw.periods : Array.isArray(raw.data) ? raw.data : []
  const periods = source
    .map(normaliseRevenueDataPoint)
    .filter((p): p is RevenueDataPoint => p !== null)
  return {
    from: nullableString(raw.from) ?? '',
    to: nullableString(raw.to) ?? '',
    groupBy: nullableString(raw.groupBy ?? raw.group_by) ?? fallbackGroupBy,
    periods,
  }
}

/** Sum a GHS field across periods (presentation only; callers format via ghsToPesewas + formatGhs). */
export function sumGhs(periods: RevenueDataPoint[], key: keyof Omit<RevenueDataPoint, 'period' | 'byVertical' | 'paymentSuccessRatePct'>): number {
  return periods.reduce((s, p) => s + (p[key] as number), 0)
}
