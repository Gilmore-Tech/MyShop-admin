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

// Admin-facing labels use plain-English, direction-based names instead of the
// backend's finance jargon. Keys MUST stay in sync with the backend
// TransactionType union — only the display text changes.
const TYPE_LABELS: Record<string, string> = {
  collection: 'Customer Payment',
  payout:     'Provider Payout',
  refund:     'Customer Refund',
  clawback:   'Refund Recovery',
  tip:        'Tip',
  remittance: 'Cash Commission Paid',
}

export function transactionTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type
}

const TYPE_DESCRIPTIONS: Record<string, string> = {
  collection: 'Money collected from a customer for a ride or artisan job.',
  payout:     'Money disbursed from MyShop to a provider.',
  refund:     'Money returned from MyShop to a customer.',
  clawback:   'Refund or dispute amount MyShop is recovering from a provider.',
  tip:        'Customer tip collected for a provider; no platform commission.',
  remittance: 'Platform commission a provider has paid back after taking cash.',
}

export function transactionTypeDescription(type: string): string {
  return TYPE_DESCRIPTIONS[type] ?? 'Payment ledger entry.'
}
