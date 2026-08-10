'use client'

import { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useGhanaCalendarNow } from '@/hooks/use-ghana-calendar-now'
import {
  ghanaDateKey,
  defaultCustomDateRange,
  resolveInclusiveDateRange,
  type DateRangePreset,
} from '@/lib/date-range'

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
        <SelectTrigger className="w-40 bg-white"><SelectValue placeholder="Date range" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="today">Today (GMT)</SelectItem>
          <SelectItem value="week">Last 7 days</SelectItem>
          <SelectItem value="month">Last 30 days</SelectItem>
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
  options: { includeAll?: boolean; onChange?: () => void } = {},
) {
  const [preset, setPresetState] = useState<DateRangePreset>(defaultPreset)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const calendarNow = useGhanaCalendarNow()

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
