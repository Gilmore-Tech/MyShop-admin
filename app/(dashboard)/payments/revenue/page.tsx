import { redirect } from 'next/navigation'

// The Money Summary page merged into Reports -> Revenue (approved redesign,
// Aug 2026). Everything it showed — collections, tips, refunds, debts
// recovered, the payment mix — lives there now, with one vocabulary.
export default function LegacyRevenueRedirect() {
  redirect('/insights/revenue')
}
