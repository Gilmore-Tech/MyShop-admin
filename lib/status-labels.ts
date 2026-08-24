/**
 * The single registry for every status, payment-method and transaction-type
 * label the admin renders. Plain, sentence-case English — the redesign rule is
 * that the words carry the meaning (badges stay monochrome), so a raw enum
 * value reaching the screen is a bug. `lib/payment-labels.ts` re-exports the
 * payment helpers from here, so existing imports keep working.
 *
 * Domains exist for the few values whose reading depends on context
 * (`pending` is "Waiting" on a payment but "Pending" on a verification).
 * When in doubt, `statusLabel(value)` without a domain is safe: it reads the
 * generic map and falls back to a de-underscored form.
 */

export type StatusDomain = 'generic' | 'payment'

const GENERIC_LABELS: Record<string, string> = {
  // Accounts & people
  active: 'Active', inactive: 'Inactive', pending: 'Pending', suspended: 'Suspended',
  banned: 'Banned', deleted: 'Deleted', client: 'Client', driver: 'Driver', artisan: 'Artisan',
  super_admin: 'Super admin', regional_admin: 'Regional admin', ops_admin: 'Ops admin',
  support_agent: 'Support agent',

  // Bookings (rides + artisan jobs) — complete, so no raw value ever renders
  requested: 'Requested', accepted: 'Accepted', driver_en_route: 'Driver on the way',
  arrived_at_pickup: 'Arrived at pickup', artisan_en_route: 'Artisan on the way',
  en_route: 'On the way', arrived: 'Arrived', in_progress: 'In progress',
  artisan_marked_complete: 'Marked complete', pending_payment: 'Awaiting payment',
  completed: 'Completed', cancelled: 'Cancelled', disputed: 'Disputed', expired: 'Expired',
  queued: 'Queued', open: 'Open', bidding: 'Taking bids', open_for_bids: 'Open for bids',
  bids_received: 'Bids received', confirmed: 'Confirmed', pending_admin: 'Awaiting admin',
  admin_assigned: 'Awaiting quote', no_drivers_available: 'No driver found',

  // Verification pipeline
  approved: 'Approved', rejected: 'Rejected', under_review: 'Under review',
  pending_coordinator: 'Awaiting coordinator',
  coordinator_approved: 'Awaiting Regional Manager', retired: 'Retired',

  // Disputes
  resolved: 'Resolved', resolving: 'Securing', refund_pending: 'Refund processing',
  refund_failed: 'Refund needs attention', resolved_refund: 'Full refund',
  resolved_partial_refund: 'Partial refund', resolved_no_refund: 'No refund',
  resolved_refunded: 'Refunded', resolved_rejected: 'Rejected',

  // Money (generic reading; the payment domain refines a few)
  paid: 'Paid', refunded: 'Refunded', partially_refunded: 'Partly refunded',
  escrowed: 'Payment held safely', partial: 'Partly paid', settled: 'Fully paid',
  outstanding: 'Amount due', escalated: 'Sent for follow-up', written_off: 'Cleared',
  reconciliation_required: 'Financial review required', mixed: 'Different statuses',
  failed: 'Failed', retrying: 'Retrying', failed_retrying: 'Failed, retrying',
  processing: 'Processing', scheduled: 'Scheduled',

  // Promo campaigns
  draft: 'Draft', pending_approval: 'Awaiting approval', paused: 'Paused',
  ended: 'Ended', budget_exhausted: 'Budget used up',
}

/** Payment-context refinements (docs/admin-frontend-spec-payment-panel.md 4.1, 5.2). */
const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Waiting',
  complete: 'Completed',
  refunded: 'Returned',
}

const METHOD_LABELS: Record<string, string> = {
  // Canonical values (packages/shared-types PaymentMethod). Anything not listed
  // falls through to a de-underscored form, so an unmapped value still reads.
  momo_mtn: 'MoMo MTN',
  momo_telecel: 'MoMo Telecel',
  momo_airteltigo: 'MoMo AirtelTigo',
  visa: 'Visa',
  mastercard: 'Mastercard',
  cash: 'Cash',
  paystack_wallet: 'Paystack Wallet',
  bank_transfer: 'Bank transfer',
  // Legacy/aliased values still present on historical rows.
  mobile_money_mtn: 'MoMo MTN',
  mobile_money_vodafone: 'MoMo Vodafone',
  mobile_money_airteltigo: 'MoMo AirtelTigo',
  card: 'Card',
  paystack_transfer: 'Paystack Transfer',
}

const TYPE_LABELS: Record<string, string> = {
  collection: 'Money received',
  payout: 'Paid to provider',
  refund: 'Money returned',
  clawback: 'Debt recovery',
  tip: 'Tip',
  remittance: 'Debt payment',
}

function deUnderscore(value: string): string {
  return value.replace(/_/g, ' ')
}

/** The one lookup every badge and status cell goes through. */
export function statusLabel(value: string | null | undefined, domain: StatusDomain = 'generic'): string {
  if (!value) return '-'
  if (domain === 'payment' && PAYMENT_STATUS_LABELS[value]) return PAYMENT_STATUS_LABELS[value]
  return GENERIC_LABELS[value] ?? deUnderscore(value)
}

export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return '-'
  return METHOD_LABELS[method] ?? deUnderscore(method)
}

export function transactionTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type
}

export function paymentStatusLabel(status: string): string {
  return statusLabel(status, 'payment')
}

/** True when the registry knows this value (used by tests to catch raw enums). */
export function hasStatusLabel(value: string, domain: StatusDomain = 'generic'): boolean {
  if (domain === 'payment' && value in PAYMENT_STATUS_LABELS) return true
  return value in GENERIC_LABELS
}
