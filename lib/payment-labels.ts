// Centralised display labels for payment-related enums.
// Spec: docs/admin-frontend-spec-payment-panel.md §4.1, §5.2.

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
  mixed: 'Different statuses',
}

export function paymentStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, ' ')
}
