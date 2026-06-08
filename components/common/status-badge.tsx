import { cn } from '@/lib/utils'

// Status badges are intentionally monochrome - the text label carries the meaning.
const BADGE_STYLE = 'bg-gray-100 text-gray-600'

const labels: Record<string, string> = {
  active: 'Active', pending: 'Pending', suspended: 'Suspended', banned: 'Banned',
  completed: 'Completed', cancelled: 'Cancelled', disputed: 'Disputed', refunded: 'Refunded',
  approved: 'Approved', rejected: 'Rejected', under_review: 'Under Review',
  failed: 'Failed', retrying: 'Retrying', open: 'Open', escalated: 'Escalated',
  resolved_refunded: 'Refunded', resolved_rejected: 'Rejected', paid: 'Paid',
  driver: 'Driver', artisan: 'Artisan', queued: 'Queued', en_route: 'En Route',
  arrived: 'Arrived', in_progress: 'In Progress', bids_received: 'Bids Received',
  confirmed: 'Confirmed', super_admin: 'Super Admin', regional_admin: 'Regional Admin',
  ops_admin: 'Ops Admin', support_agent: 'Support Agent', inactive: 'Inactive', partial: 'Partial',
  escrowed: 'Escrowed', processing: 'Processing', failed_retrying: 'Failed (retrying)',
  written_off: 'Written off', settled: 'Settled',
  resolved: 'Resolved', expired: 'Expired', client: 'Client', deleted: 'Deleted', scheduled: 'Scheduled',
  pending_admin: 'Pending Admin', open_for_bids: 'Open for Bids',
}

export function StatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  if (!status) return <span className="text-gray-300">-</span>
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap',
      BADGE_STYLE,
      className,
    )}>
      {labels[status] ?? status}
    </span>
  )
}
