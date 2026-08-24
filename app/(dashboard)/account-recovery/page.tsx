'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  KeyRound,
  Smartphone,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Phone,
  ChevronRight,
  Info
} from 'lucide-react'
import { PageGuard } from '@/components/common/page-guard'
import { PageHeader } from '@/components/common/page-header'
import { FilterBar, FilterSearch } from '@/components/common/filter-bar'
import { DataTable, AvatarCell } from '@/components/common/data-table'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { PageSkeleton } from '@/components/common/load-state'
import { DetailSheet } from '@/components/common/detail-sheet'
import { StatusBadge } from '@/components/common/status-badge'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatDateTime, timeAgo } from '@/lib/format-date'
import {
  listSessionRecoveryRequests,
  getSessionRecoveryRequestDetail,
  dismissSessionRecoveryRequest,
  revokeUserSession,
  type SessionRecoveryRequest,
  type SessionRecoveryRequestDetail,
  type SessionRecoveryStatus,
  type SessionRole
} from '@/lib/api'
import { ApiError, FEATURES } from '@/lib/api-client'
import { useRole } from '@/hooks/use-role'

const SEARCH_DEBOUNCE_MS = 300

const STATUS_OPTIONS: Array<{
  value: 'all' | SessionRecoveryStatus
  label: string
}> = [
  { value: 'pending', label: 'Pending' },
  { value: 'resolving', label: 'Securing' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'expired', label: 'Expired' },
  { value: 'all', label: 'All' }
]

function shortDevice(id: string | null): string {
  if (!id) return '-'
  return id.length > 12 ? `${id.slice(0, 6)}...${id.slice(-4)}` : id
}

