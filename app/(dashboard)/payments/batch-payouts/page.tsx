'use client'

import { useState, useEffect } from 'react'
import { PageGuard } from '@/components/common/page-guard'
import Link from 'next/link'
import { Play, Clock, CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { listBatchPayouts, forceBatchPayoutRun, type BatchPayoutRun } from '@/lib/api'

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
  const [loading, setLoading] = useState(true)
  const [forcing, setForcing] = useState(false)
  const [forceError, setForceError] = useState('')

  useEffect(() => {
    listBatchPayouts({ limit: 30 })
      .then(res => setBatches(res.items))
      .catch(() => setBatches([]))
      .finally(() => setLoading(false))
  }, [])

  async function handleForceRun() {
    setForcing(true)
    setForceError('')
    try {
      await forceBatchPayoutRun()
    } catch {
      setForceError('Force run failed. Check permissions or try again.')
    } finally {
      setForcing(false)
    }
  }

  return (
     <PageGuard permission="view_payments">
    <div>
      <PageHeader title="Payments" subtitle="Financial transactions and payout management" />

      <Tabs defaultValue="batch-payouts" className="mb-6">
        <TabsList className="bg-white">
          <TabsTrigger value="transactions" asChild><Link href="/payments/transactions">Transactions</Link></TabsTrigger>
          <TabsTrigger value="revenue" asChild><Link href="/payments/revenue">Revenue</Link></TabsTrigger>
          <TabsTrigger value="batch-payouts" asChild><Link href="/payments/batch-payouts">Batch Payouts</Link></TabsTrigger>
          <TabsTrigger value="clawbacks" asChild><Link href="/payments/clawbacks">Clawbacks</Link></TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Next run banner */}
      <div className="bg-slate-900 text-white rounded-lg p-4 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Clock className="h-5 w-5 text-orange-400" />
          <div>
            <p className="font-semibold text-sm">Next Batch Payout Run</p>
            <p className="text-slate-300 text-xs">Primary: <strong className="text-white">18:00 GMT</strong> · Retries: 19:30, 20:00, 06:00 (next morning)</p>
          </div>
        </div>
        <Button
          size="sm"
          className="text-white gap-2"
          style={{ backgroundColor: '#F5A623' }}
          disabled={forcing}
          onClick={handleForceRun}
        >
          {forcing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Force Run (Super Admin)
        </Button>
      </div>

      {forceError && (
        <div className="mb-4 bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3">{forceError}</div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Date</TableHead>
              <TableHead>Primary Run</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Providers</TableHead>
              <TableHead className="text-right">Total Amount</TableHead>
              <TableHead>Failure Reason</TableHead>
              <TableHead>Retries</TableHead>
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
                <TableCell colSpan={7} className="text-center py-12 text-gray-400 text-sm">No batch payout history</TableCell>
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
                  <TableCell className="text-right text-sm">{batch.providerCount > 0 ? batch.providerCount : '—'}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{batch.totalPesewas > 0 ? formatGhs(batch.totalPesewas) : '—'}</TableCell>
                  <TableCell className="text-sm text-red-600">
                    {batch.failureReason ?? <span className="text-gray-500">—</span>}
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
      </div>
    </div>
  </PageGuard>
  )
}
