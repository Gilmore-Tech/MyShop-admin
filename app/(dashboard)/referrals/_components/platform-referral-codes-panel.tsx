'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Ban,
  BarChart3,
  CalendarDays,
  Loader2,
  Plus,
  RefreshCw,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useRole } from '@/hooks/use-role'
import {
  createPlatformReferralCode,
  deactivatePlatformReferralCode,
  listPlatformReferralCodes,
  type PlatformReferralCodeItem,
  type PlatformReferralCodeListResponse,
} from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { formatDate } from '@/lib/format-date'
import {
  normalisePlatformReferralCodeInput,
  PLATFORM_REFERRAL_CODE_PATTERN,
} from '@/lib/platform-referral-code-contract'

const PAGE_LIMIT = 20
const PLATFORM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generatePlatformCode(): string {
  const bytes = new Uint8Array(6)
  globalThis.crypto.getRandomValues(bytes)
  const suffix = Array.from(
    bytes,
    (byte) => PLATFORM_CODE_ALPHABET[byte % PLATFORM_CODE_ALPHABET.length],
  ).join('')
  return `MYSHOP-${suffix}`
}

function actionError(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

function CountCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number | null
  icon: React.ElementType
}) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
        <Icon className="h-4 w-4 text-orange-500" />
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value ?? '...'}</p>
    </div>
  )
}

