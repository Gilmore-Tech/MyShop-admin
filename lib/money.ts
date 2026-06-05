// Single source of truth for pesewas → GHS formatting across the admin panel.
// Spec: docs/admin-frontend-spec-payment-panel.md §5.1.
//
// All amounts arrive from the backend as integer pesewas. Use these helpers
// only for *presentation* — never for arithmetic.

export interface FormatGhsOptions {
  /** Include the "GHS " prefix. Default true. */
  withPrefix?: boolean
  /** Force a leading + sign when non-negative. Default false. */
  signed?: boolean
}

export function formatGhs(pesewas: number | null | undefined, opts: FormatGhsOptions = {}): string {
  const { withPrefix = true, signed = false } = opts
  if (pesewas == null || Number.isNaN(pesewas)) return withPrefix ? 'GHS —' : '—'
  const value = pesewas / 100
  const formatted = value.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const sign = signed && value > 0 ? '+' : value < 0 ? '−' : ''
  // toLocaleString already adds a "-" for negatives; replace with the typographic
  // minus so signed/unsigned outputs look consistent.
  const body = formatted.startsWith('-') ? formatted.slice(1) : formatted
  return `${withPrefix ? 'GHS ' : ''}${sign}${body}`
}

/**
 * Convenience for transaction rows: returns the amount with the correct sign
 * based on whether the row represents money flowing in or out of the platform's
 * perspective. Spec §4.1.
 */
export function formatTransactionAmount(
  amountPesewas: number,
  type: 'collection' | 'payout' | 'refund' | 'clawback' | 'tip',
): string {
  const isOutflow = type === 'payout' || type === 'clawback' || type === 'refund'
  const signed = isOutflow ? -Math.abs(amountPesewas) : Math.abs(amountPesewas)
  return formatGhs(signed, { signed: true })
}
