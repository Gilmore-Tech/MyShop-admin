'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  Clock3,
  Eye,
  Loader2,
  Save,
  Settings2,
  ShieldCheck,
  ShieldOff,
  XOctagon,
} from 'lucide-react'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { useRole } from '@/hooks/use-role'
import { PageGuard } from '@/components/common/page-guard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/common/page-header'
import { FilterBar } from '@/components/common/filter-bar'
import { DataTable, AvatarCell } from '@/components/common/data-table'
import { EmptyState } from '@/components/common/empty-state'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { formatDateTime } from '@/lib/format-date'
import {
  getAllConfig,
  liftProviderCancellationRestriction,
  liftProviderSuspension,
  listProviderCancellationRestrictions,
  listProviderSuspensions,
  updateConfig,
  type ProviderCancellationRestrictionListItem,
  type ProviderCancellationRestrictionType,
  type SuspensionListItem,
} from '@/lib/api'
import { ApiError } from '@/lib/api-client'

const LEGACY_POLICY_KEYS = {
  count: 'cancellation_suspension_count',
  days: 'cancellation_rolling_period_days',
} as const

const LEGACY_POLICY_DEFAULTS = { count: 3, days: 30 }

function validatePositiveInt(value: string, min: number, max: number): string | null {
  const trimmed = value.trim()
  if (!trimmed) return 'Required'
  if (!/^\d+$/.test(trimmed)) return 'Must be a whole number'
  const parsed = Number(trimmed)
  if (parsed < min || parsed > max) return `Must be ${min}-${max}`
  return null
}

