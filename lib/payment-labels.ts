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
  collection: 'Collection',
  payout:     'Payout',
  refund:     'Refund',
  clawback:   'Clawback',
  tip:        'Tip',
}

export function transactionTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type
}
