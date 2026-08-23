import { isRecord, count, signedCount, nullableString, oneOf, pick } from './contract-utils.ts'

/**
 * `GET /admin/reports/commission-ledger` — the full platform commission on
 * every settled booking, per provider / day / booking, whether or not a promo
 * applied. Mirrors the backend's cash netting exactly:
 *
 *   effective       = commission − commissionRelief
 *   netted (cash)   = min(effective, promoSubsidy)   — retained instead of collected
 *   cashOwed        = max(0, effective − promoSubsidy) — becomes a CASH_COMMISSION clawback
 *   digitalWithheld = effective on MoMo/card           — withheld from the payout
 *
 * so `commission − relief = netted + cashOwed + digitalWithheld` on every row.
 * All money is integer pesewas.
 */
export const LEDGER_GROUP_BY = ['provider', 'day', 'booking'] as const
export type LedgerGroupBy = (typeof LEDGER_GROUP_BY)[number]

export interface CommissionLedgerMoney {
  bookings: number
  prePromoFaresPesewas: number
  commissionPesewas: number
  commissionReliefPesewas: number
  promoSubsidyPesewas: number
  commissionNettedAgainstPromoPesewas: number
  cashCommissionOwedPesewas: number
  cashPlatformPayablePesewas: number
  digitalCommissionWithheldPesewas: number
  clawbackRecordedPesewas: number
  clawbackPaidPesewas: number
  clawbackWrittenOffPesewas: number
  clawbackOutstandingPesewas: number
  paymentMethods: { cash: number; momo: number; card: number; other: number }
}

export interface CommissionLedgerRow extends CommissionLedgerMoney {
  /** Stable key for React lists: providerId | period | paymentId. */
  key: string
  // groupBy=provider
  providerId: string | null
  providerType: 'driver' | 'artisan' | null
  fullName: string | null
  phone: string | null
  // groupBy=day
  period: string | null
  // groupBy=booking
  bookingId: string | null
  bookingType: 'ride' | 'artisan_job' | null
  paymentId: string | null
  paymentMethod: string | null
  paymentStatus: string | null
  settledAt: string | null
  clawbackStatus: string | null
}

export interface CommissionLedgerReport {
  from: string
  to: string
  groupBy: LedgerGroupBy
  page: number
  limit: number
  total: number
  rows: CommissionLedgerRow[]
  totals: CommissionLedgerMoney
}

const ZERO_MONEY: CommissionLedgerMoney = {
  bookings: 0,
  prePromoFaresPesewas: 0,
  commissionPesewas: 0,
  commissionReliefPesewas: 0,
  promoSubsidyPesewas: 0,
  commissionNettedAgainstPromoPesewas: 0,
  cashCommissionOwedPesewas: 0,
  cashPlatformPayablePesewas: 0,
  digitalCommissionWithheldPesewas: 0,
  clawbackRecordedPesewas: 0,
  clawbackPaidPesewas: 0,
  clawbackWrittenOffPesewas: 0,
  clawbackOutstandingPesewas: 0,
  paymentMethods: { cash: 0, momo: 0, card: 0, other: 0 },
}

export function normaliseLedgerMoney(raw: unknown): CommissionLedgerMoney {
  if (!isRecord(raw)) return { ...ZERO_MONEY, paymentMethods: { ...ZERO_MONEY.paymentMethods } }
  const methods = isRecord(raw.paymentMethods) ? raw.paymentMethods : isRecord(raw.payment_methods) ? raw.payment_methods : {}
  return {
    bookings: count(raw.bookings),
    prePromoFaresPesewas: count(pick(raw, 'prePromoFaresPesewas', 'pre_promo_fares_pesewas')),
    commissionPesewas: count(pick(raw, 'commissionPesewas', 'commission_pesewas')),
    commissionReliefPesewas: count(pick(raw, 'commissionReliefPesewas', 'commission_relief_pesewas')),
    promoSubsidyPesewas: count(pick(raw, 'promoSubsidyPesewas', 'promo_subsidy_pesewas')),
    commissionNettedAgainstPromoPesewas: count(pick(raw, 'commissionNettedAgainstPromoPesewas', 'commission_netted_against_promo_pesewas')),
    cashCommissionOwedPesewas: count(pick(raw, 'cashCommissionOwedPesewas', 'cash_commission_owed_pesewas')),
    cashPlatformPayablePesewas: count(pick(raw, 'cashPlatformPayablePesewas', 'cash_platform_payable_pesewas')),
    digitalCommissionWithheldPesewas: count(pick(raw, 'digitalCommissionWithheldPesewas', 'digital_commission_withheld_pesewas')),
    clawbackRecordedPesewas: count(pick(raw, 'clawbackRecordedPesewas', 'clawback_recorded_pesewas')),
    clawbackPaidPesewas: count(pick(raw, 'clawbackPaidPesewas', 'clawback_paid_pesewas')),
    clawbackWrittenOffPesewas: count(pick(raw, 'clawbackWrittenOffPesewas', 'clawback_written_off_pesewas')),
    clawbackOutstandingPesewas: signedCount(pick(raw, 'clawbackOutstandingPesewas', 'clawback_outstanding_pesewas')),
    paymentMethods: {
      cash: count(methods.cash),
      momo: count(methods.momo),
      card: count(methods.card),
      other: count(methods.other),
    },
  }
}

