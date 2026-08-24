import { cn } from '@/lib/utils'
import { statusLabel, type StatusDomain } from '@/lib/status-labels'

// Status badges are intentionally monochrome - the text label carries the meaning.
const BADGE_STYLE = 'bg-gray-100 text-gray-600'

/**
 * Neutral status pill. Labels come from the app-wide registry in
 * lib/status-labels.ts; pass `domain="payment"` where a value reads
 * differently in a payment context (pending -> "Waiting").
 */
export function StatusBadge({ status, domain, className }: {
  status: string | null | undefined
  domain?: StatusDomain
  className?: string
}) {
  if (!status) return <span className="text-gray-300">-</span>
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap',
      BADGE_STYLE,
      className,
    )}>
      {statusLabel(status, domain)}
    </span>
  )
}
