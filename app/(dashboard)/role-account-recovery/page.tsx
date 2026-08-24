'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Clock, Loader2, ShieldCheck } from 'lucide-react'
import { PageGuard } from '@/components/common/page-guard'
import { PageHeader } from '@/components/common/page-header'
import { FilterBar } from '@/components/common/filter-bar'
import { DataTable, AvatarCell } from '@/components/common/data-table'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { PageSkeleton } from '@/components/common/load-state'
import { DetailSheet } from '@/components/common/detail-sheet'
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
import { Textarea } from '@/components/ui/textarea'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { useRole } from '@/hooks/use-role'
import { formatDateTime } from '@/lib/format-date'
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

function stageCopy(status: RoleAccountRecoveryStatus) {
  switch (status) {
    case 'pending_operations':
      return 'Waiting for global Operations approval of this client role.'
    case 'pending_admin_intake':
      return 'Waiting for the named Admin in the provider region.'
    case 'provider_pending_verification':
      return 'Admin intake is complete. Documents must pass Coordinator validation and Regional Manager final approval.'
    case 'approved':
      return 'The exact role recovery chain is complete.'
    case 'expired':
      return 'The 90x24-hour recovery window closed before intake or approval.'
  }
}

export default function RoleAccountRecoveryPage() {
  const { role, region, category, can, isSuperAdmin } = useRole()
  const isGlobalClientApprover =
    ['product_owner', 'director', 'super_admin', 'ops_admin'].includes(String(role)) &&
    region.id === null &&
    category === null &&
    can('resolve_client_role_account_recovery')
  const isRegionalProviderAdmin =
    isSuperAdmin ||
    (role === 'admin' &&
      region.id !== null &&
      category === null &&
      can('intake_role_account_recovery'))
  const hasExactAuthority = isGlobalClientApprover || isRegionalProviderAdmin

  const [items, setItems] = useState<RoleAccountRecoveryRequest[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
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
      } catch (caught) {
        setItems([])
        setTotal(0)
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
        <div>
          <PageHeader title="Deleted account recovery" subtitle="Restore deleted client, driver or artisan accounts" />
          <EmptyState
            variant="unavailable"
            title="This feature isn't available"
            description="This page requires the matching backend and dashboard feature gates plus either global client-recovery authority or the named regional Admin provider-intake authority."
          />
        </div>
      </PageGuard>
    )
  }

  return (
    <PageGuard permission="view_role_account_recovery">
      <div>
        <PageHeader
          title="Deleted account recovery"
          subtitle="Restore deleted client, driver or artisan accounts"
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
        <FilterBar
          onRefresh={() => load()}
          refreshing={loading}
          meta={
            isGlobalClientApprover
              ? 'Approve OTP-verified client-role recovery requests'
              : `Accept OTP-verified provider requests for ${region.name ?? 'your region'} into document revalidation`
          }
        >
          <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
            <SelectTrigger className="h-9 w-60 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterBar>

        <DataTable
          columns={[
            {
              key: 'requested',
              header: 'Requested',
              render: request => <span className="text-sm text-gray-600">{formatDateTime(request.requestedAt)}</span>,
            },
            {
              key: 'account',
              header: 'Role account',
              render: request => <AvatarCell name={request.name} sub={<span className="capitalize">{request.role}</span>} />,
            },
            {
              key: 'phone',
              header: 'Phone',
              render: request => <span className="font-mono text-sm">{request.maskedPhone}</span>,
            },
            {
              key: 'deadline',
              header: 'Deadline',
              render: request => (
                <span className="text-sm inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-gray-400" />{formatDateTime(request.recoveryDeadline)}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: request => <StatusBadge status={request.status} />,
            },
            {
              key: 'review',
              header: '',
              align: 'right',
              render: request => (
                <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); setSelectedId(request.requestId) }}>
                  Open
                </Button>
              ),
            },
          ]}
          rows={items}
          rowKey={request => request.requestId}
          loading={loading}
          error={error || null}
          onRetry={() => load()}
          onRowClick={request => setSelectedId(request.requestId)}
          rowAriaLabel={request => `Open recovery request for ${request.maskedPhone}`}
          empty={<EmptyState title="No requests in this exact scope" />}
          pagination={{ page, pageSize: PAGE_SIZE, total, onPage: setPage }}
        />

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
    <DetailSheet
      open={!!requestId}
      onClose={onClose}
      title={request?.name ?? 'Deleted role recovery'}
      subtitle={request && <span className="font-mono">{request.maskedPhone}</span>}
      status={request && <StatusBadge status={request.status} />}
      footer={
        !loading && request && (clientAction || providerAction) ? (
          <Button className="w-full" variant="brand" onClick={() => void submit()} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {clientAction ? 'Approve exact client recovery' : 'Accept provider into revalidation'}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {loading && <PageSkeleton variant="form" />}
        {!loading && error && !request && (
          <ErrorState title="Could not load this request" detail={error} />
        )}
        {!loading && request && (
          <>
            <div className="grid grid-cols-2 gap-4 rounded-lg bg-gray-50 p-4 text-sm">
              <div><div className="text-xs text-gray-500">Role</div><div className="capitalize">{request.role}</div></div>
              <div><div className="text-xs text-gray-500">Recovery deadline</div><div>{formatDateTime(request.recoveryDeadline)}</div></div>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">{stageCopy(request.status)}</div>
            {error && <ErrorState compact title="That did not work" detail={error} />}
            {(clientAction || providerAction) && (
              <div className="space-y-2">
                <Label htmlFor="recovery-note">Audit note (optional)</Label>
                <Textarea id="recovery-note" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="Record how the request was checked." />
              </div>
            )}
            {providerAction && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Intake restores only this provider role as pending and Offline. Every current document is independently re-reviewed; the Coordinator and Regional Manager stages remain mandatory.
              </div>
            )}
          </>
        )}
      </div>
    </DetailSheet>
  )
}
