'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageGuard } from '@/components/common/page-guard'
import Link from 'next/link'
import {
  Clock, CheckCircle2, XCircle, AlertTriangle, Loader2, RefreshCw,
} from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { listBatchPayouts, type BatchPayoutRun } from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { batchFailureLabel } from '@/lib/payment-labels'

const LIMIT = 20

function formatGhs(pesewas: number) {
  return 'GHS ' + (pesewas / 100).toFixed(2)
}

function BatchStatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
  if (status === 'failed') return <XCircle className="h-4 w-4 text-red-500" />
  if (status === 'retrying' || status === 'partial') return <AlertTriangle className="h-4 w-4 text-orange-500" />
  return <Clock className="h-4 w-4 text-gray-400" />
}

export default function BatchPayoutsPage() {
  const [batches, setBatches] = useState<BatchPayoutRun[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    listBatchPayouts({ page, limit: LIMIT })
      .then(res => {
        setBatches(res.items)
        setTotalPages(res.totalPages || 1)
        setTotal(res.total || res.items.length)
      })
      .catch(err => {
        setBatches([])
        setTotalPages(1)
        setTotal(0)
        if (err instanceof ApiError) {
          setError(err.status === 404
            ? 'This list isn’t available yet — the server hasn’t switched it on.'
            : err.message)
        } else {
          setError('Couldn’t load bulk payment runs.')
        }
      })
      .finally(() => setLoading(false))
  }, [page])

  useEffect(() => { load() }, [load])

  return (
     <PageGuard permission="view_payments">
    <div>
      <PageHeader title="Payments" subtitle="Financial transactions and payout management" />

      <Tabs defaultValue="batch-payouts" className="mb-6">
        <TabsList className="bg-white">
          <TabsTrigger value="transactions" asChild><Link href="/payments/transactions">Transactions</Link></TabsTrigger>
          <TabsTrigger value="revenue" asChild><Link href="/payments/revenue">Revenue</Link></TabsTrigger>
          <TabsTrigger value="batch-payouts" asChild><Link href="/payments/batch-payouts">Bulk Payment Runs</Link></TabsTrigger>
          <TabsTrigger value="clawbacks" asChild><Link href="/payments/clawbacks">Provider Debts</Link></TabsTrigger>
          <TabsTrigger value="webhook-failures" asChild><Link href="/payments/webhook-failures">Unprocessed Events</Link></TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Release containment: historical visibility remains read-only. */}
      <div className="bg-slate-900 text-white rounded-lg p-4 mb-6 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
          <div>
            <p className="font-semibold text-sm">Bulk payments are paused</p>
            <p className="text-slate-300 text-xs">No automatic or manual payout runs will happen right now. Provider earnings are safe and still recorded.</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={load}
          disabled={loading}
          className="bg-transparent border-slate-700 text-slate-200 hover:bg-slate-800 hover:text-white gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh history
        </Button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Couldn&apos;t load bulk payment runs</p>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={load}>Retry</Button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Date</TableHead>
              <TableHead>Run ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Providers Paid</TableHead>
              <TableHead className="text-right">Total Amount</TableHead>
              <TableHead>What Went Wrong</TableHead>
              <TableHead>Attempts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(7)].map((_, j) => (
                    <TableCell key={j}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : batches.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-gray-400 text-sm">
                  {error ? 'Nothing to show while this list is unavailable.' : 'No bulk payment runs yet'}
                </TableCell>
              </TableRow>
            ) : (
              batches.map(batch => (
                <TableRow key={batch.id} className="hover:bg-gray-50">
                  <TableCell className="font-medium text-sm">{batch.date}</TableCell>
                  <TableCell className="text-sm font-mono">{batch.primaryRun}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <BatchStatusIcon status={batch.status} />
                      <StatusBadge status={batch.status} />
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm">{batch.providerCount > 0 ? batch.providerCount : '-'}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{batch.totalPesewas > 0 ? formatGhs(batch.totalPesewas) : '-'}</TableCell>
                  <TableCell className="text-sm text-red-600">
                    {batchFailureLabel(batch.failureReason) ?? <span className="text-gray-500">-</span>}
                  </TableCell>
                  <TableCell>
                    {batch.retries.length === 0
                      ? <span className="text-xs text-gray-500">None</span>
                      : (
                        <div className="space-y-0.5">
                          {batch.retries.map((r, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-xs">
                              <BatchStatusIcon status={r.status} />
                              <span className="font-mono">{r.time}</span>
                              <StatusBadge status={r.status} />
                            </div>
                          ))}
                        </div>
                      )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
          <p className="text-xs text-gray-500">
            {loading ? <Loader2 className="h-3 w-3 animate-spin inline" /> : `Page ${page} of ${totalPages} (${total} run${total === 1 ? '' : 's'})`}
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
