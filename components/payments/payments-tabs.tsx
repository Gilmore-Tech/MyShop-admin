'use client'

import { PageTabs } from '@/components/common/page-tabs'

/**
 * The strip shared by every Payments page. One place to add or rename a tab.
 * (The `active` prop is kept for call-site compatibility; the active tab now
 * follows the pathname via PageTabs.)
 */
export type PaymentsTab =
  | 'transactions'
  | 'revenue'
  | 'commission-ledger'
  | 'batch-payouts'
  | 'clawbacks'
  | 'webhook-failures'

const TABS = [
  { href: '/payments/transactions', label: 'Transactions' },
  { href: '/payments/commission-ledger', label: 'Commission charges' },
  { href: '/payments/batch-payouts', label: 'Provider payments' },
  { href: '/payments/clawbacks', label: 'Money owed' },
  { href: '/payments/webhook-failures', label: 'Payment errors' },
]

export function PaymentsTabs(props: { active?: PaymentsTab } = {}) {
  void props.active // kept for call-site compatibility; PageTabs follows the pathname
  return <PageTabs items={TABS} className="mb-6" />
}
