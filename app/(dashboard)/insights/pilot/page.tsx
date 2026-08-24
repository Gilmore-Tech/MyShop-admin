'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Download, Target } from 'lucide-react'
import { PageGuard } from '@/components/common/page-guard'
import { PageHeader } from '@/components/common/page-header'
import { StatCard } from '@/components/common/stat-card'
import { PageSkeleton } from '@/components/common/load-state'
import { ErrorState } from '@/components/common/error-state'
import { EmptyState } from '@/components/common/empty-state'
import { Button } from '@/components/ui/button'
import { getPilotReport, type PilotMetric } from '@/lib/api'
import { userSafeAdminError } from '@/lib/api-client'
import { exportPilotCsv } from '@/lib/report-export'

/**
 * The 10 pilot success targets for the Ashanti Region open beta - all-time
 * figures against fixed targets (carried over from the retired Reports page).
 */
export default function PilotTargetsPage() {
  const [metrics, setMetrics] = useState<PilotMetric[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    getPilotReport()
      .then(setMetrics)
      .catch(err => {
        setMetrics(null)
        setError(userSafeAdminError(err, 'Failed to load the pilot targets.'))
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const met = (metrics ?? []).filter(m => m.target > 0 && m.actual >= m.target).length

  return (
    <PageGuard permission="view_pilot_report">
      <div>
        <PageHeader
          title="Pilot targets"
          subtitle="The 10 pilot success targets - Ashanti Region open beta, all-time progress"
          actions={
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => metrics && exportPilotCsv(metrics)} disabled={!metrics || metrics.length === 0}>
              <Download className="h-3.5 w-3.5" /> Download CSV
            </Button>
          }
        />

        {error ? (
          <ErrorState title="Could not load the pilot targets" detail={error} onRetry={load} />
        ) : loading ? (
          <PageSkeleton variant="cards" />
        ) : !metrics || metrics.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm">
            <EmptyState variant="unavailable" title="Pilot targets are not available yet" description="The server did not return any pilot metrics." />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6 max-w-2xl">
              <StatCard icon={Target} label="Targets met" value={`${met} of ${metrics.length}`} sub="All-time, against fixed pilot goals" compact />
              <StatCard icon={CheckCircle2} label="Overall progress" value={`${Math.round((met / metrics.length) * 100)}%`} sub="Targets fully reached" compact />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {metrics.map(m => {
                const progress = m.target > 0 ? Math.min((m.actual / m.target) * 100, 100) : 0
                const reached = m.target > 0 && m.actual >= m.target
                return (
                  <div key={m.key} className="bg-white rounded-xl shadow-sm p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-xs text-gray-600 leading-tight">{m.label}</p>
                      {reached && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" aria-label="Target reached" />}
                    </div>
                    <div className="flex items-baseline gap-1 mb-1.5">
                      <span className={`text-base font-bold tabular-nums ${reached ? 'text-emerald-600' : 'text-gray-900'}`}>
                        {m.actual.toLocaleString()}{m.unit}
                      </span>
                      <span className="text-xs text-gray-400">/ {m.target.toLocaleString()}{m.unit}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${reached ? 'bg-emerald-500' : 'bg-primary'}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 text-right">{progress.toFixed(0)}% of target</p>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </PageGuard>
  )
}
