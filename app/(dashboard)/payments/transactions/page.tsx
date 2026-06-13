'use client'

import { PageGuard } from '@/components/common/page-guard'
import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Search, Loader2, AlertTriangle, RefreshCw } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { PageSizeSelect } from '@/components/common/table-controls'
import { listTransactions, type AdminTransaction } from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { formatTransactionAmount } from '@/lib/money'
import { paymentMethodLabel } from '@/lib/payment-labels'
import { AUTO_REFRESH_DISABLED } from '@/hooks/use-auto-refresh'

const txTypeColors: Record<string, string> = {
  collection: 'bg-gray-100 text-gray-600',
  payout: 'bg-gray-100 text-gray-600',
  refund: 'bg-gray-100 text-gray-600',
  clawback: 'bg-gray-100 text-gray-600',
  tip: 'bg-gray-100 text-gray-600',
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const STATUS_OPTIONS = ['pending', 'escrowed', 'completed', 'failed', 'refunded', 'disputed'] as const
const SEARCH_DEBOUNCE_MS = 300
const POLL_INTERVAL_MS = 30_000

export default function TransactionsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Filter state is the URL — useSearchParams is the source of truth so links
  // are shareable. Spec §4.1: "Filters debounce 300ms, write to URL".
  const typeFilter = searchParams.get('type') ?? 'all'
  const statusFilter = searchParams.get('status') ?? 'all'
  const urlSearch = searchParams.get('search') ?? ''
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1)

  // Search has its own local state so typing doesn't cause an immediate URL
  // write — debounced below.
  const [searchInput, setSearchInput] = useState(urlSearch)

  const [transactions, setTransactions] = useState<AdminTransaction[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<AdminTransaction | null>(null)
  const [limit, setLimit] = useState(15)

  // ── URL writers ────────────────────────────────────────────────────────────
  const setParams = useCallback((updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value == null || value === '' || value === 'all') next.delete(key)
      else next.set(key, value)
    }
    // Filter changes (other than the page itself) reset pagination.
    const isFilterChange = Object.keys(updates).some(k => k !== 'page')
    if (isFilterChange) next.delete('page')
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [router, pathname, searchParams])

  // ── Debounced search → URL ─────────────────────────────────────────────────
  useEffect(() => {
    if (searchInput === urlSearch) return
    const id = setTimeout(() => {
      setParams({ search: searchInput || null })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [searchInput, urlSearch, setParams])

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchTransactions = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true)
      setError('')
      return listTransactions({
        type: typeFilter === 'all' ? undefined : typeFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: urlSearch || undefined,
        page,
        limit,
      })
        .then(res => {
          setTransactions(res.items)
          setTotal(res.total)
          setTotalPages(res.totalPages)
        })
        .catch(err => {
          setTransactions([])
          setTotal(0)
          setTotalPages(1)
          if (err instanceof ApiError) {
            setError(err.status === 404
              ? 'Transactions endpoint is not yet available on the backend.'
              : err.message)
          } else {
            setError('Failed to load transactions.')
          }
        })
        .finally(() => { if (!silent) setLoading(false) })
    },
    [typeFilter, statusFilter, urlSearch, page, limit],
  )

  useEffect(() => { fetchTransactions() }, [fetchTransactions])

  // Reset to page 1 when the page size changes (it isn't in the URL).
  useEffect(() => {
    if (page !== 1) setParams({ page: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit])

  // ── 30s background poll ────────────────────────────────────────────────────
  // Keeps the feed fresh without disrupting the user. Pauses while a row drawer
  // is open so a refetch doesn't replace the row out from under them.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (AUTO_REFRESH_DISABLED || selected) return
    pollRef.current = setInterval(() => fetchTransactions(true), POLL_INTERVAL_MS)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [fetchTransactions, selected])

  return (
     <PageGuard permission="view_payments">
    <div>
      <PageHeader title="Payments" subtitle="Financial transactions and payout management" />

      <Tabs defaultValue="transactions" className="mb-6">
        <TabsList className="bg-white">
          <TabsTrigger value="transactions" asChild><Link href="/payments/transactions">Transactions</Link></TabsTrigger>
          <TabsTrigger value="revenue" asChild><Link href="/payments/revenue">Revenue</Link></TabsTrigger>
          <TabsTrigger value="batch-payouts" asChild><Link href="/payments/batch-payouts">Batch Payouts</Link></TabsTrigger>
          <TabsTrigger value="clawbacks" asChild><Link href="/payments/clawbacks">Clawbacks</Link></TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
          <Input
            placeholder="Search TX ID, party, booking…"
            className="pl-9"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={v => setParams({ status: v })}>
          <SelectTrigger className="w-36 bg-white"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUS_OPTIONS.map(s => (
              <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => fetchTransactions()} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-gray-500">{total} transaction{total === 1 ? '' : 's'}</span>
          <PageSizeSelect value={limit} onChange={setLimit} />
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Couldn&apos;t load transactions</p>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => fetchTransactions()}>Retry</Button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Date / Time</TableHead>
              <TableHead>Transaction ID</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(8)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(5)].map((_, j) => (
                    <TableCell key={j}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-gray-400 text-sm">
                  {error ? 'No transactions to display while the endpoint is unavailable.' : 'No transactions found'}
                </TableCell>
              </TableRow>
            ) : (
              transactions.map(tx => (
                <TableRow
                  key={tx.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelected(tx)}
                >
                  <TableCell className="text-sm text-gray-500 whitespace-nowrap">{formatDateTime(tx.createdAt)}</TableCell>
                  <TableCell className="font-mono text-sm font-medium text-gray-900">{tx.id.slice(-10).toUpperCase()}</TableCell>
                  <TableCell className={`text-sm font-semibold tabular-nums ${tx.type === 'refund' || tx.type === 'clawback' || tx.type === 'payout' ? 'text-red-600' : 'text-gray-900'}`}>
                    {formatTransactionAmount(tx.amountPesewas, tx.type)}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">{paymentMethodLabel(tx.method)}</TableCell>
                  <TableCell><StatusBadge status={tx.status} /></TableCell>
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
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setParams({ page: String(page - 1) })}
            >Previous</Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setParams({ page: String(page + 1) })}
            >Next</Button>
          </div>
        </div>
      </div>

      <TransactionDetailDialog tx={selected} onClose={() => setSelected(null)} />
    </div>
  </PageGuard>
  )
}

function BookingLink({ type, id }: { type: 'ride' | 'job' | null; id: string }) {
  const short = id.slice(-8).toUpperCase()
  if (type === 'ride') {
    return (
      <Link
        href={`/rides/${id}`}
        className="hover:underline hover:text-blue-600"
        onClick={e => e.stopPropagation()}
      >
        {short}
      </Link>
    )
  }
  if (type === 'job') {
    return (
      <Link
        href={`/artisan-jobs/${id}`}
        className="hover:underline hover:text-blue-600"
        onClick={e => e.stopPropagation()}
      >
        {short}
      </Link>
    )
  }
  return <span>{short}</span>
}

function TransactionDetailDialog({ tx, onClose }: { tx: AdminTransaction | null; onClose: () => void }) {
  return (
    <Sheet open={!!tx} onOpenChange={open => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto p-0">
        {tx && (
          <>
            <SheetHeader className="px-6 py-4 border-b border-gray-100">
              <SheetTitle className="text-base flex items-center gap-2">
                Transaction
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${txTypeColors[tx.type] ?? 'bg-gray-100 text-gray-600'}`}>
                  {tx.type}
                </span>
              </SheetTitle>
              <p className="font-mono text-xs text-gray-400 mt-1 break-all">{tx.id}</p>
            </SheetHeader>

            <div className="px-6 py-5 space-y-3 text-sm">
              <Row label="Status" value={<StatusBadge status={tx.status} />} />
              <Row
                label="Amount"
                value={
                  <span className={`font-semibold tabular-nums ${tx.type === 'refund' || tx.type === 'clawback' || tx.type === 'payout' ? 'text-red-600' : 'text-gray-900'}`}>
                    {formatTransactionAmount(tx.amountPesewas, tx.type)}
                  </span>
                }
              />
              <Row label="Method" value={paymentMethodLabel(tx.method)} />
              <Row label="Created" value={formatDateTime(tx.createdAt)} />
              <Row label="Party" value={tx.party ?? '-'} />
              <Row
                label="Booking"
                value={tx.bookingId ? <BookingLink type={tx.bookingType} id={tx.bookingId} /> : '-'}
              />
              {tx.bookingType && (
                <Row label="Booking type" value={<span className="capitalize">{tx.bookingType}</span>} />
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-2 last:border-0">
      <span className="text-xs uppercase tracking-wide text-gray-500 mt-0.5">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}