function PlatformCodeStatus({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? 'inline-flex rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700'
          : 'inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600'
      }
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

function CreatePlatformCodeDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [code, setCode] = useState('')
  const [campaignName, setCampaignName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCode(generatePlatformCode())
    setCampaignName('')
    setSubmitting(false)
    setError(null)
  }, [open])

  const normalisedCode = normalisePlatformReferralCodeInput(code)
  const campaign = campaignName.trim()
  const valid = PLATFORM_REFERRAL_CODE_PATTERN.test(normalisedCode) && campaign.length > 0

  async function create() {
    if (!valid) return
    setSubmitting(true)
    setError(null)
    try {
      await createPlatformReferralCode({ code: normalisedCode, campaignName: campaign })
      onCreated()
    } catch (caught) {
      setError(actionError(caught, 'The platform promo code could not be created. Try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !submitting) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create platform promo code</DialogTitle>
          <DialogDescription>
            This code records aggregate campaign signup counts only. It has no individual owner and
            creates no digital reward.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="platform-campaign-name">Campaign label</Label>
            <Input
              id="platform-campaign-name"
              value={campaignName}
              onChange={(event) => { setCampaignName(event.target.value); setError(null) }}
              maxLength={120}
              disabled={submitting}
              placeholder="e.g. Kumasi launch flyers"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="platform-code">Code</Label>
            <div className="flex gap-2">
              <Input
                id="platform-code"
                value={code}
                onChange={(event) => {
                  setCode(normalisePlatformReferralCodeInput(event.target.value))
                  setError(null)
                }}
                maxLength={13}
                disabled={submitting}
                className="font-mono uppercase"
                aria-describedby="platform-code-hint"
              />
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => { setCode(generatePlatformCode()); setError(null) }}
              >
                Generate
              </Button>
            </div>
            <p id="platform-code-hint" className="text-xs text-gray-500">
              Required format: MYSHOP- followed by six letters or numbers. The code cannot be edited
              after creation.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={() => void create()} disabled={!valid || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create immutable code
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeactivatePlatformCodeDialog({
  target,
  onClose,
  onDeactivated,
}: {
  target: PlatformReferralCodeItem | null
  onClose: () => void
  onDeactivated: () => void
}) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!target) return
    setReason('')
    setSubmitting(false)
    setError(null)
  }, [target])

  const trimmedReason = reason.trim()

  async function deactivate() {
    if (!target || trimmedReason.length === 0) return
    setSubmitting(true)
    setError(null)
    try {
      await deactivatePlatformReferralCode(target.id, trimmedReason)
      onDeactivated()
    } catch (caught) {
      setError(actionError(caught, 'The platform promo code could not be deactivated. Try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => { if (!next && !submitting) onClose() }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Deactivate platform promo code?</DialogTitle>
          <DialogDescription>
            {target?.code} will stop accepting new signup attributions. Existing aggregate counts
            remain available. It cannot be reactivated or deleted.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="platform-code-deactivation-reason">Reason</Label>
          <Textarea
            id="platform-code-deactivation-reason"
            value={reason}
            onChange={(event) => { setReason(event.target.value); setError(null) }}
            maxLength={500}
            rows={3}
            disabled={submitting}
            placeholder="Why is this campaign code being stopped?"
          />
        </div>
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Keep active</Button>
          <Button
            variant="destructive"
            disabled={trimmedReason.length === 0 || submitting}
            onClick={() => void deactivate()}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Deactivate permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function PlatformReferralCodesPanel() {
  const { isSuperAdmin } = useRole()
  const [data, setData] = useState<PlatformReferralCodeListResponse | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [deactivateTarget, setDeactivateTarget] = useState<PlatformReferralCodeItem | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await listPlatformReferralCodes({ page, limit: PAGE_LIMIT }))
    } catch (caught) {
      setData(null)
      setError(actionError(caught, 'Could not load platform promo codes. Try again.'))
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    void load()
  }, [load])

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((data?.pagination.total ?? 0) / PAGE_LIMIT)),
    [data?.pagination.total],
  )

  const refreshAfterMutation = () => {
    setCreateOpen(false)
    setDeactivateTarget(null)
    setPage(1)
    if (page === 1) void load()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Platform promo attribution</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            Campaign codes tally aggregate client, driver and artisan signups. Rewards are handled
            physically outside this system; no individual account receives points or money.
          </p>
        </div>
        {isSuperAdmin && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create platform code
          </Button>
        )}
      </div>

      {data && (
        <div
          className={
            data.signupAttributionEnabled
              ? 'rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800'
              : 'rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800'
          }
        >
          {data.signupAttributionEnabled
            ? 'Signup attribution is active. Active platform codes can be tallied during signup.'
            : 'Signup attribution is paused. Codes can still be prepared and reviewed here, but new signup counts will not be recorded.'}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CountCard label="Total attributed" value={data?.aggregates.total ?? null} icon={BarChart3} />
        <CountCard label="Client signups" value={data?.aggregates.byRole.client ?? null} icon={Users} />
        <CountCard label="Driver signups" value={data?.aggregates.byRole.driver ?? null} icon={Users} />
        <CountCard label="Artisan signups" value={data?.aggregates.byRole.artisan ?? null} icon={Users} />
      </div>

      <div className="flex justify-end">
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Campaign</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Client</TableHead>
              <TableHead className="text-right">Driver</TableHead>
              <TableHead className="text-right">Artisan</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="py-12 text-center text-gray-400">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : (data?.items.length ?? 0) === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-12 text-center text-gray-400">
                  No platform promo codes have been created.
                </TableCell>
              </TableRow>
            ) : (
              data?.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <p className="max-w-[220px] truncate text-sm font-medium text-gray-900" title={item.campaignName}>
                      {item.campaignName}
                    </p>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{item.code}</TableCell>
                  <TableCell>
                    <PlatformCodeStatus active={item.isActive} />
                  </TableCell>
                  <TableCell className="text-right font-medium">{item.counts.total}</TableCell>
                  <TableCell className="text-right">{item.counts.byRole.client}</TableCell>
                  <TableCell className="text-right">{item.counts.byRole.driver}</TableCell>
                  <TableCell className="text-right">{item.counts.byRole.artisan}</TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {item.lastUsedAt ? formatDate(item.lastUsedAt) : 'Never'}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">{formatDate(item.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    {isSuperAdmin && item.isActive && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDeactivateTarget(item)}
                      >
                        <Ban className="mr-1 h-3.5 w-3.5" />
                        Deactivate
                      </Button>
                    )}
                    {!item.isActive && item.deactivationReason && (
                      <span className="text-xs text-gray-500" title={item.deactivationReason}>
                        Permanently inactive
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t bg-gray-50 px-4 py-3">
          <p className="text-xs text-gray-500">
            {data?.pagination.total ?? 0} platform code(s)
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </Button>
            <span className="text-xs text-gray-500">{page} / {totalPages}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <CalendarDays className="h-4 w-4 text-orange-500" />
          <h3 className="text-sm font-semibold text-gray-900">Daily attribution counts</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Client</TableHead>
              <TableHead className="text-right">Driver</TableHead>
              <TableHead className="text-right">Artisan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.aggregates.daily.length ?? 0) === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-gray-400">
                  No platform-code signup attribution has been recorded.
                </TableCell>
              </TableRow>
            ) : (
              data?.aggregates.daily.map((row) => (
                <TableRow key={row.date}>
                  <TableCell>{row.date}</TableCell>
                  <TableCell className="text-right font-medium">{row.total}</TableCell>
                  <TableCell className="text-right">{row.byRole.client}</TableCell>
                  <TableCell className="text-right">{row.byRole.driver}</TableCell>
                  <TableCell className="text-right">{row.byRole.artisan}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CreatePlatformCodeDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={refreshAfterMutation}
      />
      <DeactivatePlatformCodeDialog
        target={deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        onDeactivated={refreshAfterMutation}
      />
    </div>
  )
}
