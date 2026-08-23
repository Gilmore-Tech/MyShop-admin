'use client'

import type { ReactNode } from 'react'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/common/empty-state'

export interface LeaderboardEntry {
  id: string
  name: string
  /** Secondary line: phone, region, category. */
  detail?: ReactNode
  /** The ranked number, already formatted ("42 rides", "GHS 1,200.00"). */
  metric: string
  /** Raw value behind `metric`, used for the share-of-leader bar. */
  metricValue: number
  /** Up to three small facts shown on the right ("4.8 (12)", "3 cancelled"). */
  facts?: ReactNode[]
  rating?: number | null
  ratingCount?: number
}

/**
 * Ranked list. Rank 1 is on top; the bar shows each entry's share of the
 * leader so the drop-off to the weakest entry is visible at a glance.
 * Gold accent is limited to the top three rank chips.
 */
export function LeaderboardList({
  entries, loading = false, startRank = 1, onSelect, empty, className,
}: {
  entries: LeaderboardEntry[]
  loading?: boolean
  /** Rank of the first entry (for paginated lists). */
  startRank?: number
  onSelect?: (entry: LeaderboardEntry) => void
  empty?: ReactNode
  className?: string
}) {
  const leader = entries[0]?.metricValue ?? 0

  if (loading) {
    return (
      <div className={cn('bg-white rounded-xl shadow-sm divide-y divide-gray-50', className)}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="w-7 h-7 rounded-full bg-gray-100 animate-pulse" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-gray-100 rounded animate-pulse w-40" />
              <div className="h-2 bg-gray-100 rounded animate-pulse w-24" />
            </div>
            <div className="h-3 bg-gray-100 rounded animate-pulse w-16" />
          </div>
        ))}
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className={cn('bg-white rounded-xl shadow-sm', className)}>
        {empty ?? <EmptyState title="No activity in this period" />}
      </div>
    )
  }

  return (
    <ol className={cn('bg-white rounded-xl shadow-sm divide-y divide-gray-50', className)}>
      {entries.map((entry, i) => {
        const rank = startRank + i
        const share = leader > 0 ? Math.max(0, Math.min(100, (entry.metricValue / leader) * 100)) : 0
        const top = rank <= 3
        return (
          <li
            key={entry.id}
            className={cn('flex items-center gap-3 px-4 py-3', onSelect && 'cursor-pointer hover:bg-gray-50/70 transition-colors')}
            onClick={onSelect ? () => onSelect(entry) : undefined}
          >
            <span
              className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 tabular-nums',
                top ? 'text-white' : 'bg-gray-100 text-gray-600',
              )}
              style={top ? { backgroundColor: '#F5A623' } : undefined}
              aria-label={`Rank ${rank}`}
            >
              {rank}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-gray-800 truncate">{entry.name}</p>
                <p className="text-sm font-semibold text-gray-900 tabular-nums shrink-0">{entry.metric}</p>
              </div>
              <div className="flex items-center justify-between gap-3 mt-0.5">
                <p className="text-xs text-gray-400 truncate">{entry.detail}</p>
                <div className="flex items-center gap-3 text-[11px] text-gray-500 shrink-0">
                  {entry.rating != null && (
                    <span className="inline-flex items-center gap-0.5">
                      <Star className="h-3 w-3 text-gray-400" />
                      {entry.rating.toFixed(1)}{entry.ratingCount != null ? ` (${entry.ratingCount})` : ''}
                    </span>
                  )}
                  {entry.facts?.map((fact, j) => <span key={j}>{fact}</span>)}
                </div>
              </div>
              <div className="h-1 rounded-full bg-gray-100 mt-1.5 overflow-hidden" aria-hidden>
                <div className="h-full rounded-full bg-gray-300" style={{ width: `${share}%` }} />
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
