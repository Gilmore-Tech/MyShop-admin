'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { useRole } from '@/hooks/use-role'
import { PageGuard } from '@/components/common/page-guard'
import {
  ShieldOff, ShieldCheck, Loader2, Save, AlertCircle, XOctagon, Settings2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { PageHeader } from '@/components/common/page-header'
import { FilterBar } from '@/components/common/filter-bar'
import { DataTable, AvatarCell } from '@/components/common/data-table'
import { EmptyState } from '@/components/common/empty-state'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { formatDateTime } from '@/lib/format-date'
import {
  listProviderSuspensions, liftProviderSuspension, getAllConfig, updateConfig,
  type SuspensionListItem,
} from '@/lib/api'
import { ApiError } from '@/lib/api-client'

// ── Cancellation policy editor ────────────────────────────────────────────────
// Tunes the two platform_config keys the auto-suspension engine reads. Standardised
// on `cancellation_suspension_count` (the runtime key) - see docs/backend-requests.md §5.
const POLICY_KEYS = {
  count: 'cancellation_suspension_count',
  days:  'cancellation_rolling_period_days',
} as const

const POLICY_DEFAULTS = { count: 3, days: 30 }

function validatePositiveInt(value: string, min: number, max: number): string | null {
  const str = value.trim()
  if (!str) return 'Required'
  if (!/^\d+$/.test(str)) return 'Must be a whole number'
  const n = Number(str)
  if (n < min || n > max) return `Must be ${min}-${max}`
  return null
}

function CancellationPolicyCard({ canEdit }: { canEdit: boolean }) {
  const [count, setCount] = useState(String(POLICY_DEFAULTS.count))
  const [days, setDays] = useState(String(POLICY_DEFAULTS.days))
  const [saved, setSaved] = useState({ count: String(POLICY_DEFAULTS.count), days: String(POLICY_DEFAULTS.days) })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    getAllConfig()
      .then(items => {
        const find = (k: string) => items.find(i => i.key === k)?.value
        const c = find(POLICY_KEYS.count) ?? String(POLICY_DEFAULTS.count)
        const d = find(POLICY_KEYS.days) ?? String(POLICY_DEFAULTS.days)
        setCount(c); setDays(d); setSaved({ count: c, days: d })
      })
      .catch(() => { /* keep defaults; PATCH still works */ })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const countErr = validatePositiveInt(count, 1, 50)
  const daysErr = validatePositiveInt(days, 1, 365)
  const dirty = count !== saved.count || days !== saved.days
  const canSave = canEdit && dirty && !countErr && !daysErr && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true); setError(null); setSuccess(false)
    try {
      if (count !== saved.count) await updateConfig(POLICY_KEYS.count, String(Number(count)))
      if (days !== saved.days) await updateConfig(POLICY_KEYS.days, String(Number(days)))
      setSaved({ count, days })
      setSuccess(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save policy.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="h-4 w-4 text-gray-400" /> Cancellation policy
        </CardTitle>
        <CardDescription>
          A driver is auto-suspended after this many cancellations within the rolling window.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex flex-wrap items-start gap-6">
            <div className="space-y-1.5"><Skeleton className="h-3 w-28 bg-gray-100" /><Skeleton className="h-9 w-40 bg-gray-100" /></div>
            <div className="space-y-1.5"><Skeleton className="h-3 w-28 bg-gray-100" /><Skeleton className="h-9 w-40 bg-gray-100" /></div>
          </div>
        ) : (
          <div className="flex flex-wrap items-start gap-6">
            <div className="space-y-1.5">
              <Label htmlFor="susp-count" className="text-xs text-gray-500">Suspension count</Label>
              <Input
                id="susp-count" inputMode="numeric" className="w-40" value={count}
                disabled={!canEdit}
                onChange={e => { setCount(e.target.value); setSuccess(false) }}
              />
              {count !== saved.count && countErr && <p className="text-[11px] text-red-600">{countErr}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="susp-days" className="text-xs text-gray-500">Rolling period (days)</Label>
              <Input
                id="susp-days" inputMode="numeric" className="w-40" value={days}
                disabled={!canEdit}
                onChange={e => { setDays(e.target.value); setSuccess(false) }}
              />
              {days !== saved.days && daysErr && <p className="text-[11px] text-red-600">{daysErr}</p>}
            </div>
            {canEdit && (
              <div className="space-y-1.5">
                <Label className="text-xs text-transparent select-none">Save</Label>
                <Button onClick={handleSave} disabled={!canSave} variant="brand" className="gap-1.5">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? 'Saving...' : 'Save policy'}
                </Button>
              </div>
            )}
          </div>
        )}
        {error && <p className="mt-3 flex items-center gap-1.5 text-xs text-red-600"><AlertCircle className="h-3.5 w-3.5" />{error}</p>}
        {success && <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600"><ShieldCheck className="h-3.5 w-3.5" />Policy updated.</p>}
        {!canEdit && !loading && (
          <p className="mt-3 text-[11px] text-gray-400">You don&apos;t have permission to edit the policy.</p>
        )}
      </CardContent>
    </Card>
  )
}

