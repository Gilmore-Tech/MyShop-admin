// Centralised display labels for payment-related enums.
// Spec: docs/admin-frontend-spec-payment-panel.md §4.1, §5.2.
//
// These map BACKEND ENUM VALUES → PLAIN-ENGLISH UI TEXT. The enum values
// themselves are the contract with the API and must never be renamed here —
// only the right-hand side of each map is display copy.
//
// Audience note: these pages are granted to ops_admin and support_agent
// (spec §Role gates), not only finance staff, so labels are written for a
// reader who has never seen the word "clawback".

const METHOD_LABELS: Record<string, string> = {
  mobile_money_mtn:     'MoMo MTN',
  mobile_money_vodafone:'MoMo Vodafone',
  mobile_money_airteltigo: 'MoMo AirtelTigo',
  card:                 'Card',
  cash:                 'Cash',
  paystack_wallet:      'Paystack Wallet',
  paystack_transfer:    'Paystack Transfer',
  bank_transfer:        'Bank Transfer',
}

export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return '—'
  return METHOD_LABELS[method] ?? method.replace(/_/g, ' ')
}

/**
 * Turns an unmapped backend enum into something readable rather than leaking
 * raw snake_case to the screen. Last line of defence — prefer an explicit map.
 */
export function humanizeEnum(value: string): string {
  const spaced = value.replace(/_/g, ' ').trim().toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

const TYPE_LABELS: Record<string, string> = {
  collection: 'Payment In',
  payout:     'Paid to Provider',
  refund:     'Refund',
  clawback:   'Debt Recovered',
  tip:        'Tip',
  remittance: 'Cash Handover',
}

export function transactionTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? humanizeEnum(type)
}

const TRANSACTION_STATUS_LABELS: Record<string, string> = {
  pending:   'Pending',
  completed: 'Completed',
  failed:    'Failed',
  refunded:  'Refunded',
}

export function transactionStatusLabel(status: string): string {
  return TRANSACTION_STATUS_LABELS[status] ?? humanizeEnum(status)
}

// ── Provider debts (backend name: clawbacks) ────────────────────────────────
// Kept separate from the shared <StatusBadge> map on purpose: `partial` means
// "partly repaid" here but "partially-completed run" on Batch Payouts.

const CLAWBACK_STATUS_LABELS: Record<string, string> = {
  pending:     'Unpaid',
  partial:     'Partly Repaid',
  settled:     'Fully Repaid',
  escalated:   'With Recovery Team',
  written_off: 'Cancelled',
}

export function clawbackStatusLabel(status: string | null | undefined): string {
  if (!status) return '—'
  return CLAWBACK_STATUS_LABELS[status] ?? humanizeEnum(status)
}

const CLAWBACK_SOURCE_LABELS: Record<string, string> = {
  cash_commission: 'Unpaid commission (cash job)',
  dispute:         'Refund after dispute',
  write_off:       'Cancelled debt',
  manual:          'Added manually',
}

export function clawbackSourceLabel(source: string | null | undefined): string {
  if (!source) return '—'
  return CLAWBACK_SOURCE_LABELS[source.toLowerCase()] ?? humanizeEnum(source)
}

// ── Bulk payment runs (backend name: batch payouts) ─────────────────────────

const BATCH_FAILURE_LABELS: Record<string, string> = {
  insufficient_balance: 'Not enough money in the payout account',
  provider_no_payout_method: 'Provider has no payout method saved',
  transfer_rejected: 'Payment provider rejected the transfer',
  timeout: 'Timed out before finishing',
}

export function batchFailureLabel(reason: string | null | undefined): string | null {
  if (!reason) return null
  return BATCH_FAILURE_LABELS[reason.toLowerCase()] ?? humanizeEnum(reason)
}

// ── Unprocessed payment events (backend name: webhook failures) ─────────────

const WEBHOOK_ERROR_LABELS: Record<string, string> = {
  signature_invalid: 'Security check failed',
  booking_not_found: 'No matching booking',
  payment_not_found: 'No matching payment',
  duplicate_event: 'Already processed',
  amount_mismatch: "Amount didn't match the booking",
  timeout: 'Timed out before finishing',
}

export function webhookErrorLabel(code: string | null | undefined): string {
  if (!code) return 'Unknown problem'
  return WEBHOOK_ERROR_LABELS[code.toLowerCase()] ?? humanizeEnum(code)
}
