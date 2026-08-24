'use client'

import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

/**
 * In-page data toggle (gray pill group). Switches what ONE page shows -
 * for navigation between sibling pages use `PageTabs`. These two are the only
 * tab patterns in the app.
 */
export function SegmentedControl<T extends string>({
  options, value, onChange, ariaLabel, className,
}: {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
}) {
  if (options.length === 1) {
    return (
      <span className={cn('inline-flex items-center h-9 px-3 rounded-lg bg-gray-100 text-xs font-semibold text-gray-600', className)}>
        {options[0].label}
      </span>
    )
  }
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn('inline-flex items-center h-9 rounded-lg bg-gray-100 p-[3px] gap-0.5', className)}>
      {options.map(option => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-full px-3 rounded-md text-xs font-semibold transition-colors',
              active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
