'use client'

import Link from 'next/link'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

export type PaymentsTab =
  | 'transactions'
  | 'revenue'
  | 'commission-ledger'
  | 'batch-payouts'
  | 'clawbacks'
  | 'webhook-failures'

const TABS: { value: PaymentsTab; href: string; label: string }[] = [
  { value: 'transactions', href: '/payments/transactions', label: 'Payment Activity' },
  { value: 'revenue', href: '/payments/revenue', label: 'Money Summary' },
  { value: 'commission-ledger', href: '/payments/commission-ledger', label: 'Commission Ledger' },
  { value: 'batch-payouts', href: '/payments/batch-payouts', label: 'Provider Payments' },
  { value: 'clawbacks', href: '/payments/clawbacks', label: 'Money Owed' },
  { value: 'webhook-failures', href: '/payments/webhook-failures', label: 'Payment Errors' },
]

/** The strip shared by every Payments page. One place to add or rename a tab. */
export function PaymentsTabs({ active }: { active: PaymentsTab }) {
  return (
    <Tabs defaultValue={active} className="mb-6">
      <TabsList className="bg-white flex-wrap h-auto">
        {TABS.map(tab => (
          <TabsTrigger key={tab.value} value={tab.value} asChild>
            <Link href={tab.href}>{tab.label}</Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
