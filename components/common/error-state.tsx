'use client'

import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The one error shape. Always offers Retry when a reload function exists, and
 * is rendered INSTEAD of the data (tables and tiles must not show zeros or
 * "no data" copy underneath an error — an error is not an empty result).
 */
export function ErrorState({
  title, detail, onRetry, retryLabel = 'Retry', compact = false, className,
}: {
  title: string
  detail?: ReactNode
  onRetry?: () => void
  retryLabel?: string
  /** Inline banner (for placement above a form); default is a padded card body. */
  compact?: boolean
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 text-red-700',
        compact ? 'px-4 py-3' : 'px-5 py-6',
        className,
      )}
    >
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {detail && <p className="text-xs mt-0.5 text-red-600">{detail}</p>}
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  )
}
