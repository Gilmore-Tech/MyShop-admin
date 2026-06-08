'use client'

import { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export type DateRangePreset = 'all' | 'week' | 'month' | 'custom'

const DAY_MS = 86_400_000

/**
 * Date-range filter shared by the listing tables. Returns resolved `from`/`to`
 * (yyyy-mm-dd, server-side query params) plus the control JSX to render.
 * The returned strings are stable within a day, so they're safe as effect deps.
 */
export function useDateRange() {
  const [preset, setPreset] = useState<DateRangePreset>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  let from: string | undefined
  let to: string | undefined
  if (preset === 'week' || preset === 'month') {
    const d = new Date(Date.now() - (preset === 'week' ? 7 : 30) * DAY_MS)
    from = d.toISOString().split('T')[0]
  } else if (preset === 'custom') {
    from = customFrom || undefined
    to = customTo || undefined
  }

  const control = (
    <div className="flex items-center gap-2 flex-wrap">
      <Select value={preset} onValueChange={v => setPreset(v as DateRangePreset)}>
        <SelectTrigger className="w-36 bg-white"><SelectValue placeholder="Date range" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All time</SelectItem>
          <SelectItem value="week">Last 7 days</SelectItem>
          <SelectItem value="month">Last 30 days</SelectItem>
          <SelectItem value="custom">Custom range</SelectItem>
        </SelectContent>
      </Select>
      {preset === 'custom' && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={customFrom}
            max={customTo || undefined}
            onChange={e => setCustomFrom(e.target.value)}
            className="h-9 text-sm bg-white border border-gray-200 rounded-md px-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200"
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            type="date"
            value={customTo}
            min={customFrom || undefined}
            onChange={e => setCustomTo(e.target.value)}
            className="h-9 text-sm bg-white border border-gray-200 rounded-md px-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200"
          />
        </div>
      )}
    </div>
  )

  return { from, to, preset, control }
}

/** Page-size dropdown ("10 / page", …). */
export function PageSizeSelect({
  value, onChange, options = [10, 15, 20, 25, 50],
}: {
  value: number; onChange: (n: number) => void; options?: number[]
}) {
  return (
    <Select value={String(value)} onValueChange={v => onChange(Number(v))}>
      <SelectTrigger className="w-[120px] bg-white"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map(o => (
          <SelectItem key={o} value={String(o)}>{o} / page</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
