'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { PageGuard } from '@/components/common/page-guard'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { useRole } from '@/hooks/use-role'
import {
  acceptProviderRoleAccountRecovery,
  approveClientRoleAccountRecovery,
  getRoleAccountRecoveryRequest,
  listRoleAccountRecoveryRequests,
  type RoleAccountRecoveryRequest,
  type RoleAccountRecoveryStatus,
} from '@/lib/api'
import { ApiError, FEATURES } from '@/lib/api-client'

const PAGE_SIZE = 25
const STATUS_OPTIONS: Array<{ value: 'all' | RoleAccountRecoveryStatus; label: string }> = [
  { value: 'pending_operations', label: 'Client approval pending' },
  { value: 'pending_admin_intake', label: 'Provider intake pending' },
  { value: 'provider_pending_verification', label: 'Provider revalidation' },
  { value: 'approved', label: 'Approved' },
  { value: 'expired', label: 'Expired' },
  { value: 'all', label: 'All' },
]

function formatDateTime(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-GB', {
    timeZone: 'GMT',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

function stageCopy(status: RoleAccountRecoveryStatus) {
  switch (status) {
    case 'pending_operations':
      return 'Waiting for global Operations approval of this client role.'
    case 'pending_admin_intake':
      return 'Waiting for the named Admin in the provider region.'
    case 'provider_pending_verification':
      return 'Admin intake is complete. Documents must pass Coordinator validation and RM final approval.'
    case 'approved':
      return 'The exact role recovery chain is complete.'
    case 'expired':
      return 'The 90×24-hour recovery window closed before intake or approval.'
  }
}

export default function RoleAccountRecoveryPage() {
  const { role, region, category, can } = useRole()
  const isGlobalClientApprover =
    ['product_owner', 'director', 'super_admin', 'ops_admin'].includes(String(role)) &&
    region.id === null &&
    category === null &&
    can('resolve_client_role_account_recovery')
  const isRegionalProviderAdmin =
    role === 'admin' &&
    region.id !== null &&
    category === null &&
    can('intake_role_account_recovery')
  const hasExactAuthority = isGlobalClientApprover || isRegionalProviderAdmin

  const [items, setItems] = useState<RoleAccountRecoveryRequest[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [status, setStatus] = useState<'all' | RoleAccountRecoveryStatus>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [flash, setFlash] = useState('')

  const load = useCallback(
    async (silent = false) => {
      if (!FEATURES.roleAccountRecovery || !hasExactAuthority) {
        setLoading(false)
        return
      }
      if (!silent) setLoading(true)
      setError('')
      try {
        const response = await listRoleAccountRecoveryRequests({
          status: status === 'all' ? undefined : status,
          page,
          limit: PAGE_SIZE,
        })
        setItems(response.items)
        setTotal(response.total)
        setTotalPages(response.totalPages)
      } catch (caught) {
        setItems([])
        setTotal(0)
        setTotalPages(0)
        setError(caught instanceof ApiError ? caught.message : 'Recovery requests could not be loaded.')
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [hasExactAuthority, page, status]
  )

  useEffect(() => {
    setPage(1)
  }, [status])
  useEffect(() => {
    load()
  }, [load])
  useAutoRefresh(() => load(true))

  if (!FEATURES.roleAccountRecovery || !hasExactAuthority) {
    return (
      <PageGuard permission="view_role_account_recovery">
        <PageHeader title="Deleted Role Recovery" subtitle="This workflow is release-gated." />
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This page requires the matching backend and dashboard feature gates plus either global
          client-recovery authority or the named regional Admin provider-intake authority.
        </div>
      </PageGuard>
    )
  }

  return (
    <PageGuard permission="view_role_account_recovery">
      <div>
        <PageHeader
          title="Deleted Role Recovery"
          subtitle={
            isGlobalClientApprover
              ? 'Approve OTP-verified client-role recovery requests.'
              : `Accept OTP-verified provider requests for ${region.name ?? 'your region'} into document revalidation.`
          }
          actions={
            <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          }
        />

        <div className="mb-4 flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            This is not device-session recovery. It restores one soft-deleted role only. Sibling
            roles, loyalty, referrals and emergency contacts are never joined or changed. There is
            no reject action in this release.
          </p>
        </div>

        {flash && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            <span>{flash}</span>
            <button className="ml-auto text-xs" onClick={() => setFlash('')}>Dismiss</button>
          </div>
        )}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4" /> {error}
          </div>
        )}

        <div className="mb-4 flex items-center gap-3">
          <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
            <SelectTrigger className="w-60 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="ml-auto text-sm text-gray-500">{total} request{total === 1 ? '' : 's'}</span>
        </div>

        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead>Requested</TableHead>
                <TableHead>Role account</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-400" /></TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-12 text-center text-gray-400">No requests in this exact scope.</TableCell></TableRow>
              ) : items.map((request) => (
                <TableRow key={request.requestId}>
                  <TableCell className="text-sm text-gray-600">{formatDateTime(request.requestedAt)}</TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{request.name ?? 'Name unavailable'}</div>
                    <div className="text-xs capitalize text-gray-500">{request.role}</div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{request.maskedPhone}</TableCell>
                  <TableCell className="text-sm"><Clock className="mr-1 inline h-3.5 w-3.5" />{formatDateTime(request.recoveryDeadline)}</TableCell>
                  <TableCell><StatusBadge status={request.status} /></TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => setSelectedId(request.requestId)}>Open</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between bg-gray-50 px-4 py-3">
            <span className="text-xs text-gray-500">Page {page} of {Math.max(1, totalPages)}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={loading || page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</Button>
            </div>
          </div>
        </div>

        <RecoveryDrawer
          requestId={selectedId}
          isGlobalClientApprover={isGlobalClientApprover}
          isRegionalProviderAdmin={isRegionalProviderAdmin}
          onClose={() => setSelectedId(null)}
          onCompleted={(message) => {
            setSelectedId(null)
            setFlash(message)
            load(true)
          }}
        />
      </div>
    </PageGuard>
  )
}

function RecoveryDrawer({
  requestId,
  isGlobalClientApprover,
  isRegionalProviderAdmin,
  onClose,
  onCompleted,
}: {
  requestId: string | null
  isGlobalClientApprover: boolean
  isRegionalProviderAdmin: boolean
  onClose: () => void
  onCompleted: (message: string) => void
}) {
  const [request, setRequest] = useState<RoleAccountRecoveryRequest | null>(null)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!requestId) {
      setRequest(null)
      setNote('')
      setError('')
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    getRoleAccountRecoveryRequest(requestId)
      .then((value) => { if (!cancelled) setRequest(value) })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof ApiError ? caught.message : 'Request could not be loaded.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [requestId])

  const clientAction =
    request?.role === 'client' &&
    request.status === 'pending_operations' &&
    isGlobalClientApprover
  const providerAction =
    request?.role !== 'client' &&
    request?.status === 'pending_admin_intake' &&
    isRegionalProviderAdmin

  async function submit() {
    if (!request || (!clientAction && !providerAction)) return
    setSubmitting(true)
    setError('')
    try {
      if (clientAction) {
        await approveClientRoleAccountRecovery(request.requestId, note.trim() || undefined)
        onCompleted('The exact client role was restored. Sibling roles were unchanged.')
      } else {
        const result = await acceptProviderRoleAccountRecovery(
          request.requestId,
          note.trim() || undefined
        )
        onCompleted(
          `${result.role} intake accepted; ${result.documentsQueuedForRevalidation} document record(s) returned to independent review.`
        )
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The recovery action failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet open={!!requestId} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="overflow-y-auto sm:max-w-xl">
        <SheetHeader><SheetTitle>Deleted role recovery</SheetTitle></SheetHeader>
        <div className="mt-6 space-y-5">
          {loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : error && !request ? (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
          ) : request ? (
            <>
              <div className="grid grid-cols-2 gap-4 rounded-lg bg-gray-50 p-4 text-sm">
                <div><div className="text-xs text-gray-500">Account</div><div className="font-medium">{request.name ?? 'Name unavailable'}</div></div>
                <div><div className="text-xs text-gray-500">Role</div><div className="capitalize">{request.role}</div></div>
                <div><div className="text-xs text-gray-500">Phone</div><div className="font-mono">{request.maskedPhone}</div></div>
                <div><div className="text-xs text-gray-500">Status</div><StatusBadge status={request.status} /></div>
                <div className="col-span-2"><div className="text-xs text-gray-500">Recovery deadline</div><div>{formatDateTime(request.recoveryDeadline)}</div></div>
              </div>
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">{stageCopy(request.status)}</div>
              {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
              {(clientAction || providerAction) && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="recovery-note">Audit note (optional)</Label>
                    <Textarea id="recovery-note" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="Record how the request was checked." />
                  </div>
                  {providerAction && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      Intake restores only this provider role as pending and Offline. Every current document is independently re-reviewed; the Coordinator and RM stages remain mandatory.
                    </div>
                  )}
                  <Button className="w-full" onClick={submit} disabled={submitting}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {clientAction ? 'Approve exact client recovery' : 'Accept provider into revalidation'}
                  </Button>
                </>
              )}
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
