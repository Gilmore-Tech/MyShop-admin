



'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// Preset date ranges shared across reports + transactions feed.
// Spec: docs/admin-frontend-spec-payment-panel.md §5.1, §4.1, §4.7.
//
// Returns (`from`, `to`) ISO strings on every change. `from === null` means
// "all time" — the caller should omit the filter from the API request.

export type DateRangePresetKey = '24h' | '7d' | '30d' | '90d' | 'all'

interface Preset {
  key: DateRangePresetKey
  label: string
  windowMs: number | null
}

const PRESETS: Preset[] = [
  { key: '24h', label: 'Last 24h',   windowMs: 24 * 60 * 60 * 1000 },
  { key: '7d',  label: 'Last 7d',    windowMs: 7 * 24 * 60 * 60 * 1000 },
  { key: '30d', label: 'Last 30d',   windowMs: 30 * 24 * 60 * 60 * 1000 },
  { key: '90d', label: 'Last 90d',   windowMs: 90 * 24 * 60 * 60 * 1000 },
  { key: 'all', label: 'All time',   windowMs: null },
]

export function presetToRange(key: DateRangePresetKey): { from: string | null; to: string | null } {
  const preset = PRESETS.find(p => p.key === key) ?? PRESETS[2] // 30d default
  if (preset.windowMs == null) return { from: null, to: null }
  const now = Date.now()
  return {
    from: new Date(now - preset.windowMs).toISOString(),
    to: new Date(now).toISOString(),
  }
}

interface DateRangeFilterProps {
  value: DateRangePresetKey
  onChange: (key: DateRangePresetKey) => void
  className?: string
}

export function DateRangeFilter({ value, onChange, className }: DateRangeFilterProps) {
  return (
    <Select value={value} onValueChange={v => onChange(v as DateRangePresetKey)}>
      <SelectTrigger className={`w-36 bg-white ${className ?? ''}`}>
        <SelectValue placeholder="Date range" />
      </SelectTrigger>
      <SelectContent>
        {PRESETS.map(p => (
          <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export const DEFAULT_DATE_RANGE: DateRangePresetKey = '30d'
