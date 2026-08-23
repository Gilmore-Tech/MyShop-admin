// Centralised display labels for payment-related enums.
// Spec: docs/admin-frontend-spec-payment-panel.md §4.1, §5.2.

const METHOD_LABELS: Record<string, string> = {
  // Canonical values (packages/shared-types PaymentMethod). Anything not listed
  // falls through to a de-underscored form, so an unmapped value still reads.
  momo_mtn:             'MoMo MTN',
  momo_telecel:         'MoMo Telecel',
  momo_airteltigo:      'MoMo AirtelTigo',
  visa:                 'Visa',
  mastercard:           'Mastercard',
  cash:                 'Cash',
  paystack_wallet:      'Paystack Wallet',
  bank_transfer:        'Bank Transfer',
  // Legacy/aliased values still present on historical rows.
  mobile_money_mtn:     'MoMo MTN',
  mobile_money_vodafone:'MoMo Vodafone',
  mobile_money_airteltigo: 'MoMo AirtelTigo',
  card:                 'Card',
  paystack_transfer:    'Paystack Transfer',
}

export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return '—'
  return METHOD_LABELS[method] ?? method.replace(/_/g, ' ')
}

const TYPE_LABELS: Record<string, string> = {
  collection: 'Money received',
  payout:     'Paid to provider',
  refund:     'Money returned',
  clawback:   'Debt recovery',
  tip:        'Tip',
  remittance: 'Debt payment',
}

export function transactionTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Waiting',
  completed: 'Completed',
  complete: 'Completed',
  failed: 'Failed',
  refunded: 'Returned',
  escrowed: 'Payment held safely',
  partial: 'Partly paid',
  settled: 'Fully paid',
  outstanding: 'Amount due',
  escalated: 'Sent for follow-up',
  written_off: 'Cleared',
  reconciliation_required: 'Financial review required',
  mixed: 'Different statuses',
}

export function paymentStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, ' ')
}
