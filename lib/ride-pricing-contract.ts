export const RIDE_PRICING_BASES = ['payment', 'final_ride', 'current_quote'] as const

export type RidePricingBasis = (typeof RIDE_PRICING_BASES)[number]

/**
 * Authoritative trip-pricing summary returned by GET /admin/rides/:id.
 *
 * The backend owns source selection. In particular, the Admin must not infer a
 * discount from the older estimated/final fare fields because those fields do
 * not consistently distinguish promo and loyalty amounts on historical rides.
 */
export interface RidePricingSummary {
  basis: RidePricingBasis
  prePromoFarePesewas: number | null
  promoDiscountPesewas: number | null
  loyaltyDiscountPesewas: number | null
  totalDiscountPesewas: number | null
  clientAmountPesewas: number | null
  clientAmountPaid: boolean
}

export interface RidePricingPresentation {
  basisLabel: string
  clientAmountLabel:
    | 'CLIENT AMOUNT'
    | 'CLIENT AMOUNT PAID'
    | 'CLIENT AMOUNT DUE'
    | 'CURRENT ESTIMATE'
  note: string
  isEstimate: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nullablePesewas(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(amount) || amount < 0) return undefined
  return amount
}

/**
 * Parse the additive pricing contract without falling back to ambiguous legacy
 * fare fields. Invalid contract data fails soft so one bad ride cannot break the
 * full Admin detail page.
 */
export function normaliseRidePricing(raw: unknown): RidePricingSummary | null {
  if (!isRecord(raw)) return null

  const requiredFields = [
    'basis',
    'prePromoFarePesewas',
    'promoDiscountPesewas',
    'loyaltyDiscountPesewas',
    'totalDiscountPesewas',
    'clientAmountPesewas',
    'clientAmountPaid',
  ]
  if (requiredFields.some((field) => !Object.prototype.hasOwnProperty.call(raw, field))) return null

  const basis = raw.basis
  if (!RIDE_PRICING_BASES.includes(basis as RidePricingBasis)) return null
  if (typeof raw.clientAmountPaid !== 'boolean') return null

  const prePromoFarePesewas = nullablePesewas(raw.prePromoFarePesewas)
  const promoDiscountPesewas = nullablePesewas(raw.promoDiscountPesewas)
  const loyaltyDiscountPesewas = nullablePesewas(raw.loyaltyDiscountPesewas)
  const explicitTotalDiscountPesewas = nullablePesewas(raw.totalDiscountPesewas)
  const clientAmountPesewas = nullablePesewas(raw.clientAmountPesewas)

  if (
    prePromoFarePesewas === undefined ||
    promoDiscountPesewas === undefined ||
    loyaltyDiscountPesewas === undefined ||
    explicitTotalDiscountPesewas === undefined ||
    clientAmountPesewas === undefined
  ) {
    return null
  }

  const componentTotal =
    promoDiscountPesewas !== null && loyaltyDiscountPesewas !== null
      ? promoDiscountPesewas + loyaltyDiscountPesewas
      : null
  const totalDiscountPesewas = explicitTotalDiscountPesewas ?? componentTotal

  // The wire contract defines total discount as promo + loyalty. Fail soft on
  // disagreement rather than showing internally inconsistent money figures.
  if (
    explicitTotalDiscountPesewas !== null &&
    componentTotal !== null &&
    explicitTotalDiscountPesewas !== componentTotal
  ) {
    return null
  }

  if (
    prePromoFarePesewas !== null &&
    totalDiscountPesewas !== null &&
    clientAmountPesewas !== null &&
    prePromoFarePesewas !== totalDiscountPesewas + clientAmountPesewas
  ) {
    return null
  }

  if (basis === 'current_quote' && raw.clientAmountPaid) return null
  if (raw.clientAmountPaid && clientAmountPesewas === null) return null

  return {
    basis: basis as RidePricingBasis,
    prePromoFarePesewas,
    promoDiscountPesewas,
    loyaltyDiscountPesewas,
    totalDiscountPesewas,
    clientAmountPesewas,
    clientAmountPaid: raw.clientAmountPaid,
  }
}

export function getRidePricingPresentation(
  pricing: RidePricingSummary | null,
): RidePricingPresentation {
  if (!pricing) {
    return {
      basisLabel: 'Pricing unavailable',
      clientAmountLabel: 'CLIENT AMOUNT',
      note: 'The API did not return an authoritative pricing breakdown for this ride.',
      isEstimate: false,
    }
  }

  if (pricing.basis === 'current_quote') {
    return {
      basisLabel: 'Current estimate',
      clientAmountLabel: 'CURRENT ESTIMATE',
      note: 'Estimate only. The client has not paid yet.',
      isEstimate: true,
    }
  }

  if (pricing.clientAmountPaid) {
    return {
      basisLabel: pricing.basis === 'payment' ? 'Payment record' : 'Final ride amounts',
      clientAmountLabel: 'CLIENT AMOUNT PAID',
      note: 'Promo / discount combines the platform promo and loyalty discount.',
      isEstimate: false,
    }
  }

  return {
    basisLabel: pricing.basis === 'payment' ? 'Payment record' : 'Final ride amounts',
    clientAmountLabel: 'CLIENT AMOUNT DUE',
    note: 'Final trip amounts are available, but client payment is not recorded yet.',
    isEstimate: false,
  }
}
