'use client'

import { useState, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
 * every Insights page shares the same presets, Ghana-calendar resolution and
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
 * The filter bar itself: period picker, optional group-by, optional extra
 * controls (vertical tabs, search), a Refresh button and a right-aligned caption.
 */
export function PeriodControls({
  period, showGroupBy = true, onRefresh, loading = false, caption, extra, actions,
}: {
  period: PeriodState
  showGroupBy?: boolean
  onRefresh?: () => void
  loading?: boolean
  /** e.g. "31 periods · grouped by day" */
  caption?: ReactNode
  /** Rendered between the pickers and the refresh button. */
  extra?: ReactNode
  /** Rendered at the far right (export buttons etc.). */
  actions?: ReactNode
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex items-end gap-3 flex-wrap">
      <div>
        <Label className="text-xs text-gray-500 mb-1 block">Reporting period (GMT)</Label>
        {period.dateControl}
      </div>
      {showGroupBy && (
        <div>
          <Label className="text-xs text-gray-500 mb-1 block">Group by</Label>
          <Select value={period.groupBy} onValueChange={v => period.setGroupBy(v as ReportGroupBy)}>
            <SelectTrigger className="w-28 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {REPORT_GROUP_BY_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {extra}
      {onRefresh && (
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading} className="gap-1.5 h-9">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      )}
      <div className="ml-auto flex items-center gap-3">
        <span className="text-xs text-gray-500">
          {caption ?? dateRangeLabel(period.preset)}
        </span>
        {actions}
      </div>
    </div>
  )
}
