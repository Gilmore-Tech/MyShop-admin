'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Award,
  Clock3,
  History,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserPlus,
  XCircle,
} from 'lucide-react'
import { PageGuard } from '@/components/common/page-guard'
import { PageHeader } from '@/components/common/page-header'
import { StatCard } from '@/components/common/stat-card'
import { ErrorState } from '@/components/common/error-state'
import { EmptyState } from '@/components/common/empty-state'
import { Pager } from '@/components/common/pager'
import { ReportTable, type ReportColumn } from '@/components/common/report-table'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  enrollDriverPriority,
  getDriverPriorityHistory,
  getDriverPriorityMetrics,
  getDriverPriorityPolicy,
  listDriverPriorityDrivers,
  revokeDriverPriority,
  updateDriverPriorityPolicy,
  type DriverPriorityDriverRow,
  type DriverPriorityHistory,
  type DriverPriorityMetrics,
  type DriverPriorityPolicyResponse,
  type DriverPriorityPolicyUpdate,
  type DriverPriorityTier,
} from '@/lib/api'
import {
  DRIVER_PRIORITY_TIERS,
  driverPriorityTierLabel,
  type EffectiveDriverPriorityTier,
} from '@/lib/driver-priority-contract'
import { ApiError, userSafeAdminError } from '@/lib/api-client'
import { formatDateTime } from '@/lib/format-date'
import { useRole } from '@/hooks/use-role'

const PAGE_SIZE = 25

type PolicyDraft = Omit<DriverPriorityPolicyUpdate, 'reason' | 'expectedRevision'>

function policyDraft(response: DriverPriorityPolicyResponse): PolicyDraft {
  return {
    ...response.revision.policy,
    ...response.runtime,
  }
}

function isoAtLocalMidnight(value: string): string | null {
  if (!value) return null
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function dateInputValue(value: string | null): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}

function defaultReviewDate(): string {
  const date = new Date()
  date.setDate(date.getDate() + 28)
  return date.toISOString().slice(0, 10)
}

function defaultExpiryDate(): string {
  const date = new Date()
  date.setDate(date.getDate() + 180)
  return date.toISOString().slice(0, 10)
}

function minutesLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}

function tierClasses(tier: EffectiveDriverPriorityTier): string {
  return {
    none: 'bg-gray-100 text-gray-600',
    bronze: 'bg-amber-100 text-amber-800',
    silver: 'bg-slate-100 text-slate-700',
    gold: 'bg-yellow-100 text-yellow-800',
    platinum: 'bg-cyan-100 text-cyan-800',
    diamond: 'bg-violet-100 text-violet-800',
  }[tier]
}