// ── Lift confirmation dialog ───────────────────────────────────────────────────
function LiftDialog({ item, onClose, onLifted }: {
  item: SuspensionListItem
  onClose: () => void
  onLifted: () => void
}) {
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLift() {
    setLoading(true); setError(null)
    try {
      await liftProviderSuspension(item.providerId, item.suspensionId, note)
      onLifted()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to lift suspension. Please try again.')
      setLoading(false)
    }
  }

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title={`Lift suspension for ${item.fullName ?? 'this driver'}?`}
      description="Restores the driver to approved status and resets their rolling cancellation count, so they can go online again. An optional note is recorded in the audit log."
      confirmLabel={`Lift suspension for ${item.fullName ?? 'this driver'}`}
      onConfirm={() => { void handleLift() }}
      loading={loading}
      error={error}
    >
      <div className="space-y-1.5">
        <Label htmlFor="lift-note" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Note (optional)</Label>
        <textarea
          id="lift-note"
          className="w-full rounded-lg border border-gray-200 text-sm px-3 py-2 h-24 resize-none focus:outline-none focus:ring-2 focus:ring-gray-200"
          placeholder="Add an optional note..."
          value={note}
          disabled={loading}
          onChange={e => { setNote(e.target.value); setError(null) }}
        />
      </div>
    </ConfirmDialog>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SuspensionsPage() {
  const { can } = useRole()
  const canLift = can('lift_verification_suspension')
  const canViewConfig = can('view_config')

  const [items, setItems] = useState<SuspensionListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [providerType, setProviderType] = useState<'driver' | 'artisan'>('driver')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lifting, setLifting] = useState<SuspensionListItem | null>(null)

  const LIMIT = 50

  const fetchSuspensions = useCallback(() => {
    setLoading(true); setError('')
    listProviderSuspensions({
      providerType,
      triggerType: 'cancellation_limit',
      activeOnly: true,
      page,
      limit: LIMIT,
    })
      .then(res => {
        setItems(res.items)
        setTotal(res.total)
      })
      .catch(err => {
        setItems([])
        setError(err instanceof ApiError ? err.message : 'Failed to load suspensions.')
      })
      .finally(() => setLoading(false))
  }, [providerType, page])

  useEffect(() => { fetchSuspensions() }, [fetchSuspensions])
  useAutoRefresh(fetchSuspensions)
  useEffect(() => { setPage(1) }, [providerType])

  return (
    <PageGuard permission="view_users">
    <div>
      <PageHeader
        title="Suspensions"
        subtitle="Automatic cancellation suspensions and manual lifts"
      />

      {canViewConfig && <CancellationPolicyCard canEdit={canViewConfig} />}

      <FilterBar onRefresh={fetchSuspensions} refreshing={loading} meta={`${total} suspended`}>
        <Select value={providerType} onValueChange={v => setProviderType(v as 'driver' | 'artisan')}>
          <SelectTrigger className="h-9 w-36 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="driver">Drivers</SelectItem>
            <SelectItem value="artisan">Artisans</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      <DataTable
        columns={[
          {
            key: 'provider',
            header: providerType === 'driver' ? 'Driver' : 'Artisan',
            render: item => <AvatarCell name={item.fullName} sub={item.phone ? <span className="font-mono">{item.phone}</span> : undefined} />,
          },
          {
            key: 'cancellations',
            header: 'Cancellations (30d)',
            render: item => (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600">
                <XOctagon className="h-3.5 w-3.5" />{item.cancellationCount30d}
              </span>
            ),
          },
          {
            key: 'reason',
            header: 'Reason',
            className: 'max-w-xs truncate',
            render: item => item.reason
              ? <span className="text-sm text-gray-600" title={item.reason}>{item.reason}</span>
              : <span className="text-gray-400 italic">-</span>,
          },
          {
            key: 'type',
            header: 'Type',
            render: item => (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                {item.isAutomatic ? 'Automatic' : 'Manual'}
              </span>
            ),
          },
          {
            key: 'suspended',
            header: 'Suspended',
            render: item => <span className="text-sm text-gray-500">{formatDateTime(item.suspendedAt)}</span>,
          },
          {
            key: 'action',
            header: '',
            align: 'right',
            render: item => canLift ? (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-7 text-xs"
                onClick={e => { e.stopPropagation(); setLifting(item) }}
              >
                <ShieldCheck className="h-3.5 w-3.5" /> Lift
              </Button>
            ) : (
              <span className="text-xs text-gray-300">-</span>
            ),
          },
        ]}
        rows={items}
        rowKey={item => item.suspensionId}
        loading={loading}
        error={error || null}
        onRetry={fetchSuspensions}
        empty={<EmptyState icon={ShieldOff} title={`No ${providerType}s are currently cancellation-suspended`} />}
        pagination={{ page, pageSize: LIMIT, total, onPage: setPage }}
      />

      {lifting && (
        <LiftDialog
          item={lifting}
          onClose={() => setLifting(null)}
          onLifted={() => { setLifting(null); fetchSuspensions() }}
        />
      )}
    </div>
    </PageGuard>
  )
}
