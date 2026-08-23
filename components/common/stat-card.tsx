'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Shared KPI tile. Monochrome by default (icon in a neutral circle); `tone`
 * only colours the value so a figure can read as good/bad without the whole
 * card turning into a traffic light. Always pair tone with wording in `sub`
 * because colour must never be the only signal.
 */
export type StatTone = 'neutral' | 'positive' | 'negative' | 'muted'

export interface StatCardProps {
  label: string
  value: ReactNode
  /** Supporting line under the label (period, ratio, definition). */
  sub?: ReactNode
  icon?: React.ElementType
  tone?: StatTone
  loading?: boolean
  /** When set the whole tile links somewhere and shows a chevron. */
  href?: string
  /** Tighter padding + smaller value for dense strips. */
  compact?: boolean
  className?: string
}

const TONE: Record<StatTone, string> = {
  neutral: 'text-gray-900',
  positive: 'text-emerald-600',
  negative: 'text-red-600',
  muted: 'text-gray-500',
}

export function StatCard({
  label, value, sub, icon: Icon, tone = 'neutral', loading = false, href, compact = false, className,
}: StatCardProps) {
  const body = (
    <>
      {Icon && (
        <div className={cn('rounded-lg bg-gray-100 flex items-center justify-center shrink-0', compact ? 'w-8 h-8' : 'w-9 h-9')}>
          <Icon className={cn('text-gray-600', compact ? 'h-4 w-4' : 'h-[18px] w-[18px]')} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        {loading ? (
          <div className={cn('bg-gray-100 rounded animate-pulse', compact ? 'h-5 w-16' : 'h-7 w-24')} />
        ) : (
          <p className={cn('font-bold leading-tight tabular-nums truncate', compact ? 'text-lg' : 'text-2xl', TONE[tone])}>{value}</p>
        )}
        <p className="text-xs text-gray-400 font-medium mt-0.5 truncate">{label}</p>
        {sub && <p className="text-[11px] text-gray-500 mt-1 truncate">{sub}</p>}
      </div>
      {href && <ChevronRight className="h-4 w-4 text-gray-300 shrink-0 group-hover:translate-x-0.5 transition-transform" />}
    </>
  )
  const classes = cn(
    'bg-white rounded-xl shadow-sm flex items-start gap-3',
    compact ? 'p-3' : 'p-4',
    href && 'group hover:bg-gray-50 transition-colors',
    className,
  )
  return href ? <Link href={href} className={classes}>{body}</Link> : <div className={classes}>{body}</div>
}

/** Uppercase section label used above tile rows (matches the dashboard). */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cn('text-[11px] font-semibold text-gray-400 uppercase tracking-widest', className)}>{children}</h2>
  )
}
