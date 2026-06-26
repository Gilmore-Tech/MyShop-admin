'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { PageGuard } from '@/components/common/page-guard'
import {
  Search, CheckCircle, XCircle, RefreshCw,
  ChevronLeft, Loader2, AlertCircle, Check, X, ShieldCheck, FileSearch,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import {
  listUsers, getVerificationQueue, reviewVerification,
  type PlatformUser, type ProviderDocument,
} from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { useRole } from '@/hooks/use-role'
import { DriverRideCategoriesSection } from '@/components/users/driver-ride-categories-section'

// A provider awaiting the admin's go-online decision: verificationStatus is still
// 'pending'. Document review happens on the Verification Queue; the doc-queue row
// (if any) tells us whether their documents are still pending review.
type PendingProvider = {
  userId: string
  providerId: string          // driver.id / artisan.id — the id reviewVerification expects
  type: 'driver' | 'artisan'
  name: string | null
  phone: string | null
  createdAt: string
  docsPending: number
  docsApproved: number
  docsRejected: number
  totalDocs: number
  documents: ProviderDocument[]
  inDocQueue: boolean         // still has documents awaiting review
}

function initials(name: string | null) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function formatDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Fetch every provider of a role, paging through the list. The /admin/users
// `status` filter is account status (active/suspended/banned), not verification
// status, so we filter to verificationStatus === 'pending' client-side.
async function fetchAllProviders(role: 'driver' | 'artisan'): Promise<PlatformUser[]> {
  const LIMIT = 100
  const first = await listUsers({ role, page: 1, limit: LIMIT })
  let items = first.items
  const pages = Math.min(first.totalPages ?? 1, 25) // safety cap
  for (let p = 2; p <= pages; p++) {
    const res = await listUsers({ role, page: p, limit: LIMIT })
    items = items.concat(res.items)
  }
  return items
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

function ReadinessBadge({ p }: { p: PendingProvider }) {
  if (p.inDocQueue) return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
      <FileSearch className="h-3 w-3" /> {p.docsPending} doc{p.docsPending !== 1 ? 's' : ''} pending review
    </span>
  )
  if (p.docsRejected > 0) return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700">
      <X className="h-3 w-3" /> {p.docsRejected} rejected
    </span>
  )
  if (p.totalDocs > 0) return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
      <Check className="h-3 w-3" /> Docs reviewed
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
      No documents submitted
    </span>
  )
}

