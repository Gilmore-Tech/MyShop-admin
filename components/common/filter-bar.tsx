'use client'

import type { ReactNode } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * THE filter bar: one white card above every list/report. Controls sit on the
 * left in reading order (search, then selects, then dates); the right side
 * carries the caption (date basis, counts) and Refresh. Standard control
 * heights are h-9; enum selects w-36, longer ones w-44, search w-64.
 */
export function FilterBar({ children, meta, onRefresh, refreshing = false, className }: {
  children?: ReactNode
  /** Right-aligned caption area (date-basis sentence, result counts, page size). */
  meta?: ReactNode
  onRefresh?: () => void
  refreshing?: boolean
  className?: string
}) {
  return (
    <div className={cn('bg-white rounded-xl shadow-sm p-3 mb-6 flex items-center gap-2.5 flex-wrap', className)}>
      {children}
      <div className="ml-auto flex items-center gap-2.5 flex-wrap">
        {typeof meta === 'string' ? <span className="text-xs text-gray-500">{meta}</span> : meta}
        {onRefresh && (
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing} className="gap-1.5">
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            Refresh
          </Button>
        )}
      </div>
    </div>
  )
}

/** Standard search input for the filter bar (w-64, icon inside). */
export function FilterSearch({ value, onChange, placeholder = 'Search', className, ariaLabel }: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  ariaLabel?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" aria-hidden />
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="h-9 w-64 pl-8 bg-white"
      />
    </div>
  )
}
