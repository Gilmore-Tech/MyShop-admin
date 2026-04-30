'use client'

import { PageGuard } from '@/components/common/page-guard'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Search, Loader2, AlertTriangle, RefreshCw } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { listTransactions, type AdminTransaction } from '@/lib/api'
import { ApiError } from '@/lib/api-client'

const txTypeColors: Record<string, string> = {
  collection: 'bg-blue-100 text-blue-700',
  payout: 'bg-purple-100 text-purple-700',
  refund: 'bg-orange-100 text-orange-700',
  clawback: 'bg-red-100 text-red-700',
  tip: 'bg-emerald-100 text-emerald-700',
}

function formatGhs(pesewas: number) {
  return 'GHS ' + (pesewas / 100).toFixed(2)
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const STATUS_OPTIONS = ['pending', 'completed', 'failed', 'refunded'] as const

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<AdminTransaction[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<AdminTransaction | null>(null)
  const LIMIT = 50

  const fetchTransactions = useCallback(() => {
    setLoading(true)
    setError('')
    listTransactions({
      type: typeFilter === 'all' ? undefined : typeFilter,
      status: statusFilter === 'all' ? undefined : statusFilter,
      search: search || undefined,
      page,
      limit: LIMIT,
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
      .finally(() => setLoading(false))
  }, [typeFilter, statusFilter, search, page])

  useEffect(() => { fetchTransactions() }, [fetchTransactions])
  useEffect(() => { setPage(1) }, [typeFilter, statusFilter, search])

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
          <Input placeholder="Search TX ID, party, booking…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40 bg-white"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="collection">Collection</SelectItem>
            <SelectItem value="payout">Payout</SelectItem>
            <SelectItem value="refund">Refund</SelectItem>
            <SelectItem value="clawback">Clawback</SelectItem>
            <SelectItem value="tip">Tip</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 bg-white"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUS_OPTIONS.map(s => (
              <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={fetchTransactions} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
        <div className="ml-auto text-sm text-gray-500">{total} transaction{total === 1 ? '' : 's'}</div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Couldn&apos;t load transactions</p>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={fetchTransactions}>Retry</Button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Transaction ID</TableHead>
              <TableHead>Date / Time</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Booking</TableHead>
              <TableHead>Party</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(8)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(8)].map((_, j) => (
                    <TableCell key={j}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-gray-400 text-sm">
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
                  <TableCell className="font-mono text-sm font-medium text-slate-600">{tx.id.slice(-10).toUpperCase()}</TableCell>
                  <TableCell className="text-sm text-gray-500 whitespace-nowrap">{formatDateTime(tx.createdAt)}</TableCell>
                  <TableCell>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${txTypeColors[tx.type] ?? 'bg-gray-100 text-gray-600'}`}>
                      {tx.type}
                    </span>
                  </TableCell>
                  <TableCell className={`text-right text-sm font-semibold ${tx.type === 'refund' || tx.type === 'clawback' ? 'text-red-600' : tx.type === 'payout' ? 'text-purple-600' : 'text-gray-900'}`}>
                    {tx.type === 'refund' || tx.type === 'payout' ? '−' : '+'}{formatGhs(tx.amountPesewas)}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">{tx.method}</TableCell>
                  <TableCell><StatusBadge status={tx.status} /></TableCell>
                  <TableCell className="font-mono text-sm text-slate-500">
                    {tx.bookingId
                      ? <BookingLink type={tx.bookingType} id={tx.bookingId} />
                      : '—'}
                  </TableCell>
                  <TableCell className="text-sm">{tx.party ?? '—'}</TableCell>
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
    <Dialog open={!!tx} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transaction Detail</DialogTitle>
        </DialogHeader>
        {tx && (
          <div className="space-y-3 text-sm">
            <Row label="ID" value={<span className="font-mono">{tx.id}</span>} />
            <Row label="Type" value={<span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${txTypeColors[tx.type] ?? 'bg-gray-100 text-gray-600'}`}>{tx.type}</span>} />
            <Row label="Status" value={<StatusBadge status={tx.status} />} />
            <Row
              label="Amount"
              value={
                <span className={`font-semibold ${tx.type === 'refund' || tx.type === 'clawback' ? 'text-red-600' : tx.type === 'payout' ? 'text-purple-600' : 'text-gray-900'}`}>
                  {tx.type === 'refund' || tx.type === 'payout' ? '−' : '+'}{formatGhs(tx.amountPesewas)}
                </span>
              }
            />
            <Row label="Method" value={tx.method} />
            <Row label="Created" value={formatDateTime(tx.createdAt)} />
            <Row label="Party" value={tx.party ?? '—'} />
            <Row
              label="Booking"
              value={
                tx.bookingId ? (
                  <BookingLink type={tx.bookingType} id={tx.bookingId} />
                ) : '—'
              }
            />
            {tx.bookingType && (
              <Row label="Booking type" value={<span className="capitalize">{tx.bookingType}</span>} />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
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
