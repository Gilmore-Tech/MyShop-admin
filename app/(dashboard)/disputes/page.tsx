'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { PageGuard } from '@/components/common/page-guard'
import {
  Search, RefreshCw, Scale, ChevronRight, AlertTriangle, CheckCircle2,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { getDisputes, type Dispute } from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { formatGhs } from '@/lib/money'

// Spec: docs/admin-frontend-spec-payment-panel.md §4.3.

// PRD 4.8.x — disputes have a 24h SLA for ops to resolve. Badge anything >18h
// old as approaching the deadline.
const SLA_HOURS = 24
const SLA_WARN_HOURS = 18

function ageHours(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000
}

function ageLabel(iso: string): string {
  const h = ageHours(iso)
  if (h < 1) return `${Math.round(h * 60)}m old`
  if (h < 24) return `${Math.floor(h)}h ${Math.round((h - Math.floor(h)) * 60)}m old`
  const d = Math.floor(h / 24)
  return `${d}d ${Math.floor(h - d * 24)}h old`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

interface ResolvedFlash {
  id: string
  refundedPesewas: number | null
  mode: 'REFUND_FULL' | 'REFUND_PARTIAL' | 'REJECT'
}

function readResolvedFlash(): ResolvedFlash | null {
  try {
    const raw = sessionStorage.getItem('disputes:resolved')
    if (!raw) return null
    sessionStorage.removeItem('disputes:resolved')
    return JSON.parse(raw) as ResolvedFlash
  } catch {
    return null
  }
}

export default function DisputesPage() {
  const searchParams = useSearchParams()
  const [items, setItems] = useState<Dispute[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '')
  const [statusFilter, setStatusFilter] = useState('all')
  const [flash, setFlash] = useState<ResolvedFlash | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getDisputes()
      setItems(data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load disputes.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useAutoRefresh(load)

  // One-shot success banner after returning from /disputes/:id resolve.
  useEffect(() => { setFlash(readResolvedFlash()) }, [])

  const filtered = items.filter(d => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      d.id.toLowerCase().includes(q) ||
      (d.clientName ?? '').toLowerCase().includes(q) ||
      (d.providerName ?? '').toLowerCase().includes(q) ||
      (d.description ?? '').toLowerCase().includes(q)
    const matchStatus = statusFilter === 'all' || d.status === statusFilter
    return matchSearch && matchStatus
  })

  // Spec: sort oldest-first so the most-at-risk-of-SLA-breach surfaces top.
  const sorted = [...filtered].sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )

  const openCount = items.filter(d => d.status === 'open').length
  const underReviewCount = items.filter(d => d.status === 'under_review').length
  const slaWarnCount = items.filter(
    d => (d.status === 'open' || d.status === 'under_review') && ageHours(d.createdAt) >= SLA_WARN_HOURS,
  ).length

  return (
    <PageGuard permission="view_disputes">
      <div>
        <PageHeader
          title="Disputes & Refunds"
          subtitle="Review evidence and resolve client-raised disputes"
          actions={
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-3 text-sm text-gray-500 bg-white rounded-lg px-3 py-1.5">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />{openCount} Open</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />{underReviewCount} In Review</span>
                {slaWarnCount > 0 && (
                  <span className="flex items-center gap-1.5 text-amber-700 font-medium" title={`Disputes older than ${SLA_WARN_HOURS}h — approaching the ${SLA_HOURS}h SLA`}>
                    <AlertTriangle className="h-3 w-3" />{slaWarnCount} near SLA
                  </span>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={load} className="gap-2">
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
            </div>
          }
        />

        {flash && (
          <div className="mb-4 flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <p className="text-sm text-emerald-700 font-medium">
              {flash.mode === 'REJECT'
                ? 'Dispute rejected - no refund issued.'
                : flash.refundedPesewas != null
                  ? `Dispute resolved - ${formatGhs(flash.refundedPesewas)} refunded.`
                  : 'Dispute resolved.'}
            </p>
            <button
              onClick={() => setFlash(null)}
              className="ml-auto text-emerald-600 hover:text-emerald-800 text-xs"
            >Dismiss</button>
          </div>
        )}

        <div className="mb-4 text-xs text-gray-500 bg-amber-50 rounded-lg px-4 py-2.5 flex items-center gap-2">
          <span className="text-amber-600 font-semibold">Rule:</span>
          Disputes must be raised within <strong>2 hours</strong> of ride/job completion. Only the disputed amount is frozen — other provider earnings remain accessible. Ops SLA: resolve within {SLA_HOURS}h.
        </div>

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input placeholder="Search by ID, client, provider…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44 bg-white"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="under_review">Under Review</SelectItem>
              <SelectItem value="resolved_refunded">Resolved (refunded)</SelectItem>
              <SelectItem value="resolved_rejected">Resolved (rejected)</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto text-sm text-gray-400">{sorted.length} disputes</div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dispute</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Raised</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Provider</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Amount</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <TableCell key={j}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-gray-400">
                    <Scale className="h-8 w-8 mx-auto mb-2 text-gray-200" />
                    {search || statusFilter !== 'all' ? 'No results match your filters.' : 'No disputes found.'}
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map(d => {
                  const isActive = d.status === 'open' || d.status === 'under_review'
                  const ageH = ageHours(d.createdAt)
                  const slaWarn = isActive && ageH >= SLA_WARN_HOURS && ageH < SLA_HOURS
                  const slaBreached = isActive && ageH >= SLA_HOURS
                  return (
                    <TableRow key={d.id} className="hover:bg-gray-50">
                      <TableCell className="font-mono text-sm font-semibold text-orange-600">
                        <Link href={`/disputes/${d.id}`} className="hover:underline">
                          {d.id.slice(0, 8)}…
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-gray-500 whitespace-nowrap">
                        <div>{formatDate(d.createdAt)}</div>
                        {isActive && (
                          <div
                            className={`text-[10px] mt-0.5 ${
                              slaBreached ? 'text-red-600 font-semibold' :
                              slaWarn ? 'text-amber-600 font-medium' : 'text-gray-400'
                            }`}
                          >
                            {ageLabel(d.createdAt)}
                            {slaBreached && ' - SLA breached'}
                            {slaWarn && ' - near SLA'}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {d.type}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{d.clientName ?? <span className="text-gray-400 italic">-</span>}</TableCell>
                      <TableCell className="text-sm">{d.providerName ?? <span className="text-gray-400 italic">-</span>}</TableCell>
                      <TableCell className="text-sm text-gray-500 max-w-48 truncate">{d.description ?? '-'}</TableCell>
                      <TableCell className="text-right text-sm font-medium tabular-nums">{formatGhs(d.amountPesewas)}</TableCell>
                      <TableCell><StatusBadge status={d.status} /></TableCell>
                      <TableCell>
                        <Link
                          href={`/disputes/${d.id}`}
                          className="text-orange-500 hover:text-orange-700 inline-flex items-center"
                          aria-label={`Open dispute ${d.id}`}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
            <p className="text-xs text-gray-400">
              {loading ? 'Loading…' : `Showing ${sorted.length} of ${items.length} disputes (oldest first)`}
            </p>
          </div>
        </div>
      </div>
    </PageGuard>
  )
}
