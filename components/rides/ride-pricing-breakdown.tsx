import { getRidePricingPresentation, type RidePricingSummary } from '@/lib/ride-pricing-contract'

function fmtGhs(pesewas: number | null | undefined) {
  if (pesewas == null) return '-'
  return 'GHS ' + (pesewas / 100).toLocaleString('en-GH', { minimumFractionDigits: 2 })
}

function PricingValue({
  label,
  amountPesewas,
  caption,
  variant,
}: {
  label: string
  amountPesewas: number | null | undefined
  caption: string
  variant: 'cards' | 'rows'
}) {
  if (variant === 'rows') {
    return (
      <div className="flex items-start justify-between gap-3 rounded-md bg-gray-50 px-2.5 py-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
          <p className="mt-0.5 text-[9px] text-gray-400">{caption}</p>
        </div>
        <p className="shrink-0 text-sm font-bold text-gray-900">{fmtGhs(amountPesewas)}</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-base font-bold text-gray-900">{fmtGhs(amountPesewas)}</p>
      <p className="mt-0.5 text-[10px] text-gray-400">{caption}</p>
    </div>
  )
}

export function RidePricingBreakdown({
  pricing,
  variant = 'cards',
}: {
  pricing: RidePricingSummary | null
  variant?: 'cards' | 'rows'
}) {
  // During a rolling backend deployment the additive contract may be absent.
  // Never render paid/due labels without backend pricing authority; callers
  // show their explicit legacy-fare fallback instead.
  if (!pricing) return null

  const presentation = getRidePricingPresentation(pricing)

  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-gray-700">Ride pricing</p>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            presentation.isEstimate
              ? 'bg-amber-50 text-amber-700'
              : pricing
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-gray-100 text-gray-500'
          }`}
        >
          {presentation.basisLabel}
        </span>
      </div>
      <div className={variant === 'cards' ? 'grid grid-cols-1 gap-2 sm:grid-cols-3' : 'space-y-1.5'}>
        <PricingValue
          label="PRE-PROMO FARE"
          amountPesewas={pricing?.prePromoFarePesewas}
          caption="Before promo and loyalty"
          variant={variant}
        />
        <PricingValue
          label="PROMO / DISCOUNT"
          amountPesewas={pricing?.totalDiscountPesewas}
          caption="Promo + loyalty"
          variant={variant}
        />
        <PricingValue
          label={presentation.clientAmountLabel}
          amountPesewas={pricing?.clientAmountPesewas}
          caption={pricing?.clientAmountPaid ? 'Collected from client' : 'Not paid yet'}
          variant={variant}
        />
      </div>
      <p className="mt-2 text-[11px] text-gray-500">{presentation.note}</p>
      {pricing &&
        (pricing.promoDiscountPesewas ?? 0) > 0 &&
        (pricing.loyaltyDiscountPesewas ?? 0) > 0 && (
          <p className="mt-1 text-[11px] text-gray-400">
            Platform promo {fmtGhs(pricing.promoDiscountPesewas)} + loyalty{' '}
            {fmtGhs(pricing.loyaltyDiscountPesewas)}
          </p>
        )}
    </div>
  )
}
