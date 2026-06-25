'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { PageGuard } from '@/components/common/page-guard'
import {
  Search, CheckCircle, XCircle, RefreshCw,
  ChevronLeft, Loader2, AlertCircle, Check, X, ShieldCheck,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import {
  getVerificationQueue, reviewVerification,
  type VerificationItem, type ProviderDocument,
} from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { useRole } from '@/hooks/use-role'
import { DriverRideCategoriesSection } from '@/components/users/driver-ride-categories-section'

function initials(name: string | null) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function DocStatusBadge({ status }: { status: string }) {
  if (status === 'approved' || status === 'confirmed') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
      <CheckCircle className="h-3 w-3" /> Approved
    </span>
  )
  if (status === 'rejected') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
      <XCircle className="h-3 w-3" /> Rejected
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
      Pending Review
    </span>
  )
}

function DocsSummary({ approved, rejected, total }: { approved: number; rejected: number; total: number }) {
  if (total === 0) return <span className="text-xs text-gray-400">No docs</span>
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {approved > 0 && <span className="inline-flex items-center gap-0.5 text-[11px] text-emerald-700 bg-emerald-50 px-1.5 rounded">{approved} <Check className="h-3 w-3" /></span>}
        {rejected > 0 && <span className="inline-flex items-center gap-0.5 text-[11px] text-red-700 bg-red-50 px-1.5 rounded">{rejected} <X className="h-3 w-3" /></span>}
      </div>
      <span className="text-xs text-gray-400">/ {total}</span>
    </div>
  )
}

