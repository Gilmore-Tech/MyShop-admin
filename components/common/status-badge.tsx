import { cn } from '@/lib/utils'

type Variant = 'active' | 'pending' | 'suspended' | 'banned' | 'completed' | 'cancelled'
  | 'disputed' | 'refunded' | 'approved' | 'rejected' | 'under_review'
  | 'failed' | 'retrying' | 'open' | 'escalated' | 'resolved_refunded' | 'resolved_rejected'
  | 'driver' | 'artisan' | 'queued' | 'en_route' | 'arrived' | 'in_progress' | 'paid'
  | 'bids_received' | 'confirmed' | 'super_admin' | 'regional_admin' | 'ops_admin' | 'support_agent'
  | 'inactive' | 'partial' | 'escrowed' | 'processing' | 'failed_retrying' | 'written_off' | 'settled'
  | 'resolved' | 'expired' | 'client' | 'deleted' | 'scheduled'

const variantStyles: Record<string, string> = {
  active:             'bg-emerald-100 text-emerald-700',
  approved:           'bg-emerald-100 text-emerald-700',
  completed:          'bg-blue-100 text-blue-700',
  paid:               'bg-blue-100 text-blue-700',
  resolved_refunded:  'bg-blue-100 text-blue-700',
  escrowed:           'bg-blue-100 text-blue-700',
  settled:            'bg-blue-100 text-blue-700',
  pending:            'bg-yellow-100 text-yellow-700',
  under_review:       'bg-yellow-100 text-yellow-700',
  queued:             'bg-yellow-100 text-yellow-700',
  bids_received:      'bg-yellow-100 text-yellow-700',
  confirmed:          'bg-yellow-100 text-yellow-700',
  open:               'bg-yellow-100 text-yellow-700',
  processing:         'bg-yellow-100 text-yellow-700',
  scheduled:          'bg-indigo-100 text-indigo-700',
  suspended:          'bg-orange-100 text-orange-700',
  retrying:           'bg-orange-100 text-orange-700',
  partial:            'bg-orange-100 text-orange-700',
  en_route:           'bg-indigo-100 text-indigo-700',
  arrived:            'bg-purple-100 text-purple-700',
  in_progress:        'bg-purple-100 text-purple-700',
  disputed:           'bg-purple-100 text-purple-700',
  banned:             'bg-red-100 text-red-700',
  failed:             'bg-red-100 text-red-700',
  failed_retrying:    'bg-red-100 text-red-700',
  escalated:          'bg-red-100 text-red-700',
  cancelled:          'bg-gray-100 text-gray-600',
  rejected:           'bg-gray-100 text-gray-600',
  resolved_rejected:  'bg-gray-100 text-gray-600',
  refunded:           'bg-gray-100 text-gray-600',
  written_off:        'bg-gray-100 text-gray-600',
  inactive:           'bg-gray-100 text-gray-600',
  expired:            'bg-gray-100 text-gray-600',
  deleted:            'bg-gray-200 text-gray-700',
  resolved:           'bg-emerald-100 text-emerald-700',
  client:             'bg-emerald-100 text-emerald-700',
  driver:             'bg-blue-100 text-blue-700',
  artisan:            'bg-purple-100 text-purple-700',
  super_admin:        'bg-amber-100 text-amber-700',
  regional_admin:     'bg-teal-100 text-teal-700',
  ops_admin:          'bg-blue-100 text-blue-700',
  support_agent:      'bg-gray-100 text-gray-600',
}

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
}

export function StatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  if (!status) return <span className="text-gray-300">—</span>
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap',
      variantStyles[status] ?? 'bg-gray-100 text-gray-600',
      className,
    )}>
      {labels[status] ?? status}
    </span>
  )
}