function TierBadge({ tier }: { tier: EffectiveDriverPriorityTier }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${tierClasses(tier)}`}>
      {driverPriorityTierLabel(tier)}
    </span>
  )
}

function EnrollDialog({
  driver,
  open,
  onClose,
  onSaved,
}: {
  driver: DriverPriorityDriverRow | null
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [tier, setTier] = useState<DriverPriorityTier>('bronze')
  const [reviewAt, setReviewAt] = useState(defaultReviewDate)
  const [expiresAt, setExpiresAt] = useState(defaultExpiryDate)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !driver) return
    setTier(driver.manualFloorTier ?? (driver.effectiveTier === 'none' ? 'bronze' : driver.effectiveTier))
    setReviewAt(dateInputValue(driver.reviewAt) || defaultReviewDate())
    setExpiresAt(dateInputValue(driver.expiresAt) || defaultExpiryDate())
    setReason('')
    setError(null)
  }, [driver, open])

  async function save() {
    if (!driver || saving) return
    const reviewIso = isoAtLocalMidnight(reviewAt)
    const expiryIso = isoAtLocalMidnight(expiresAt)
    if (!reviewIso) {
      setError('Choose a valid review date.')
      return
    }
    if (!expiryIso) {
      setError('Choose a valid expiry date.')
      return
    }
    if (new Date(expiryIso) <= new Date(reviewIso)) {
      setError('Expiry must be later than the review date.')
      return
    }
    if (reason.trim().length < 5) {
      setError('Explain the manual enrollment in at least 5 characters.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await enrollDriverPriority(driver.driverId, {
        floorTier: tier,
        reason,
        reviewAt: reviewIso,
        expiresAt: expiryIso,
      })
      onSaved()
    } catch (caught) {
      setError(userSafeAdminError(caught, 'Could not save the manual priority floor.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!next && !saving) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Set priority floor for {driver?.name ?? 'driver'}</DialogTitle>
          <DialogDescription>
            The manual tier is a minimum. A higher automatically earned tier still wins. Verification and request blocks always override priority.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Minimum tier</Label>
            <Select value={tier} onValueChange={value => setTier(value as DriverPriorityTier)} disabled={saving}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DRIVER_PRIORITY_TIERS.map(value => (
                  <SelectItem key={value} value={value}>{driverPriorityTierLabel(value)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="priority-review-at">Review on</Label>
              <Input id="priority-review-at" type="date" value={reviewAt} onChange={event => setReviewAt(event.target.value)} disabled={saving} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="priority-expires-at">Expiry</Label>
              <Input id="priority-expires-at" type="date" value={expiresAt} onChange={event => setExpiresAt(event.target.value)} disabled={saving} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="priority-enroll-reason">Reason (audit log)</Label>
            <Textarea
              id="priority-enroll-reason"
              value={reason}
              onChange={event => setReason(event.target.value)}
              placeholder="Why this driver is being enrolled or moved to this floor"
              rows={3}
              disabled={saving}
            />
          </div>
          {error && <ErrorState compact title="That did not work" detail={error} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="brand" onClick={() => { void save() }} disabled={saving || reason.trim().length < 5} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save priority floor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function HistoryDialog({
  driver,
  open,
  onClose,
}: {
  driver: DriverPriorityDriverRow | null
  open: boolean
  onClose: () => void
}) {
  const [history, setHistory] = useState<DriverPriorityHistory | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !driver) return
    setLoading(true)
    setError(null)
    getDriverPriorityHistory(driver.driverId)
      .then(setHistory)
      .catch(caught => setError(userSafeAdminError(caught, 'Could not load priority history.')))
      .finally(() => setLoading(false))
  }, [driver, open])

  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Priority history - {driver?.name ?? 'driver'}</DialogTitle>
          <DialogDescription>Immutable automatic evaluations and manual changes.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
        ) : error ? (
          <ErrorState compact title="Could not load history" detail={error} />
        ) : history?.items.length ? (
          <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
            {history.items.map(item => (
              <div key={item.id} className="rounded-lg border border-gray-100 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{item.kind.replaceAll('_', ' ')}</p>
                    <p className="mt-1 text-xs text-gray-500">{item.reason ?? 'No reason recorded'}</p>
                  </div>
                  <p className="whitespace-nowrap text-xs text-gray-400">{item.occurredAt ? formatDateTime(item.occurredAt) : '-'}</p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  {item.automaticTier && <span>Automatic: <TierBadge tier={item.automaticTier} /></span>}
                  {item.manualFloorTier && <span>Floor: <TierBadge tier={item.manualFloorTier} /></span>}
                  {item.effectiveTier && <span>Effective: <TierBadge tier={item.effectiveTier} /></span>}
                  {item.actorName && <span>by {item.actorName}</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={History} title="No priority history yet" description="Automatic measurements and manual changes will appear here." />
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PolicyEditor({
  policy,
  canMutate,
  onSaved,
}: {
  policy: DriverPriorityPolicyResponse
  canMutate: boolean
  onSaved: (next: DriverPriorityPolicyResponse) => void
}) {
  const [draft, setDraft] = useState<PolicyDraft>(() => policyDraft(policy))
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setDraft(policyDraft(policy)), [policy])

  function updateTier(tier: DriverPriorityTier, field: 'weeklyMinutes' | 'minSevenHourDays' | 'bonus', value: number) {
    setDraft(current => field === 'bonus'
      ? { ...current, bonusesMeters: { ...current.bonusesMeters, [tier]: value } }
      : {
          ...current,
          thresholds: {
            ...current.thresholds,
            [tier]: { ...current.thresholds[tier], [field]: value },
          },
        })
  }

  const validation = useMemo(() => {
    let previousMinutes = 0
    let previousBonus = 0
    for (const tier of DRIVER_PRIORITY_TIERS) {
      const threshold = draft.thresholds[tier]
      const bonus = draft.bonusesMeters[tier]
      if (threshold.weeklyMinutes < previousMinutes) return 'Weekly thresholds must increase from Bronze through Diamond.'
      if (threshold.minSevenHourDays < 0 || threshold.minSevenHourDays > 7) return 'Qualifying days must be between 0 and 7.'
      if (bonus < previousBonus) return 'Distance advantages must increase from Bronze through Diamond.'
      if (bonus > draft.maxAdvantageMeters) return `${driverPriorityTierLabel(tier)} exceeds the global distance cap.`
      previousMinutes = threshold.weeklyMinutes
      previousBonus = bonus
    }
    if (draft.dailyCapMinutes < 420 || draft.dailyCapMinutes > 720) return 'Daily credited time must stay between 7 and 12 hours.'
    if (draft.maxAdvantageMeters > 750) return 'The approved distance cap is 750 metres.'
    if (draft.maxEtaAdvantageSeconds > 120) return 'The approved ETA cap is 120 seconds.'
    if (draft.candidateLimit < 10 || draft.candidateLimit > 100) return 'Candidate limit must be between 10 and 100.'
    if (draft.rolloutPercent < 0 || draft.rolloutPercent > 100) return 'Rollout must be between 0 and 100 percent.'
    if (draft.enabled && !draft.shadowEnabled) return 'Keep shadow measurement enabled while enforcement is active.'
    return null
  }, [draft])

  async function save(reason: string) {
    if (validation || saving) return
    setSaving(true)
    setError(null)
    try {
      const next = await updateDriverPriorityPolicy({
        ...draft,
        expectedRevision: policy.revision.revisionNumber,
        reason,
      })
      setConfirming(false)
      onSaved(next)
    } catch (caught) {
      setError(userSafeAdminError(caught, 'Could not save the complete priority policy.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" /> Priority policy</CardTitle>
        <CardDescription>
          One atomic revision controls measurement, tier thresholds, ranking advantages and rollout. The matcher still keeps the first non-empty search ring.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="overflow-x-auto rounded-lg border border-gray-100">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr><th className="p-3">Tier</th><th className="p-3">7-day hours</th><th className="p-3">Days at 7h+</th><th className="p-3">Distance advantage</th></tr>
            </thead>
            <tbody>
              {DRIVER_PRIORITY_TIERS.map(tier => (
                <tr key={tier} className="border-t border-gray-100">
                  <td className="p-3"><TierBadge tier={tier} /></td>
                  <td className="p-3"><Input type="number" min={0} step={1} value={draft.thresholds[tier].weeklyMinutes / 60} onChange={event => updateTier(tier, 'weeklyMinutes', Math.round(Number(event.target.value) * 60))} disabled={!canMutate} className="w-28" /></td>
                  <td className="p-3"><Input type="number" min={0} max={7} value={draft.thresholds[tier].minSevenHourDays} onChange={event => updateTier(tier, 'minSevenHourDays', Number(event.target.value))} disabled={!canMutate} className="w-24" /></td>
                  <td className="p-3"><div className="flex items-center gap-2"><Input type="number" min={0} max={750} value={draft.bonusesMeters[tier]} onChange={event => updateTier(tier, 'bonus', Number(event.target.value))} disabled={!canMutate} className="w-28" /><span className="text-xs text-gray-400">metres</span></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <PolicyNumber label="Daily credit cap" value={draft.dailyCapMinutes} suffix="min" min={420} max={720} disabled={!canMutate} onChange={value => setDraft(current => ({ ...current, dailyCapMinutes: value }))} />
          <PolicyNumber label="Distance hard cap" value={draft.maxAdvantageMeters} suffix="m" min={0} max={750} disabled={!canMutate} onChange={value => setDraft(current => ({ ...current, maxAdvantageMeters: value }))} />
          <PolicyNumber label="ETA hard cap" value={draft.maxEtaAdvantageSeconds} suffix="sec" min={0} max={120} disabled={!canMutate} onChange={value => setDraft(current => ({ ...current, maxEtaAdvantageSeconds: value }))} />
          <PolicyNumber label="Assumed speed" value={draft.assumedPickupSpeedKmh} suffix="km/h" min={1} max={80} disabled={!canMutate} onChange={value => setDraft(current => ({ ...current, assumedPickupSpeedKmh: value }))} />
          <PolicyNumber label="Candidate limit" value={draft.candidateLimit} suffix="drivers" min={10} max={100} disabled={!canMutate} onChange={value => setDraft(current => ({ ...current, candidateLimit: value }))} />
        </div>

        <div className="grid gap-3 rounded-lg border border-gray-100 bg-gray-50 p-4 md:grid-cols-3">
          <label className="flex items-start gap-3">
            <Checkbox checked={draft.shadowEnabled} onCheckedChange={checked => setDraft(current => ({ ...current, shadowEnabled: checked === true }))} disabled={!canMutate} />
            <span><span className="block text-sm font-semibold text-gray-800">Shadow measurement</span><span className="text-xs text-gray-500">Compare priority ordering without changing dispatch.</span></span>
          </label>
          <label className="flex items-start gap-3">
            <Checkbox checked={draft.enabled} onCheckedChange={checked => setDraft(current => ({ ...current, enabled: checked === true }))} disabled={!canMutate} />
            <span><span className="block text-sm font-semibold text-gray-800">Priority enforcement</span><span className="text-xs text-gray-500">Apply priority ordering to the rollout cohort.</span></span>
          </label>
          <PolicyNumber label="Rollout cohort" value={draft.rolloutPercent} suffix="%" min={0} max={100} disabled={!canMutate} onChange={value => setDraft(current => ({ ...current, rolloutPercent: value }))} />
        </div>

        {validation && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{validation}</p>}
        {error && <ErrorState compact title="Could not save policy" detail={error} />}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500">Revision {policy.revision.revisionNumber} | {policy.revision.createdAt ? formatDateTime(policy.revision.createdAt) : 'initial policy'}{policy.revision.createdBy ? ` | ${policy.revision.createdBy}` : ''}</p>
          {canMutate && <Button variant="brand" onClick={() => setConfirming(true)} disabled={Boolean(validation)} className="gap-2"><ShieldCheck className="h-4 w-4" /> Save complete policy</Button>}
        </div>
      </CardContent>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Publish this priority policy revision?"
        description="The complete policy is saved atomically. Enforcement still follows the runtime switch and rollout percentage shown above."
        confirmLabel="Publish priority policy"
        requireReason
        loading={saving}
        error={error}
        reasonPlaceholder="Explain why the policy or rollout is changing"
        onConfirm={reason => { void save(reason) }}
      />
    </Card>
  )
}

function PolicyNumber({ label, value, suffix, min, max, disabled, onChange }: { label: string; value: number; suffix: string; min: number; max: number; disabled: boolean; onChange: (value: number) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-gray-500">{label}</Label>
      <div className="flex items-center gap-2">
        <Input type="number" min={min} max={max} value={value} disabled={disabled} onChange={event => onChange(Number(event.target.value))} />
        <span className="whitespace-nowrap text-xs text-gray-400">{suffix}</span>
      </div>
    </div>
  )
}

export default function DriverPriorityPage() {
  const { isSuperAdmin } = useRole()
  const [policy, setPolicy] = useState<DriverPriorityPolicyResponse | null>(null)
  const [metrics, setMetrics] = useState<DriverPriorityMetrics | null>(null)
  const [drivers, setDrivers] = useState<DriverPriorityDriverRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState<DriverPriorityTier | 'none' | 'all'>('all')
  const [manualOnly, setManualOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [listLoading, setListLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [enrolling, setEnrolling] = useState<DriverPriorityDriverRow | null>(null)
  const [historyDriver, setHistoryDriver] = useState<DriverPriorityDriverRow | null>(null)
  const [revoking, setRevoking] = useState<DriverPriorityDriverRow | null>(null)
  const [revokeBusy, setRevokeBusy] = useState(false)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  const loadSummary = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextPolicy, nextMetrics] = await Promise.all([
        getDriverPriorityPolicy(),
        getDriverPriorityMetrics(),
      ])
      setPolicy(nextPolicy)
      setMetrics(nextMetrics)
      setUnavailable(false)
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) {
        setUnavailable(true)
        setError(null)
      } else {
        setError(userSafeAdminError(caught, 'Could not load the priority policy.'))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDrivers = useCallback(async () => {
    setListLoading(true)
    try {
      const response = await listDriverPriorityDrivers({
        page,
        limit: PAGE_SIZE,
        search,
        tier: tierFilter === 'all' ? undefined : tierFilter,
        manualOnly,
      })
      setDrivers(response.items)
      setTotal(response.total)
    } catch (caught) {
      if (!(caught instanceof ApiError && caught.status === 404)) {
        setError(userSafeAdminError(caught, 'Could not load priority drivers.'))
      }
    } finally {
      setListLoading(false)
    }
  }, [manualOnly, page, search, tierFilter])

  useEffect(() => { void loadSummary() }, [loadSummary])
  useEffect(() => {
    const timer = setTimeout(() => { void loadDrivers() }, 250)
    return () => clearTimeout(timer)
  }, [loadDrivers])
  useEffect(() => setPage(1), [manualOnly, search, tierFilter])

  async function revoke(reason: string) {
    if (!revoking || revokeBusy) return
    setRevokeBusy(true)
    setRevokeError(null)
    try {
      await revokeDriverPriority(revoking.driverId, reason)
      setRevoking(null)
      await Promise.all([loadDrivers(), loadSummary()])
    } catch (caught) {
      setRevokeError(userSafeAdminError(caught, 'Could not revoke the manual priority floor.'))
    } finally {
      setRevokeBusy(false)
    }
  }

  const columns: ReportColumn<DriverPriorityDriverRow>[] = [
    { key: 'driver', header: 'Driver', render: row => <div><p className="font-semibold text-gray-900">{row.name}</p><p className="text-xs text-gray-500">{row.phone || row.driverId}</p></div> },
    { key: 'effective', header: 'Effective tier', render: row => <TierBadge tier={row.effectiveTier} /> },
    { key: 'automatic', header: 'Automatic', render: row => <TierBadge tier={row.automaticTier} /> },
    { key: 'floor', header: 'Manual floor', render: row => row.manualFloorTier ? <TierBadge tier={row.manualFloorTier} /> : <span className="text-gray-300">-</span> },
    { key: 'hours', header: 'Verified 7-day time', render: row => <div><p className="font-medium text-gray-700">{minutesLabel(row.weeklyMinutes)}</p><p className="text-xs text-gray-400">{row.qualifyingDays} day{row.qualifyingDays === 1 ? '' : 's'} at 7h+</p></div> },
    { key: 'review', header: 'Manual review', responsiveClassName: 'hidden lg:table-cell', render: row => <span className="text-xs text-gray-600">{row.reviewAt ? formatDateTime(row.reviewAt) : 'Not manually enrolled'}</span> },
    {
      key: 'actions',
      header: '',
      render: row => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={event => { event.stopPropagation(); setHistoryDriver(row) }} className="gap-1"><History className="h-3.5 w-3.5" /> History</Button>
          {isSuperAdmin && <Button size="sm" variant="outline" onClick={event => { event.stopPropagation(); setEnrolling(row) }} className="gap-1"><UserPlus className="h-3.5 w-3.5" /> {row.manualFloorTier ? 'Change' : 'Enroll'}</Button>}
          {isSuperAdmin && row.manualFloorTier && <Button size="sm" variant="ghost" onClick={event => { event.stopPropagation(); setRevokeError(null); setRevoking(row) }} className="gap-1 text-red-600 hover:text-red-700"><XCircle className="h-3.5 w-3.5" /> Revoke</Button>}
        </div>
      ),
    },
  ]

  const tieredCount = metrics
    ? DRIVER_PRIORITY_TIERS.reduce((sum, tier) => sum + metrics.tiers[tier], 0)
    : 0

  return (
    <PageGuard permission="view_config">
      <div>
        <PageHeader
          title="Priority drivers"
          subtitle="Verified online-time tiers and bounded same-ring dispatch priority"
          actions={<Button variant="outline" size="sm" className="gap-2" onClick={() => { void Promise.all([loadSummary(), loadDrivers()]) }} disabled={loading || listLoading}><RefreshCw className={`h-3.5 w-3.5 ${loading || listLoading ? 'animate-spin' : ''}`} /> Refresh</Button>}
        />

        {unavailable ? (
          <EmptyState variant="unavailable" title="Priority-driver controls are not deployed yet" description="This page will become active with the matching backend release. Existing matching remains strict nearest-driver order." />
        ) : error && !policy ? (
          <ErrorState title="Could not load priority drivers" detail={error} onRetry={() => { void loadSummary() }} />
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard icon={Award} label="Priority drivers" value={tieredCount.toLocaleString()} sub="Effective Bronze through Diamond" loading={loading} />
              <StatCard icon={Clock3} label="Last measurement" value={metrics?.measurement.lastBucketAt ? formatDateTime(metrics.measurement.lastBucketAt) : 'Waiting'} sub={`${metrics?.measurement.eligibleDriversLastBucket ?? 0} eligible in latest minute`} loading={loading} />
              <StatCard icon={SlidersHorizontal} label="Shadow changes" value={`${(metrics?.dispatch.shadowChangedPercent ?? 0).toFixed(1)}%`} sub={`${metrics?.dispatch.shadowChanged ?? 0} of ${metrics?.dispatch.total ?? 0} comparisons`} loading={loading} />
              <StatCard icon={ShieldCheck} label="Runtime" value={policy?.runtime.enabled ? `${policy.runtime.rolloutPercent}% live` : policy?.runtime.shadowEnabled ? 'Shadow only' : 'Disabled'} sub={`${metrics?.dispatch.invariantViolations ?? 0} invariant violation${metrics?.dispatch.invariantViolations === 1 ? '' : 's'}`} loading={loading} />
            </div>

            {policy && <PolicyEditor policy={policy} canMutate={isSuperAdmin} onSaved={next => { setPolicy(next); void loadSummary() }} />}

            <Card>
              <CardHeader>
                <CardTitle>Driver tiers</CardTitle>
                <CardDescription>Search every driver, inspect verified time and apply a reviewed manual floor for the initial seed list.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                    <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, phone or driver UUID" className="w-72 pl-8" />
                  </div>
                  <Select value={tierFilter} onValueChange={value => setTierFilter(value as DriverPriorityTier | 'none' | 'all')}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All tiers</SelectItem>
                      <SelectItem value="none">Standard</SelectItem>
                      {DRIVER_PRIORITY_TIERS.map(tier => <SelectItem key={tier} value={tier}>{driverPriorityTierLabel(tier)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-2 text-sm text-gray-600"><Checkbox checked={manualOnly} onCheckedChange={checked => setManualOnly(checked === true)} /> Manual floors only</label>
                  {!isSuperAdmin && <span className="ml-auto rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">Only the Super Administrator can change priority.</span>}
                </div>
                <ReportTable
                  columns={columns}
                  rows={drivers}
                  rowKey={row => row.driverId}
                  loading={listLoading}
                  minWidth={980}
                  empty={<EmptyState icon={Award} title="No drivers match this filter" description="Clear the filters or wait for the first server measurement." />}
                  caption="Priority never overrides verification, document, vehicle, GPS freshness, active-work or request-block checks."
                />
                {total > PAGE_SIZE && <Pager page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />}
              </CardContent>
            </Card>
          </div>
        )}

        <EnrollDialog driver={enrolling} open={Boolean(enrolling)} onClose={() => setEnrolling(null)} onSaved={() => { setEnrolling(null); void Promise.all([loadDrivers(), loadSummary()]) }} />
        <HistoryDialog driver={historyDriver} open={Boolean(historyDriver)} onClose={() => setHistoryDriver(null)} />
        <ConfirmDialog
          open={Boolean(revoking)}
          onClose={() => setRevoking(null)}
          title={`Revoke the manual priority floor for ${revoking?.name ?? 'this driver'}?`}
          description="Their automatically earned tier remains. This does not change account, verification or request-block status."
          confirmLabel="Revoke manual floor"
          destructive
          requireReason
          loading={revokeBusy}
          error={revokeError}
          reasonPlaceholder="Explain why the manual priority floor is being removed"
          onConfirm={reason => { void revoke(reason) }}
        />
      </div>
    </PageGuard>
  )
}
