import { redirect } from 'next/navigation'

// Reports & Exports merged into the Reports group (approved redesign, Aug
// 2026): every surviving panel has one home and its own Download CSV button —
// Revenue, Booking outcomes, Leaderboards and Pilot targets.
export default function LegacyReportsRedirect() {
  redirect('/insights/trips')
}
