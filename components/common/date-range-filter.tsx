'use client'

import { useEffect, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useGhanaCalendarNow } from '@/hooks/use-ghana-calendar-now'
import {
  ghanaDateKey,
  defaultCustomDateRange,
  isValidDateKey,
  resolveInclusiveDateRange,
  type DateRangePreset,
} from '@/lib/date-range'

/**
 * Reads `?from=YYYY-MM-DD&to=YYYY-MM-DD` once on mount (client only, so no
 * Suspense boundary is needed). Invalid or inverted keys are ignored so a
 * crafted link can never widen a filter.
 */
export function readLinkedDateRange(search: string): { from: string; to: string } | null {
  const params = new URLSearchParams(search)
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? from
  if (!isValidDateKey(from) || !isValidDateKey(to) || from > to) return null
  return { from, to }
}

/** One-shot read of a single query param on mount, validated against `allowed`. */
export function useLinkedParam(name: string, allowed: readonly string[], apply: (value: string) => void) {
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get(name)
    if (value && allowed.includes(value)) apply(value)
    // Mount-only by design: the URL is read once, then local state owns the filter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

export type DateRangePresetKey = DateRangePreset

interface DateRangeFilterProps {
  value: DateRangePreset
  onChange: (value: DateRangePreset) => void
  customFrom: string
  customTo: string
  onCustomFromChange: (value: string) => void
  onCustomToChange: (value: string) => void
  className?: string
  includeAll?: boolean
}

export function DateRangeFilter({
  value,
  onChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  className,
  includeAll = true,
}: DateRangeFilterProps) {
  const today = ghanaDateKey()
  return (
    <div className={`flex items-center gap-2 flex-wrap ${className ?? ''}`}>
      <Select value={value} onValueChange={next => onChange(next as DateRangePreset)}>
        <SelectTrigger className="w-44 bg-white"><SelectValue placeholder="Date range" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="today">Today (GMT)</SelectItem>
          <SelectItem value="this_week">This week</SelectItem>
          <SelectItem value="this_month">This month</SelectItem>
          <SelectItem value="this_year">This year</SelectItem>
          <SelectItem value="week">Last 7 days</SelectItem>
          <SelectItem value="month">Last 30 days</SelectItem>
          <SelectItem value="year">Last 12 months</SelectItem>
          <SelectItem value="custom">Custom range</SelectItem>
          {includeAll && <SelectItem value="all">All time</SelectItem>}
        </SelectContent>
      </Select>
      {value === 'custom' && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={customFrom}
            max={customTo || today}
            onChange={event => onCustomFromChange(event.target.value)}
            aria-label="From date"
            className="h-9 text-sm bg-white border border-gray-200 rounded-md px-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200"
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            type="date"
            value={customTo}
            min={customFrom || undefined}
            max={today}
            onChange={event => onCustomToChange(event.target.value)}
            aria-label="To date"
            className="h-9 text-sm bg-white border border-gray-200 rounded-md px-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200"
          />
        </div>
      )}
    </div>
  )
}

export function useDateRange(
  defaultPreset: DateRangePreset = 'all',
  options: {
    includeAll?: boolean
    onChange?: () => void
    /** Honour `?from=&to=` deep links (e.g. from the Commission Ledger or Trip Outcomes). */
    readUrl?: boolean
  } = {},
) {
  const [preset, setPresetState] = useState<DateRangePreset>(defaultPreset)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const calendarNow = useGhanaCalendarNow()

  const readUrl = options.readUrl ?? false
  useEffect(() => {
    if (!readUrl) return
    const linked = readLinkedDateRange(window.location.search)
    if (!linked) return
    setCustomFrom(linked.from)
    setCustomTo(linked.to)
    setPresetState('custom')
    // Mount-only by design; see readLinkedDateRange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { from, to } = resolveInclusiveDateRange(preset, customFrom, customTo, calendarNow)
  const setPreset = (next: DateRangePreset) => {
    if (next === 'custom') {
      const defaults = defaultCustomDateRange(customFrom, customTo, calendarNow)
      setCustomFrom(defaults.from)
      setCustomTo(defaults.to)
    }
    setPresetState(next)
    options.onChange?.()
  }
  const changeCustomFrom = (value: string) => {
    setCustomFrom(value)
    options.onChange?.()
  }
  const changeCustomTo = (value: string) => {
    setCustomTo(value)
    options.onChange?.()
  }
  const control = (
    <DateRangeFilter
      value={preset}
      onChange={setPreset}
      customFrom={customFrom}
      customTo={customTo}
      onCustomFromChange={changeCustomFrom}
      onCustomToChange={changeCustomTo}
      includeAll={options.includeAll}
    />
  )
  return {
    from,
    to,
    preset,
    setPreset,
    customFrom,
    customTo,
    setCustomFrom: changeCustomFrom,
    setCustomTo: changeCustomTo,
    control,
  }
}

export const DEFAULT_DATE_RANGE: DateRangePreset = 'month'