export default function AccountRecoveryPage() {
  const { role, region, category } = useRole()
  const hasGlobalRecoveryRole =
    ['product_owner', 'director', 'super_admin', 'ops_admin'].includes(
      String(role)
    ) &&
    region.id === null &&
    category === null
  const [items, setItems] = useState<SessionRecoveryRequest[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<
    'all' | SessionRecoveryStatus
  >('pending')
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const LIMIT = 50

  const [openId, setOpenId] = useState<string | null>(null)
  const [flash, setFlash] = useState<{
    kind: 'success' | 'error'
    message: string
  } | null>(null)

  // ── Debounced search ───────────────────────────────────────────────────────
  useEffect(() => {
    const id = setTimeout(
      () => setDebouncedSearch(searchInput.trim()),
      SEARCH_DEBOUNCE_MS
    )
    return () => clearTimeout(id)
  }, [searchInput])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [statusFilter, debouncedSearch])

  // ── Load list ──────────────────────────────────────────────────────────────
  const load = useCallback(
    async (silent = false) => {
      if (!FEATURES.sessionRecovery || !hasGlobalRecoveryRole) {
        setLoading(false)
        return
      }
      if (!silent) setLoading(true)
      setError('')
      try {
        const res = await listSessionRecoveryRequests({
          status: statusFilter === 'all' ? undefined : statusFilter,
          page,
          limit: LIMIT,
          search: debouncedSearch || undefined
        })
        setItems(res.items)
        setTotal(res.total)
      } catch (err) {
        setItems([])
        setTotal(0)
        setError(
          err instanceof ApiError
            ? err.message
            : 'Failed to load recovery requests.'
        )
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [statusFilter, page, debouncedSearch, hasGlobalRecoveryRole]
  )

  useEffect(() => {
    load()
  }, [load])
  useAutoRefresh(() => load(true))

  // ── Drawer state ───────────────────────────────────────────────────────────
  function handleResolved(message: string) {
    setFlash({ kind: 'success', message })
    setOpenId(null)
    load(true)
  }

  if (!FEATURES.sessionRecovery || !hasGlobalRecoveryRole) {
    return (
      <PageGuard permission="view_session_recovery">
        <div>
          <PageHeader
            title="Device recovery"
            subtitle="Approve moving an account to a new phone"
          />
          <EmptyState
            variant="unavailable"
            title="This feature isn't available"
            description="Session recovery requires an enabled release gate and a global Super Admin or Operations role."
          />
        </div>
      </PageGuard>
    )
  }

  return (
    <PageGuard permission="view_session_recovery">
      <div>
        <PageHeader
          title="Device recovery"
          subtitle="Approve moving an account to a new phone"
        />

        {flash && (
          <div
            className={`mb-4 flex items-center gap-3 rounded-xl px-4 py-3 ${
              flash.kind === 'success'
                ? 'bg-emerald-50 border border-emerald-100'
                : 'bg-red-50 border border-red-100'
            }`}
          >
            {flash.kind === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
            )}
            <p
              className={`text-sm font-medium ${flash.kind === 'success' ? 'text-emerald-700' : 'text-red-700'}`}
            >
              {flash.message}
            </p>
            <button
              onClick={() => setFlash(null)}
              className={`ml-auto text-xs ${flash.kind === 'success' ? 'text-emerald-600' : 'text-red-600'} hover:opacity-70`}
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="mb-4 text-xs text-gray-500 bg-amber-50 rounded-lg px-4 py-2.5 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
          <p>
            Triggered when a user tries to log into a role that&apos;s already
            active on another device. Verify identity (Ghana Card photo,
            vehicle/categories, history) before approving - approval revokes the
            old session and lets the new device complete OTP login.
          </p>
        </div>

        <FilterBar onRefresh={() => load()} refreshing={loading} meta={`${total} request${total === 1 ? '' : 's'}`}>
          <FilterSearch value={searchInput} onChange={setSearchInput} placeholder="Search by phone..." />
          <Select
            value={statusFilter}
            onValueChange={(v) =>
              setStatusFilter(v as 'all' | SessionRecoveryStatus)
            }
          >
            <SelectTrigger className="h-9 w-44 bg-white">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterBar>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <DataTable
          columns={[
            {
              key: 'raised',
              header: 'Raised',
              render: r => (
                <span className="whitespace-nowrap">
                  <span className="block">{formatDateTime(r.createdAt)}</span>
                  <span className="block text-[10px] text-gray-400">{timeAgo(r.createdAt)}</span>
                </span>
              ),
            },
            {
              key: 'user',
              header: 'User',
              render: r => <AvatarCell name={r.fullName} />,
            },
            {
              key: 'role',
              header: 'Role',
              render: r => r.role ? <StatusBadge status={r.role} /> : <span className="text-gray-300 text-xs">-</span>,
            },
            {
              key: 'phone',
              header: 'Phone',
              render: r => (
                <span className="font-mono flex items-center gap-1.5">
                  <Phone className="h-3 w-3 text-gray-400" />{r.phone}
                </span>
              ),
            },
            {
              key: 'new_device',
              header: 'New device',
              render: r => (
                <span className="text-xs font-mono text-gray-500" title={r.requestingDeviceId ?? undefined}>
                  {shortDevice(r.requestingDeviceId)}
                  {r.requestingIp && <span className="block text-[10px] text-gray-400">{r.requestingIp}</span>}
                </span>
              ),
            },
            {
              key: 'current_device',
              header: 'Logged-in device',
              render: r => (
                <span className="text-xs font-mono text-gray-500" title={r.currentSessionDeviceId ?? undefined}>
                  {shortDevice(r.currentSessionDeviceId)}
                  {r.currentSessionLoggedInAt && (
                    <span className="block text-[10px] text-gray-400">since {timeAgo(r.currentSessionLoggedInAt)}</span>
                  )}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: r => <StatusBadge status={r.status} />,
            },
            {
              key: 'chevron',
              header: '',
              className: 'w-10',
              render: () => <ChevronRight className="h-4 w-4 text-gray-400" />,
            },
          ]}
          rows={items}
          rowKey={r => r.id}
          loading={loading}
          error={null}
          onRowClick={r => setOpenId(r.id)}
          rowAriaLabel={r => `Open recovery request for ${r.phone}`}
          empty={
            <EmptyState
              icon={KeyRound}
              title={`No recovery requests${statusFilter !== 'all' ? ` with status "${statusFilter}"` : ' found'}`}
            />
          }
          pagination={{ page, pageSize: LIMIT, total, onPage: setPage }}
        />

        <RecoveryDetailDrawer
          requestId={openId}
          onClose={() => setOpenId(null)}
          onResolved={handleResolved}
          onError={(msg) => setFlash({ kind: 'error', message: msg })}
        />
      </div>
    </PageGuard>
  )
}

// ── Drawer ────────────────────────────────────────────────────────────────────

function RecoveryDetailDrawer({
  requestId,
  onClose,
  onResolved,
  onError
}: {
  requestId: string | null
  onClose: () => void
  onResolved: (message: string) => void
  onError: (message: string) => void
}) {
  const [detail, setDetail] = useState<SessionRecoveryRequestDetail | null>(
    null
  )
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState<'approve' | 'dismiss' | null>(
    null
  )

  useEffect(() => {
    if (!requestId) {
      setDetail(null)
      setLoadError('')
      setReason('')
      return
    }
    let cancelled = false
    setLoading(true)
    setLoadError('')
    getSessionRecoveryRequestDetail(requestId)
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(
          err instanceof ApiError ? err.message : 'Failed to load request.'
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [requestId])

  const isPending = detail?.status === 'pending'
  const revokeRole: SessionRole | null = detail?.role ?? null
  const approvalReasonValid = reason.trim().length >= 5
  const canApprove = !!(
    isPending &&
    detail?.actionable &&
    detail.roleAccountId &&
    revokeRole &&
    approvalReasonValid
  )

  async function handleApprove() {
    if (!detail || !detail.roleAccountId || !revokeRole) return
    setSubmitting('approve')
    try {
      await revokeUserSession(revokeRole, detail.roleAccountId, {
        reason: reason.trim(),
        recoveryRequestId: detail.id
      })
      onResolved(
        `Old ${revokeRole} session revoked. ${detail.fullName ?? 'User'} can now log in on the new device.`
      )
    } catch (err) {
      const code = err instanceof ApiError ? err.code : ''
      if (code === 'USER_NOT_FOUND') onError('User no longer exists.')
      else if (code === 'PROFILE_NOT_FOUND')
        onError(`User has no ${revokeRole} profile.`)
      else if (code === 'RECOVERY_SESSION_CHANGED') {
        onError(
          'The active session changed after this request was filed. Reload before acting.'
        )
      } else if (code === 'RECOVERY_RESOLUTION_RETRY_QUEUED') {
        onError(
          'The exact role is secured. Background cleanup is retrying automatically; reload this request shortly.'
        )
      } else if (code === 'RECOVERY_RESOLUTION_IN_PROGRESS') {
        onError(
          'This exact request is already being secured by another operator or replica.'
        )
      } else
        onError(
          err instanceof ApiError ? err.message : 'Failed to revoke session.'
        )
    } finally {
      setSubmitting(null)
    }
  }

  async function handleDismiss() {
    if (!detail) return
    setSubmitting('dismiss')
    try {
      await dismissSessionRecoveryRequest(detail.id, reason.trim() || undefined)
      onResolved(`Request dismissed without revoking a session.`)
    } catch (err) {
      const code = err instanceof ApiError ? err.code : ''
      if (code === 'RECOVERY_REQUEST_NOT_PENDING')
        onError('Request was already resolved.')
      else
        onError(
          err instanceof ApiError ? err.message : 'Failed to dismiss request.'
        )
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <DetailSheet
      open={!!requestId}
      onClose={onClose}
      size="lg"
      title={detail?.fullName ?? 'Account recovery request'}
      subtitle={detail && (
        <span className="font-mono flex items-center gap-1.5">
          <Phone className="h-3 w-3" /> {detail.phone}
        </span>
      )}
      status={detail && <StatusBadge status={detail.status} />}
      footer={
        !loading && detail && isPending ? (
          <div className="flex items-center gap-2 w-full">
            <Button
              variant="outline"
              className="flex-1 gap-1.5"
              onClick={handleDismiss}
              disabled={submitting != null}
            >
              {submitting === 'dismiss' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              Dismiss
            </Button>
            <Button
              className="flex-1 gap-1.5"
              variant="brand"
              disabled={!canApprove || submitting != null}
              onClick={handleApprove}
              title={
                !detail.roleAccountId
                  ? 'Backend has not supplied the exact role-account ID; shared identity fallback is forbidden.'
                  : !revokeRole
                    ? 'Role unknown - cannot revoke.'
                    : !detail.actionable
                      ? 'This request has no valid immutable session target.'
                      : !approvalReasonValid
                        ? 'Enter at least 5 characters explaining the approval.'
                        : undefined
              }
            >
              {submitting === 'approve' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Approve & revoke{' '}
              {revokeRole ? `${revokeRole} session` : 'session'}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {loading && <PageSkeleton variant="form" />}

        {!loading && loadError && (
          <ErrorState title="Could not load this request" detail={loadError} />
        )}

        {!loading && detail && (
          <>
            {/* Two sessions side-by-side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SessionPanel
                title="New device (requesting)"
                rows={[
                  ['Device ID', detail.requestingDeviceId ?? '-', true],
                  ['IP', detail.requestingIp ?? '-', false],
                  ['Raised', formatDateTime(detail.createdAt), false]
                ]}
              />
              <SessionPanel
                title="Logged-in device"
                rows={[
                  ['Role', detail.role ?? '-', false],
                  ['Device ID', detail.currentSessionDeviceId ?? '-', true],
                  [
                    'Device info',
                    detail.currentSessionDeviceInfo ?? '-',
                    false
                  ],
                  [
                    'Logged in',
                    formatDateTime(detail.currentSessionLoggedInAt),
                    false
                  ]
                ]}
              />
            </div>

            {/* Identity panel */}
            {detail.identity ? (
              <IdentityPanel detail={detail} />
            ) : (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-amber-800 font-medium">
                    No matching user record
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    This phone has no active user account. Approval is
                    disabled - verify and dismiss instead.
                  </p>
                </div>
              </div>
            )}

            {/* Resolution display when already resolved */}
            {!isPending && (
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-gray-400">
                  Resolution
                </p>
                <p className="text-sm text-gray-700">
                  {detail.resolvedAction === 'revoked'
                    ? 'Old session revoked.'
                    : detail.resolvedAction === 'dismissed'
                      ? 'Dismissed without revoking.'
                      : detail.status === 'resolving'
                        ? 'Exact role secured; external session cleanup is retrying automatically.'
                        : detail.status === 'expired'
                          ? 'Expired.'
                          : '-'}
                </p>
                {detail.resolvedAt && (
                  <p className="text-xs text-gray-500 flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />{' '}
                    {formatDateTime(detail.resolvedAt)}
                  </p>
                )}
                {detail.resolutionReason && (
                  <p className="text-xs text-gray-600 italic mt-1">
                    &ldquo;{detail.resolutionReason}&rdquo;
                  </p>
                )}
                {detail.status === 'resolving' && (
                  <div className="text-xs text-amber-700 pt-1 space-y-0.5">
                    <p>Cleanup attempts: {detail.resolutionAttemptCount}</p>
                    {detail.resolutionNextAttemptAt && (
                      <p>
                        Next retry:{' '}
                        {formatDateTime(detail.resolutionNextAttemptAt)}
                      </p>
                    )}
                    {detail.resolutionLastErrorCode && (
                      <p className="font-mono">
                        Last safe error: {detail.resolutionLastErrorCode}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Action form */}
            {isPending && (
              <div className="space-y-3 pt-2 border-t border-gray-100">
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Resolution note{' '}
                    <span className="text-gray-400">
                      (required for approval; audit-logged)
                    </span>
                  </Label>
                  <Textarea
                    placeholder="e.g. Verified caller via WhatsApp video; Ghana Card matches profile."
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="text-sm"
                  />
                </div>

                <p className="text-[10px] text-gray-400 leading-snug">
                  Approval revokes only the old device&apos;s{' '}
                  {revokeRole ?? 'logged-in'} role session.{' '}
                  {'Sibling-role sessions remain active.'} The user must still
                  complete OTP login on the new device.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </DetailSheet>
  )
}

function SessionPanel({
  title,
  rows
}: {
  title: string
  rows: Array<[string, string, boolean /* mono */]>
}) {
  const ring = 'border-gray-200 bg-gray-50/40'
  const titleClr = 'text-gray-600'
  return (
    <div className={`rounded-lg border ${ring} p-3 space-y-2`}>
      <p
        className={`text-[11px] font-semibold uppercase tracking-widest flex items-center gap-1.5 ${titleClr}`}
      >
        <Smartphone className="h-3 w-3" /> {title}
      </p>
      {rows.map(([label, value, mono]) => (
        <div
          key={label}
          className="flex items-start justify-between gap-3 text-xs"
        >
          <span className="text-gray-500 shrink-0">{label}</span>
          <span
            className={`text-gray-800 text-right break-all ${mono ? 'font-mono' : ''}`}
          >
            {value}
          </span>
        </div>
      ))}
    </div>
  )
}

function IdentityPanel({ detail }: { detail: SessionRecoveryRequestDetail }) {
  const i = detail.identity!
  return (
    <div className="bg-white rounded-lg border border-gray-100 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
          Identity check
        </p>
        <span
          className={`flex items-center gap-1 text-xs font-medium ${i.ghanaCardVerified ? 'text-emerald-600' : 'text-amber-600'}`}
        >
          {i.ghanaCardVerified ? (
            <>
              <ShieldCheck className="h-3.5 w-3.5" /> Ghana Card verified
            </>
          ) : (
            <>
              <ShieldAlert className="h-3.5 w-3.5" /> Ghana Card unverified
            </>
          )}
        </span>
      </div>

      {i.ghanaCardImageUrl ? (
        <a
          href={i.ghanaCardImageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block bg-gray-50 border border-gray-100 rounded-lg p-2 hover:border-orange-200 transition-colors"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={i.ghanaCardImageUrl}
            alt="Ghana Card"
            className="w-full max-h-48 object-contain rounded"
          />
          <p className="text-[10px] text-gray-400 mt-1 text-center">
            Click to open full size
          </p>
        </a>
      ) : (
        <p className="text-xs text-gray-400 italic">
          No Ghana Card photo on file.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 text-xs">
        <Stat label="Registered" value={formatDateTime(i.registeredAt)} />
        {detail.role === 'driver' && (
          <>
            <Stat label="Verification" value={i.verificationStatus ?? '-'} />
            <Stat
              label="Completed rides"
              value={i.completedRidesCount?.toString() ?? '-'}
            />
            {i.vehicle && (
              <Stat
                label="Vehicle"
                value={
                  [
                    i.vehicle.color,
                    i.vehicle.make,
                    i.vehicle.model,
                    i.vehicle.plate
                  ]
                    .filter(Boolean)
                    .join(' ') || '-'
                }
              />
            )}
          </>
        )}
        {detail.role === 'artisan' && (
          <>
            <Stat label="Verification" value={i.verificationStatus ?? '-'} />
            <Stat
              label="Completed jobs"
              value={i.completedJobsCount?.toString() ?? '-'}
            />
            <Stat
              label="Categories"
              value={(i.categories ?? []).join(', ') || '-'}
            />
          </>
        )}
        {detail.role === 'client' && (
          <Stat label="Account type" value="Client" />
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <p className="text-gray-800 mt-0.5 capitalize">{value}</p>
    </div>
  )
}
