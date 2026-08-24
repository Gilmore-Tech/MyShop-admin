'use client'

import { useEffect, useMemo } from 'react'
import { useRole } from '@/hooks/use-role'
import { SegmentedControl } from '@/components/common/segmented-control'

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
  return (
    <SegmentedControl
      ariaLabel="Service line"
      options={allowed.map(v => ({ value: v, label: VERTICAL_LABELS[v] }))}
      value={allowed.includes(value) ? value : allowed[0]}
      onChange={onChange}
      className={className}
    />
  )
}