function CancellationPolicyCard({ canEdit }: { canEdit: boolean }) {
  const [count, setCount] = useState(String(LEGACY_POLICY_DEFAULTS.count))
  const [days, setDays] = useState(String(LEGACY_POLICY_DEFAULTS.days))
  const [saved, setSaved] = useState({
    count: String(LEGACY_POLICY_DEFAULTS.count),
    days: String(LEGACY_POLICY_DEFAULTS.days),
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    getAllConfig()
      .then(items => {
        const find = (key: string) => items.find(item => item.key === key)?.value
        const nextCount = find(LEGACY_POLICY_KEYS.count) ?? String(LEGACY_POLICY_DEFAULTS.count)
        const nextDays = find(LEGACY_POLICY_KEYS.days) ?? String(LEGACY_POLICY_DEFAULTS.days)
        setCount(nextCount)
        setDays(nextDays)
        setSaved({ count: nextCount, days: nextDays })
      })
      .catch(() => { /* Keep the prior safe defaults. */ })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const countError = validatePositiveInt(count, 1, 50)
  const daysError = validatePositiveInt(days, 1, 365)
  const dirty = count !== saved.count || days !== saved.days
  const canSave = canEdit && dirty && !countError && !daysError && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      if (count !== saved.count) {
        await updateConfig(LEGACY_POLICY_KEYS.count, String(Number(count)))
      }
      if (days !== saved.days) {
        await updateConfig(LEGACY_POLICY_KEYS.days, String(Number(days)))
      }
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
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-28 bg-gray-100" />
              <Skeleton className="h-9 w-40 bg-gray-100" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-28 bg-gray-100" />
              <Skeleton className="h-9 w-40 bg-gray-100" />
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-start gap-6">
            <div className="space-y-1.5">
              <Label htmlFor="susp-count" className="text-xs text-gray-500">Suspension count</Label>
              <Input
                id="susp-count"
                inputMode="numeric"
                className="w-40"
                value={count}
                disabled={!canEdit}
                onChange={event => { setCount(event.target.value); setSuccess(false) }}
              />
              {count !== saved.count && countError && (
                <p className="text-[11px] text-red-600">{countError}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="susp-days" className="text-xs text-gray-500">Rolling period (days)</Label>
              <Input
                id="susp-days"
                inputMode="numeric"
                className="w-40"
                value={days}
                disabled={!canEdit}
                onChange={event => { setDays(event.target.value); setSuccess(false) }}
              />
              {days !== saved.days && daysError && (
                <p className="text-[11px] text-red-600">{daysError}</p>
              )}
            </div>
            {canEdit && (
              <div className="space-y-1.5">
                <Label className="select-none text-xs text-transparent">Save</Label>
                <Button onClick={handleSave} disabled={!canSave} variant="brand" className="gap-1.5">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? 'Saving...' : 'Save policy'}
                </Button>
              </div>
            )}
          </div>
        )}
        {error && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle className="h-3.5 w-3.5" />{error}
          </p>
        )}
        {success && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600">
            <ShieldCheck className="h-3.5 w-3.5" />Policy updated.
          </p>
        )}
        {!canEdit && !loading && (
          <p className="mt-3 text-[11px] text-gray-400">
            You don&apos;t have permission to edit the policy.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function LegacyLiftDialog({
  item,
  onClose,
  onLifted,
}: {
  item: SuspensionListItem
  onClose: () => void
  onLifted: () => void
}) {
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLift() {
    setLoading(true)
    setError(null)
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
      description="Restores the provider to approved status and resets their rolling cancellation count, so they can go online again. An optional note is recorded in the audit log."
      confirmLabel={`Lift suspension for ${item.fullName ?? 'this provider'}`}
      onConfirm={() => { void handleLift() }}
      loading={loading}
      error={error}
    >
      <div className="space-y-1.5">
        <Label htmlFor="lift-note" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Note (optional)
        </Label>
        <textarea
          id="lift-note"
          className="h-24 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
          placeholder="Add an optional note..."
          value={note}
          disabled={loading}
          onChange={event => { setNote(event.target.value); setError(null) }}
        />
      </div>
    </ConfirmDialog>
  )
}

function LegacySuspensionsView() {
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
  const limit = 50

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    listProviderSuspensions({
      providerType,
      triggerType: 'cancellation_limit',
      activeOnly: true,
      page,
      limit,
    })
      .then(result => {
        setItems(result.items)
        setTotal(result.total)
      })
      .catch(err => {
        setItems([])
        setError(err instanceof ApiError ? err.message : 'Failed to load suspensions.')
      })
      .finally(() => setLoading(false))
  }, [page, providerType])

  useEffect(() => { load() }, [load])
  useAutoRefresh(load)
  useEffect(() => { setPage(1) }, [providerType])

  return (
    <div>
      {canViewConfig && <CancellationPolicyCard canEdit={canViewConfig} />}

      <FilterBar onRefresh={load} refreshing={loading} meta={`${total} suspended`}>
        <Select value={providerType} onValueChange={value => setProviderType(value as 'driver' | 'artisan')}>
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
            render: item => (
              <AvatarCell
                name={item.fullName}
                sub={item.phone ? <span className="font-mono">{item.phone}</span> : undefined}
              />
            ),
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
              : <span className="italic text-gray-400">-</span>,
          },
          {
            key: 'type',
            header: 'Type',
            render: item => (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
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
            align: 'right' as const,
            render: item => canLift ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                onClick={event => { event.stopPropagation(); setLifting(item) }}
              >
                <ShieldCheck className="h-3.5 w-3.5" /> Lift
              </Button>
            ) : <span className="text-xs text-gray-300">-</span>,
          },
        ]}
        rows={items}
        rowKey={item => item.suspensionId}
        loading={loading}
        error={error || null}
        onRetry={load}
        empty={<EmptyState icon={ShieldOff} title={`No ${providerType}s are currently cancellation-suspended`} />}
        pagination={{ page, pageSize: limit, total, onPage: setPage }}
      />

      {lifting && (
        <LegacyLiftDialog
          item={lifting}
          onClose={() => setLifting(null)}
          onLifted={() => { setLifting(null); load() }}
        />
      )}
    </div>
  )
}

