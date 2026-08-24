'use client'

import { useState, type ReactNode } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FilterBar } from '@/components/common/filter-bar'
import { useDateRange } from '@/components/common/date-range-filter'
import { dateRangeLabel, type DateRangePreset } from '@/lib/date-range'
import type { ReportGroupBy } from '@/lib/format-date'

export const REPORT_GROUP_BY_OPTIONS: { value: ReportGroupBy; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
]

export interface PeriodState {
  from?: string
  to?: string
  preset: DateRangePreset
  groupBy: ReportGroupBy
  setGroupBy: (g: ReportGroupBy) => void
  dateControl: ReactNode
}

/**
 * Date range + group-by state for the report pages. Wraps `useDateRange` so
 * every report shares the same presets, Ghana-calendar resolution and
 * fail-closed custom handling.
 */
export function usePeriod(
  defaultPreset: DateRangePreset = 'this_month',
  defaultGroupBy: ReportGroupBy = 'day',
  options: { includeAll?: boolean; onChange?: () => void } = {},
): PeriodState {
  const { from, to, preset, control } = useDateRange(defaultPreset, { includeAll: options.includeAll ?? false, onChange: options.onChange })
  const [groupBy, setGroupByState] = useState<ReportGroupBy>(defaultGroupBy)
  const setGroupBy = (g: ReportGroupBy) => {
    setGroupByState(g)
    options.onChange?.()
  }
  return { from, to, preset, groupBy, setGroupBy, dateControl: control }
}

/**
 * The report filter bar: period picker, optional group-by, optional extra
 * controls (vertical tabs, search), Refresh and a right-aligned caption.
 * Renders through the shared `FilterBar` so every page's bar is identical.
 */
export function PeriodControls({
  period, showGroupBy = true, onRefresh, loading = false, caption, extra, actions,
}: {
  period: PeriodState
  showGroupBy?: boolean
  onRefresh?: () => void
  loading?: boolean
  /** e.g. "31 periods - grouped by day" */
  caption?: ReactNode
  /** Rendered between the pickers and the refresh button. */
  extra?: ReactNode
  /** Rendered at the far right (export buttons etc.). */
  actions?: ReactNode
}) {
  return (
    <FilterBar
      onRefresh={onRefresh}
      refreshing={loading}
      meta={
        <>
          <span className="text-xs text-gray-500">{caption ?? dateRangeLabel(period.preset)}</span>
          {actions}
        </>
      }
    >
      {period.dateControl}
      {showGroupBy && (
        <Select value={period.groupBy} onValueChange={v => period.setGroupBy(v as ReportGroupBy)}>
          <SelectTrigger className="w-36 bg-white" aria-label="Group by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REPORT_GROUP_BY_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>By {o.label.toLowerCase()}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {extra}
    </FilterBar>
  )
}
