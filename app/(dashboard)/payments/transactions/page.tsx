'use client'

import { PageGuard } from '@/components/common/page-guard'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Search, Loader2 } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { listTransactions, type AdminTransaction } from '@/lib/api'

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

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<AdminTransaction[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const LIMIT = 50

  const fetchTransactions = useCallback(() => {
    setLoading(true)
    listTransactions({
      type: typeFilter === 'all' ? undefined : typeFilter,
      search: search || undefined,
      page,
      limit: LIMIT,
    })
      .then(res => {
        setTransactions(res.items)
        setTotal(res.total)
        setTotalPages(res.totalPages)
      })
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false))
  }, [typeFilter, search, page])

  useEffect(() => { fetchTransactions() }, [fetchTransactions])
  useEffect(() => { setPage(1) }, [typeFilter, search])

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
        <div className="ml-auto text-sm text-gray-500">{total} transactions</div>
      </div>

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
                <TableCell colSpan={8} className="text-center py-12 text-gray-400 text-sm">No transactions found</TableCell>
              </TableRow>
            ) : (
              transactions.map(tx => (
                <TableRow key={tx.id} className="hover:bg-gray-50">
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
                  <TableCell className="font-mono text-sm text-slate-500">{tx.bookingId ? tx.bookingId.slice(-8).toUpperCase() : '—'}</TableCell>
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
    </div>
  </PageGuard>
  )
}