type ProviderFilter = 'all' | ProviderCancellationRestrictionType

function statusLabel(status: ProviderCancellationRestrictionListItem['status']) {
  return status === 'active' ? 'Active' : status === 'lifted' ? 'Lifted' : 'Expired'
}

function statusClass(status: ProviderCancellationRestrictionListItem['status']) {
  if (status === 'active') return 'bg-amber-100 text-amber-700'
  if (status === 'lifted') return 'bg-emerald-100 text-emerald-700'
  return 'bg-gray-100 text-gray-600'
}

function ProviderRestrictionLiftDialog({
  item,
  onClose,
  onLifted,
}: {
  item: ProviderCancellationRestrictionListItem
  onClose: () => void
  onLifted: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLift(reason: string) {
    setLoading(true)
    setError(null)
    try {
      await liftProviderCancellationRestriction(
        item.providerType,
        item.providerId,
        item.restrictionId,
        reason,
      )
      onLifted()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to lift the cancellation block.')
      setLoading(false)
    }
  }

  const providerLabel = item.providerType === 'driver' ? 'driver' : 'artisan'
  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title={`Lift the cancellation block for ${item.fullName ?? `this ${providerLabel}`}?`}
      description="This allows the provider to receive new requests again. It does not change verification, payout, or unrelated account restrictions."
      confirmLabel="Lift cancellation block"
      onConfirm={reason => { void handleLift(reason) }}
      loading={loading}
      error={error}
      requireReason
      minReason={5}
      reasonPlaceholder="Explain why this provider block should be lifted"
    />
  )
}