// ── Go-online decision drawer ─────────────────────────────────────────────────
// Documents have already been reviewed on the Verification Queue; here the admin
// makes the single overall decision that lets the provider go online. The same
// PATCH /admin/verifications/:id call as before, just surfaced in its own queue.
function DecisionDrawer({
  item,
  onClose,
  onDone,
}: {
  item: VerificationItem
  onClose: () => void
  onDone: () => void
}) {
  const { can } = useRole()
  const canReview = can('review_verification')

  // Only the current version of each document is meaningful here.
  const documents: ProviderDocument[] = (item.documents ?? []).filter(d => d.isCurrent !== false)
  const anyRejected = documents.some(d => d.status === 'rejected')
  const allApproved = documents.length > 0 && documents.every(d => d.status === 'approved' || d.status === 'confirmed')
  const suggested: 'approve' | 'reject' = allApproved ? 'approve' : 'reject'

  const [action, setAction] = useState<'approve' | 'reject'>(suggested)
  const [reason, setReason] = useState(suggested === 'approve' ? 'All documents reviewed and verified.' : '')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!canReview) return
    if (reason.trim().length < 5) { setError('Reason must be at least 5 characters.'); return }
    setError('')
    setSubmitError(null)
    setSubmitting(true)
    try {
      await reviewVerification(item.provider_id, item.provider_type, action, reason.trim())
      onDone()
    } catch (err) {
      setSubmitting(false)
      setSubmitError(err instanceof ApiError ? err.message : 'Failed to submit the decision.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40" onClick={onClose}>
      <div
        className="relative h-full w-full max-w-lg bg-white shadow-2xl flex flex-col"
        style={{ animation: 'slideInRight 0.25s ease-out' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-gray-100 text-gray-600 text-sm font-bold">
                {initials(item.provider_name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-sm text-gray-900">{item.provider_name ?? 'Unknown Provider'}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <StatusBadge status={item.provider_type} />
                <span className="text-xs text-gray-400 font-mono">{item.provider_id.slice(0, 8)}…</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-md hover:bg-gray-100"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Go-Online Approval</p>
              <p className="text-base font-semibold text-gray-900 mt-0.5">Approve provider to go online</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Documents were reviewed on the Verification Queue. Approving here lets the provider go online and start receiving work.
              </p>
            </div>

            {/* Doc summary (read-only) */}
            <div className="bg-gray-50 rounded-xl p-3 space-y-2 max-h-44 overflow-y-auto">
              {documents.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No documents on file.</p>
              ) : documents.map(doc => (
                <div key={doc.id} className="flex items-center justify-between gap-2">
                  <p className="text-sm text-gray-700 truncate">{doc.label || doc.type}</p>
                  <DocStatusBadge status={doc.status} />
                </div>
              ))}
            </div>

            {/* Ride-tier verification — drivers pick tiers at signup; an admin must
                confirm the vehicle qualifies for each before the driver is matched.
                Reuses the same surface as the driver profile sheet. */}
            {item.provider_type === 'driver' && (
              <div className="border border-gray-100 rounded-xl p-3">
                <DriverRideCategoriesSection driverId={item.provider_id} canReview={canReview} />
              </div>
            )}

            {anyRejected && (
              <div className="flex items-start gap-2 bg-red-50 text-red-700 text-xs rounded-lg px-3 py-2">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                One or more documents were rejected — approval not recommended.
              </div>
            )}
            {allApproved && (
              <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 text-xs rounded-lg px-3 py-2">
                <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                All documents approved — provider can be approved to go online.
              </div>
            )}

            {!canReview && (
              <div className="flex items-start gap-2 bg-amber-50 text-amber-700 text-xs rounded-lg px-3 py-2">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                You don&apos;t have the <span className="font-mono">review_verification</span> permission, so you can view but not decide.
              </div>
            )}

            <div className="flex gap-2">
              {(['approve', 'reject'] as const).map(a => (
                <button
                  key={a}
                  type="button"
                  disabled={!canReview}
                  onClick={() => {
                    setAction(a)
                    setReason(a === 'approve' ? 'All documents reviewed and verified.' : '')
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors border disabled:opacity-50 disabled:cursor-not-allowed ${
                    action === a
                      ? a === 'approve'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-red-50 text-red-700 border-red-200'
                      : 'text-gray-500 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {a === 'approve'
                    ? <><CheckCircle className="h-4 w-4" /> Approve Provider</>
                    : <><XCircle className="h-4 w-4" /> Reject Provider</>
                  }
                </button>
              ))}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Reason <span className="text-gray-400">(required, min 5 chars)</span>
              </label>
              <textarea
                value={reason}
                onChange={e => { setReason(e.target.value); setError('') }}
                rows={3}
                disabled={!canReview}
                className="w-full rounded-lg border border-gray-200 text-sm px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:bg-gray-50"
                placeholder={action === 'approve' ? 'All documents reviewed and verified.' : 'Provide a reason for rejection…'}
              />
            </div>

            {error && (
              <p className="flex items-center gap-1.5 text-xs text-red-600">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />{error}
              </p>
            )}

            {submitError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                <AlertCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-red-700">Submit failed</p>
                  <p className="text-xs text-red-600 mt-0.5">{submitError}</p>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <Button variant="outline" size="sm" onClick={onClose} className="gap-1">
                <ChevronLeft className="h-4 w-4" /> Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={submitting || !canReview}
                className="flex-1 text-white"
                style={{ backgroundColor: action === 'approve' ? '#059669' : '#DC2626' }}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {submitting ? 'Submitting…' : `Confirm ${action === 'approve' ? 'Approval' : 'Rejection'}`}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
// A provider lands here once every document has been reviewed on the Verification
// Queue (docs_pending === 0). This is the single "approve to go online" decision,
// split out of the document-review wizard so it has a home of its own.
export default function ProviderApprovalsPage() {
  const [items, setItems] = useState<VerificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [deciding, setDeciding] = useState<VerificationItem | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getVerificationQueue()
      const list: VerificationItem[] = Array.isArray(data)
        ? data
        : (data && typeof data === 'object' && Array.isArray((data as { items?: VerificationItem[] }).items))
          ? (data as { items: VerificationItem[] }).items
          : []
      // Awaiting go-online decision = every document reviewed, nothing pending.
      setItems(list.filter(v => Number(v.total_docs) > 0 && Number(v.docs_pending) === 0))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load the approvals queue.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useAutoRefresh(load)

  const filtered = items.filter(v => {
    const name = v.provider_name?.toLowerCase() ?? ''
    const matchSearch = name.includes(search.toLowerCase()) || v.provider_id.includes(search)
    const matchType = typeFilter === 'all' || v.provider_type === typeFilter
    return matchSearch && matchType
  })

  const readyCount = items.filter(v => Number(v.docs_rejected) === 0).length

  return (
    <PageGuard permission="view_verifications">
    <div>
      <PageHeader
        title="Go-Online Approvals"
        subtitle="Approve verified providers to go online and start receiving work"
        actions={
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-500 bg-white rounded-lg px-3 py-1.5 flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                {readyCount} Ready
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
                {items.length} Awaiting decision
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={load} className="gap-2">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input placeholder="Search by name or ID…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36 bg-white"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="driver">Drivers</SelectItem>
            <SelectItem value="artisan">Artisans</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-sm text-gray-400">{filtered.length} in queue</div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Provider</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Documents</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">First Upload</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Decision</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-gray-400">
                  <ShieldCheck className="h-8 w-8 mx-auto mb-2 text-gray-200" />
                  {search || typeFilter !== 'all' ? 'No results match your filters.' : 'No providers awaiting a go-online decision.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(v => {
                const rejected = Number(v.docs_rejected) > 0
                return (
                  <TableRow key={v.provider_id} className="hover:bg-gray-50">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-gray-100 text-gray-600 text-xs font-bold">
                            {initials(v.provider_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm text-gray-900">{v.provider_name ?? 'Unknown'}</p>
                          <p className="text-xs text-gray-400 font-mono">{v.provider_id.slice(0, 8)}…</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><StatusBadge status={v.provider_type} /></TableCell>
                    <TableCell>
                      <DocsSummary
                        approved={Number(v.docs_approved)}
                        rejected={Number(v.docs_rejected)}
                        total={Number(v.total_docs)}
                      />
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">{formatDate(v.first_upload_at)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 justify-end">
                        <Button
                          size="sm"
                          className="gap-1.5 text-xs h-7 text-white"
                          style={{ backgroundColor: rejected ? '#DC2626' : '#059669' }}
                          onClick={() => setDeciding(v)}
                        >
                          {rejected ? 'Review & Reject' : 'Approve'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
          <p className="text-xs text-gray-400">
            {loading ? 'Loading…' : `Showing ${filtered.length} of ${items.length} providers`}
          </p>
        </div>
      </div>

      {deciding && (
        <DecisionDrawer
          item={deciding}
          onClose={() => { setDeciding(null); load() }}
          onDone={() => { setDeciding(null); load() }}
        />
      )}
    </div>
    </PageGuard>
  )
}
