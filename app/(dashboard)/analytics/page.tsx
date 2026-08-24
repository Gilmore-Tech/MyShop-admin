import { redirect } from 'next/navigation'

// Analytics merged into the Reports group (approved redesign, Aug 2026):
// outcomes + dispute rate live on Booking outcomes, revenue on Revenue,
// provider panels and busiest services on Leaderboards.
export default function LegacyAnalyticsRedirect() {
  redirect('/insights/trips')
}