function ProviderCancellationBlocksView() {
  const { can } = useRole()
  const canLift = can('suspend_user')
  const [items, setItems] = useState<ProviderCancellationRestrictionListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [providerType, setProviderType] = useState<ProviderFilter>('all')
  const [view, setView] = useState<'active' | 'history'>('active')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lifting, setLifting] = useState<ProviderCancellationRestrictionListItem | null>(null)
  const limit = 50

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    listProviderCancellationRestrictions({
      activeOnly: view === 'active',
      providerType: providerType === 'all' ? undefined : providerType,
      page,
      limit,
    })
      .then(result => {
        setItems(result.items)
        setTotal(result.total)
      })
      .catch(err => {
        setItems([])
        setError(err instanceof ApiError ? err.message : 'Failed to load provider cancellation blocks.')
      })
      .finally(() => setLoading(false))
  }, [page, providerType, view])

  useEffect(() => { load() }, [load])
  useAutoRefresh(load)
  useEffect(() => { setPage(1) }, [providerType, view])

  return (
    <div>
        <Card className="mb-4 border-blue-100 bg-blue-50/60 shadow-none">
          <CardContent className="flex items-start gap-2.5 py-3 text-xs text-blue-800">
            <Eye className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Shadow-only records show what enforcement would have blocked. They do not stop a provider from receiving requests.
            </p>
          </CardContent>
        </Card>

        <FilterBar onRefresh={load} refreshing={loading} meta={`${total} ${view === 'active' ? 'active' : 'records'}`}>
          <Select value={providerType} onValueChange={value => setProviderType(value as ProviderFilter)}>
            <SelectTrigger className="h-9 w-36 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All providers</SelectItem>
              <SelectItem value="driver">Drivers</SelectItem>
              <SelectItem value="artisan">Artisans</SelectItem>
            </SelectContent>
          </Select>
          <Select value={view} onValueChange={value => setView(value as 'active' | 'history')}>
            <SelectTrigger className="h-9 w-40 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active blocks</SelectItem>
              <SelectItem value="history">Full history</SelectItem>
            </SelectContent>
          </Select>
        </FilterBar>

        <DataTable
          minWidth={1050}
          columns={[
            {
              key: 'provider',
              header: 'Provider',
              render: item => (
                <AvatarCell
                  name={item.fullName ?? `${item.providerType} ${item.providerId.slice(0, 8)}`}
                  sub={item.phone ? <span className="font-mono">{item.phone}</span> : undefined}
                />
              ),
            },
            {
              key: 'type',
              header: 'Type',
              render: item => (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium capitalize text-gray-600">
                  {item.providerType}
                </span>
              ),
            },
            {
              key: 'triggerCount',
              header: 'Trigger count',
              align: 'right' as const,
              render: item => (
                <span className="font-medium text-red-600">
                  {item.triggerCount}{item.threshold > 0 ? ` / ${item.threshold}` : ''}
                </span>
              ),
            },
            {
              key: 'blockedUntil',
              header: 'Blocked until',
              render: item => (
                <span className="text-sm text-gray-500">
                  {item.blockedUntil ? formatDateTime(item.blockedUntil) : '-'}
                </span>
              ),
            },
            {
              key: 'mode',
              header: 'Mode / status',
              render: item => (
                <div className="flex items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${item.shadowOnly ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                    {item.shadowOnly ? 'Shadow only' : 'Enforced'}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass(item.status)}`}>
                    {statusLabel(item.status)}
                  </span>
                </div>
              ),
            },
            {
              key: 'createdAt',
              header: 'Created',
              render: item => <span className="text-sm text-gray-500">{formatDateTime(item.createdAt)}</span>,
            },
            {
              key: 'audit',
              header: 'Lift audit',
              className: 'max-w-64',
              render: item => item.status === 'lifted' ? (
                <div className="max-w-64 text-xs text-gray-500">
                  <p>{item.liftedAt ? formatDateTime(item.liftedAt) : 'Lifted'}{item.liftedBy ? ` by ${item.liftedBy}` : ''}</p>
                  <p className="truncate" title={item.liftReason ?? undefined}>{item.liftReason ?? 'Reason unavailable'}</p>
                </div>
              ) : <span className="text-xs text-gray-300">-</span>,
            },
            {
              key: 'action',
              header: '',
              align: 'right' as const,
              render: item => canLift && item.status === 'active' ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 text-xs"
                  onClick={event => { event.stopPropagation(); setLifting(item) }}
                >
                  <ShieldCheck className="h-3.5 w-3.5" /> Lift
                </Button>
              ) : <span className="text-xs text-gray-300">-</span>,
            },
          ]}
          rows={items}
          rowKey={item => item.restrictionId}
          loading={loading}
          error={error || null}
          onRetry={load}
          empty={(
            <EmptyState
              icon={view === 'active' ? ShieldOff : Clock3}
              title={view === 'active' ? 'No active provider cancellation blocks' : 'No provider cancellation block history'}
            />
          )}
          pagination={{ page, pageSize: limit, total, onPage: setPage }}
        />

        {lifting && (
          <ProviderRestrictionLiftDialog
            item={lifting}
            onClose={() => setLifting(null)}
            onLifted={() => { setLifting(null); load() }}
          />
        )}
    </div>
  )
}

export default function SuspensionsPage() {
  return (
    <PageGuard permission="view_users">
      <div>
        <PageHeader
          title="Suspensions"
          subtitle="Account suspensions and temporary provider cancellation blocks"
        />

        <Tabs defaultValue="account-suspensions">
          <TabsList variant="line" aria-label="Suspension views" className="mb-4">
            <TabsTrigger value="account-suspensions">Account suspensions</TabsTrigger>
            <TabsTrigger value="cancellation-blocks">Cancellation blocks</TabsTrigger>
          </TabsList>
          <TabsContent value="account-suspensions">
            <LegacySuspensionsView />
          </TabsContent>
          <TabsContent value="cancellation-blocks">
            <ProviderCancellationBlocksView />
          </TabsContent>
        </Tabs>
      </div>
    </PageGuard>
  )
}
