'use client'

import { useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useRole } from '@/hooks/use-role'

/** Which marketplace vertical a report covers. */
export type Vertical = 'all' | 'rides' | 'artisans'

export const VERTICAL_LABELS: Record<Vertical, string> = {
  all: 'All',
  rides: 'Rides',
  artisans: 'Artisan Services',
}

/**
 * Returns the verticals this admin may see. Coordinators are scoped to one
 * vertical server-side, so the tab strip never offers the other one (or "All").
 */
export function useAllowedVerticals(): Vertical[] {
  const { category } = useRole()
  return useMemo<Vertical[]>(() => {
    if (category === 'rides') return ['rides']
    if (category === 'artisan') return ['artisans']
    return ['all', 'rides', 'artisans']
  }, [category])
}

/**
 * Segmented control for All / Rides / Artisan Services. Snaps `value` to the
 * first allowed option when the admin's scope excludes the current choice.
 */
export function VerticalTabs({ value, onChange, className }: {
  value: Vertical
  onChange: (v: Vertical) => void
  className?: string
}) {
  const allowed = useAllowedVerticals()
  useEffect(() => {
    if (!allowed.includes(value)) onChange(allowed[0])
  }, [allowed, value, onChange])
  if (allowed.length === 1) {
    return (
      <span className={cn('inline-flex items-center h-9 px-3 rounded-lg bg-gray-100 text-xs font-semibold text-gray-600', className)}>
        {VERTICAL_LABELS[allowed[0]]}
      </span>
    )
  }
  return (
    <div role="tablist" aria-label="Vertical" className={cn('inline-flex items-center h-9 rounded-lg bg-gray-100 p-[3px] gap-0.5', className)}>
      {allowed.map(v => {
        const active = v === value
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={cn(
              'h-full px-3 rounded-md text-xs font-semibold transition-colors',
              active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800',
            )}
          >
            {VERTICAL_LABELS[v]}
          </button>
        )
      })}
    </div>
  )
}
