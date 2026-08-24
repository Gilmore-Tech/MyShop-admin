// Centralised display labels for payment-related enums.
// Spec: docs/admin-frontend-spec-payment-panel.md 4.1, 5.2.
//
// The maps now live in lib/status-labels.ts (the app-wide registry); this file
// re-exports the payment helpers so existing imports keep working.

export { paymentMethodLabel, paymentStatusLabel, transactionTypeLabel } from './status-labels.ts'
