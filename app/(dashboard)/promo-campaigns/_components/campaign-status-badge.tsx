import { StatusBadge } from '@/components/common/status-badge'
import type { PromoCampaignStatus } from '@/lib/api'

// Campaign lifecycle badges are deliberately tinted (unlike the monochrome
// default) because the colour carries the approval state at a glance:
// warning while awaiting approval, success once live, orange when the budget
// ran dry. The base StatusBadge still supplies the label + shape.
const STATUS_CLASS: Record<PromoCampaignStatus, string> = {
  draft: '',
  pending_approval: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-gray-100 text-gray-500',
  ended: 'bg-gray-50 text-gray-400',
  budget_exhausted: 'bg-orange-100 text-orange-700',
}

export function CampaignStatusBadge({ status }: { status: PromoCampaignStatus }) {
  return <StatusBadge status={status} className={STATUS_CLASS[status]} />
}