export function normaliseCommissionLedgerRow(raw: unknown, groupBy: LedgerGroupBy): CommissionLedgerRow | null {
  if (!isRecord(raw)) return null
  const providerId = nullableString(pick(raw, 'providerId', 'provider_id'))
  const period = nullableString(raw.period)
  const paymentId = nullableString(pick(raw, 'paymentId', 'payment_id'))
  const bookingId = nullableString(pick(raw, 'bookingId', 'booking_id'))
  const key = groupBy === 'provider' ? providerId : groupBy === 'day' ? period : paymentId ?? bookingId
  if (!key) return null
  const providerTypeRaw = pick(raw, 'providerType', 'provider_type')
  const bookingTypeRaw = pick(raw, 'bookingType', 'booking_type')
  return {
    key,
    ...normaliseLedgerMoney(raw),
    providerId,
    providerType: providerTypeRaw === 'driver' || providerTypeRaw === 'artisan' ? providerTypeRaw : null,
    fullName: nullableString(pick(raw, 'fullName', 'full_name', 'providerName', 'provider_name')),
    phone: nullableString(raw.phone),
    period,
    bookingId,
    bookingType: bookingTypeRaw === 'ride' || bookingTypeRaw === 'artisan_job' ? bookingTypeRaw : null,
    paymentId,
    paymentMethod: nullableString(pick(raw, 'paymentMethod', 'payment_method')),
    paymentStatus: nullableString(pick(raw, 'paymentStatus', 'payment_status')),
    settledAt: nullableString(pick(raw, 'settledAt', 'settled_at', 'createdAt', 'created_at')),
    clawbackStatus: nullableString(pick(raw, 'clawbackStatus', 'clawback_status')),
  }
}

export function normaliseCommissionLedger(raw: unknown, requested: { groupBy: LedgerGroupBy; page?: number; limit?: number }): CommissionLedgerReport {
  const record = isRecord(raw) ? raw : {}
  const groupBy = oneOf(record.groupBy ?? record.group_by, LEDGER_GROUP_BY, requested.groupBy)
  const rows = (Array.isArray(record.rows) ? record.rows : Array.isArray(record.items) ? record.items : [])
    .map(r => normaliseCommissionLedgerRow(r, groupBy))
    .filter((r): r is CommissionLedgerRow => r !== null)
  return {
    from: nullableString(record.from) ?? '',
    to: nullableString(record.to) ?? '',
    groupBy,
    page: Math.max(1, count(record.page, requested.page ?? 1)),
    limit: count(record.limit, requested.limit ?? rows.length),
    total: count(record.total, rows.length),
    rows,
    totals: normaliseLedgerMoney(record.totals),
  }
}

/**
 * The reconciliation identity every row must satisfy. Exposed so the page can
 * flag a row the backend got wrong instead of silently rendering it.
 */
export function ledgerRowBalances(row: CommissionLedgerMoney): boolean {
  const effective = row.commissionPesewas - row.commissionReliefPesewas
  return effective === row.commissionNettedAgainstPromoPesewas + row.cashCommissionOwedPesewas + row.digitalCommissionWithheldPesewas
}
