'use client'

import { AlertTriangle } from 'lucide-react'
import { PageGuard } from '@/components/common/page-guard'
import { PageHeader } from '@/components/common/page-header'

/**
 * Release containment: the deployed referral ledger is keyed to the private
 * phone-auth User and aggregates client/driver/artisan activity. That violates
 * the approved role-account isolation contract, so the admin must not read or
 * mutate it until the backend exposes exact role + roleAccountId ownership.
 */
export default function ReferralsPage() {
  return (
    <PageGuard permission="view_referrals">
      <div>
        <PageHeader
          title="Referrals"
          subtitle="Temporarily unavailable while role-account ownership is migrated"
        />
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Referral administration is quarantined for this release.</p>
              <p className="mt-1 text-sm leading-relaxed">
                The legacy ledger combines roles under one phone identity. No referral balances,
                user drilldowns, awards, or void actions are exposed here until every record carries
                an exact client, driver, or artisan account ID.
              </p>
            </div>
          </div>
        </div>
      </div>
    </PageGuard>
  )
}
