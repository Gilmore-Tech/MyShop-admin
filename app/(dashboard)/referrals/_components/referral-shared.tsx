'use client'

import { cn } from '@/lib/utils'

// ── Status badge ───────────────────────────────────────────────────────────────
// Awarded = green (verified), Pending = amber (warning). The text label carries the
// meaning too, so colour is never the sole signal (WCAG AA, CLAUDE.md §5.6).

export function ReferralStatusBadge({ awarded, className }: { awarded: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap',
        awarded ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
        className,
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', awarded ? 'bg-emerald-500' : 'bg-amber-500')} aria-hidden />
      {awarded ? 'Awarded' : 'Pending'}
    </span>
  )
}

// ── Role chips ─────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  client: 'Client',
  driver: 'Driver',
  artisan: 'Artisan',
}

const ROLE_CHIP_STYLE: Record<string, string> = {
  client: 'bg-blue-50 text-blue-700',
  driver: 'bg-indigo-50 text-indigo-700',
  artisan: 'bg-purple-50 text-purple-700',
}

export function RoleChips({ roles, className }: { roles: string[]; className?: string }) {
  if (!roles || roles.length === 0) {
    return <span className="text-[11px] text-gray-300">—</span>
  }
  return (
    <span className={cn('inline-flex flex-wrap gap-1', className)}>
      {roles.map(role => (
        <span
          key={role}
          className={cn(
            'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide',
            ROLE_CHIP_STYLE[role] ?? 'bg-gray-100 text-gray-600',
          )}
        >
          {ROLE_LABELS[role] ?? role}
        </span>
      ))}
    </span>
  )
}

// ── Points helper ──────────────────────────────────────────────────────────────

export function formatPoints(points: number | null | undefined): string {
  if (points == null) return '—'
  return `${points.toLocaleString('en-GH')} pt${points === 1 ? '' : 's'}`
}