// ── Go-online decision drawer ─────────────────────────────────────────────────
function DecisionDrawer({
  provider,
  onClose,
  onDone,
}: {
  provider: PendingProvider
  onClose: () => void
  onDone: () => void
}) {
  const { can } = useRole()
  const canReview = can('review_verification')

  const documents = provider.documents.filter(d => d.isCurrent !== false)
  const anyRejected = documents.some(d => d.status === 'rejected') || provider.docsRejected > 0
  const allApproved = provider.totalDocs > 0 && !anyRejected && !provider.inDocQueue
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
      await reviewVerification(provider.providerId, provider.type, action, reason.trim())
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
                {initials(provider.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-sm text-gray-900">{provider.name ?? 'Unknown Provider'}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <StatusBadge status={provider.type} />
                <span className="text-xs text-gray-400 font-mono">{provider.providerId.slice(0, 8)}…</span>
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
                Approving here flips the provider to <span className="font-medium">verified</span> and lets them go online to receive work.
              </p>
            </div>

            {/* Documents still need review — direct the admin to do that first. */}
            {provider.inDocQueue && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                <FileSearch className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                <div className="text-xs text-amber-700">
                  <p className="font-semibold">{provider.docsPending} document{provider.docsPending !== 1 ? 's' : ''} still pending review.</p>
                  <Link href="/verifications" className="underline font-medium">Review documents on the Verification Queue first →</Link>
                </div>
              </div>
            )}

            {/* Doc summary, when the queue still has the row */}
            {documents.length > 0 && (
              <div className="bg-gray-50 rounded-xl p-3 space-y-2 max-h-44 overflow-y-auto">
                {documents.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between gap-2">
                    <p className="text-sm text-gray-700 truncate">{doc.label || doc.type}</p>
                    <DocStatusBadge status={doc.status} />
                  </div>
                ))}
              </div>
            )}

            {/* Ride-tier verification — drivers pick tiers at signup; an admin must
                confirm the vehicle qualifies for each before the driver is matched. */}
            {provider.type === 'driver' && (
              <div className="border border-gray-100 rounded-xl p-3">
                <DriverRideCategoriesSection driverId={provider.providerId} canReview={canReview} />
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
                All documents reviewed and approved — provider can be approved to go online.
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
export default function ProviderApprovalsPage() {
  const [providers, setProviders] = useState<PendingProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [deciding, setDeciding] = useState<PendingProvider | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [drivers, artisans, queue] = await Promise.all([
        fetchAllProviders('driver'),
        fetchAllProviders('artisan'),
        getVerificationQueue().catch(() => []),
      ])
      // Index the doc-review queue by provider profile id for doc context.
      const queueById = new Map(queue.map(q => [q.provider_id, q]))

      const build = (u: PlatformUser, providerId: string, type: 'driver' | 'artisan'): PendingProvider => {
        const q = queueById.get(providerId)
        return {
          userId: u.id,
          providerId,
          type,
          name: u.fullName ?? null,
          phone: u.phone ?? null,
          createdAt: u.createdAt ?? '',
          docsPending: q ? Number(q.docs_pending) : 0,
          docsApproved: q ? Number(q.docs_approved) : 0,
          docsRejected: q ? Number(q.docs_rejected) : 0,
          totalDocs: q ? Number(q.total_docs) : 0,
          documents: q?.documents ?? [],
          inDocQueue: !!q && Number(q.docs_pending) > 0,
        }
      }

      const pending: PendingProvider[] = []
      for (const u of drivers) {
        if (u.driver?.id && u.driver.verificationStatus === 'pending') pending.push(build(u, u.driver.id, 'driver'))
      }
      for (const u of artisans) {
        if (u.artisan?.id && u.artisan.verificationStatus === 'pending') pending.push(build(u, u.artisan.id, 'artisan'))
      }

      // Ready-for-decision first, then oldest signups first.
      pending.sort((a, b) => {
        if (a.inDocQueue !== b.inDocQueue) return a.inDocQueue ? 1 : -1
        return (a.createdAt || '').localeCompare(b.createdAt || '')
      })
      setProviders(pending)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load the approvals queue.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useAutoRefresh(load)

  const filtered = providers.filter(p => {
    const name = p.name?.toLowerCase() ?? ''
    const matchSearch = name.includes(search.toLowerCase()) || p.providerId.includes(search) || (p.phone ?? '').includes(search)
    const matchType = typeFilter === 'all' || p.type === typeFilter
    return matchSearch && matchType
  })

  const readyCount = providers.filter(p => !p.inDocQueue).length

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
                {providers.length} Pending
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
          <Input placeholder="Search by name, phone or ID…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36 bg-white"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="driver">Drivers</SelectItem>
            <SelectItem value="artisan">Artisans</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-sm text-gray-400">{filtered.length} shown</div>
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
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Readiness</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Joined</TableHead>
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
              filtered.map(p => (
                <TableRow key={`${p.type}:${p.providerId}`} className="hover:bg-gray-50">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-gray-100 text-gray-600 text-xs font-bold">
                          {initials(p.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm text-gray-900">{p.name ?? 'Unknown'}</p>
                        <p className="text-xs text-gray-400 font-mono">{p.providerId.slice(0, 8)}…</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><StatusBadge status={p.type} /></TableCell>
                  <TableCell><ReadinessBadge p={p} /></TableCell>
                  <TableCell className="text-sm text-gray-500">{formatDate(p.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 justify-end">
                      <Button
                        size="sm"
                        variant={p.inDocQueue ? 'outline' : 'default'}
                        className="gap-1.5 text-xs h-7 text-white"
                        style={p.inDocQueue ? undefined : { backgroundColor: p.docsRejected > 0 ? '#DC2626' : '#059669' }}
                        onClick={() => setDeciding(p)}
                      >
                        {p.inDocQueue ? 'Review' : p.docsRejected > 0 ? 'Review & Reject' : 'Approve'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
          <p className="text-xs text-gray-400">
            {loading ? 'Loading…' : `Showing ${filtered.length} of ${providers.length} pending providers`}
          </p>
        </div>
      </div>

      {deciding && (
        <DecisionDrawer
          provider={deciding}
          onClose={() => setDeciding(null)}
          onDone={() => { setDeciding(null); load() }}
        />
      )}
    </div>
    </PageGuard>
  )
}
