'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { PageGuard } from '@/components/common/page-guard'
import { useRole } from '@/hooks/use-role'
import {
  ShieldOff, ShieldCheck, Loader2, RefreshCw, Save, AlertCircle, XOctagon, Settings2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { PageHeader } from '@/components/common/page-header'
import {
  listProviderSuspensions, liftProviderSuspension, getAllConfig, updateConfig,
  type SuspensionListItem,
} from '@/lib/api'
import { ApiError } from '@/lib/api-client'

function initials(name: string | null) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function formatDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// ── Cancellation policy editor ────────────────────────────────────────────────
// Tunes the two platform_config keys the auto-suspension engine reads. Standardised
// on `cancellation_suspension_count` (the runtime key) — see docs/backend-requests.md §5.
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
  if (n < min || n > max) return `Must be ${min}–${max}`
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
          <Settings2 className="h-4 w-4 text-gray-400" /> Cancellation Policy
        </CardTitle>
        <CardDescription>
          A driver is auto-suspended after this many cancellations within the rolling window.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-20 flex items-center text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading current policy…</div>
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
                <Button onClick={handleSave} disabled={!canSave} className="gap-1.5 text-white" style={{ backgroundColor: '#F5A623' }}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? 'Saving…' : 'Save Policy'}
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

// ── Lift confirmation modal ───────────────────────────────────────────────────
function LiftModal({ item, onClose, onLifted }: {
  item: SuspensionListItem
  onClose: () => void
  onLifted: () => void
}) {
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLift() {
    setLoading(true); setError('')
    try {
      await liftProviderSuspension(item.providerId, item.suspensionId, note)
      onLifted()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to lift suspension. Please try again.')
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-emerald-700">Lift suspension for {item.fullName ?? 'this driver'}</DialogTitle>
          <DialogDescription>
            Restores the driver to approved status and resets their rolling cancellation count, so they can go online again. An optional note is recorded in the audit log.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-1">
          <textarea
            className="w-full rounded-lg border border-gray-200 text-sm px-3 py-2 h-24 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-200"
            placeholder="Note (optional)…"
            value={note}
            onChange={e => { setNote(e.target.value); setError('') }}
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={handleLift} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {loading ? 'Lifting…' : 'Lift Suspension'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const [totalPages, setTotalPages] = useState(1)
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
        setTotalPages(res.totalPages)
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
        title="Cancellation Suspensions"
        subtitle="Providers auto-suspended for exceeding the cancellation limit"
        actions={
          <Button variant="outline" size="sm" onClick={fetchSuspensions} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        }
      />

      {canViewConfig && <CancellationPolicyCard canEdit={canViewConfig} />}

      <div className="flex items-center gap-3 mb-4">
        <Select value={providerType} onValueChange={v => setProviderType(v as 'driver' | 'artisan')}>
          <SelectTrigger className="w-36 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="driver">Drivers</SelectItem>
            <SelectItem value="artisan">Artisans</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-sm text-gray-500">{total} suspended</div>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>{providerType === 'driver' ? 'Driver' : 'Artisan'}</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Cancellations (30d)</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Suspended</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(6)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(7)].map((_, j) => (
                    <TableCell key={j}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-gray-400 text-sm">
                  <ShieldOff className="h-8 w-8 mx-auto mb-2 text-gray-200" />
                  No {providerType}s are currently cancellation-suspended.
                </TableCell>
              </TableRow>
            ) : (
              items.map(item => (
                <TableRow key={item.suspensionId} className="hover:bg-gray-50">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-gray-100 text-gray-600 text-xs font-bold">{initials(item.fullName)}</AvatarFallback>
                      </Avatar>
                      <p className="font-medium text-sm text-gray-900">{item.fullName ?? 'Unknown'}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-gray-500 font-mono">{item.phone ?? '—'}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600">
                      <XOctagon className="h-3.5 w-3.5" />{item.cancellationCount30d}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600 max-w-xs truncate" title={item.reason ?? ''}>
                    {item.reason ?? <span className="text-gray-400 italic">—</span>}
                  </TableCell>
                  <TableCell>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${item.isAutomatic ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                      {item.isAutomatic ? 'Automatic' : 'Manual'}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">{formatDate(item.suspendedAt)}</TableCell>
                  <TableCell className="text-right">
                    {canLift ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 h-7 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                        onClick={() => setLifting(item)}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" /> Lift
                      </Button>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
          <p className="text-xs text-gray-500">
            {loading ? <Loader2 className="h-3 w-3 animate-spin inline" /> : `Page ${page} of ${totalPages} (${total} total)`}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      </div>

      {lifting && (
        <LiftModal
          item={lifting}
          onClose={() => setLifting(null)}
          onLifted={() => { setLifting(null); fetchSuspensions() }}
        />
      )}
    </div>
    </PageGuard>
  )
}
