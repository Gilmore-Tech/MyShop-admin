'use client'

import { useState, useEffect } from 'react'
import { PageGuard } from '@/components/common/page-guard'
import Link from 'next/link'
import { AlertTriangle, Phone, ArrowUpRight, Loader2 } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/components/common/page-header'
import { listClawbacks, writeOffClawback, escalateClawback, type AdminClawback } from '@/lib/api'

const WRITEOFF_THRESHOLD = 10000 // GHS 100 in pesewas
const WRITEOFF_INACTIVE_DAYS = 90

function formatGhs(pesewas: number) {
  return 'GHS ' + (pesewas / 100).toFixed(2)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function ClawbacksPage() {
  const [clawbacks, setClawbacks] = useState<AdminClawback[]>([])
  const [totalOutstanding, setTotalOutstanding] = useState(0)
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)

  useEffect(() => {
    listClawbacks()
      .then(res => {
        setClawbacks(res.items)
        setTotalOutstanding(res.totalOutstandingPesewas)
      })
      .catch(() => setClawbacks([]))
      .finally(() => setLoading(false))
  }, [])

  async function handleWriteOff(clawback: AdminClawback) {
    setActionId(clawback.id)
    try {
      await writeOffClawback(clawback.id, 'Write-off approved: under GHS 100, inactive 90+ days')
      setClawbacks(prev => prev.filter(c => c.id !== clawback.id))
      setTotalOutstanding(prev => prev - clawback.outstandingPesewas)
    } catch {
      // silently fail — leave row in place
    } finally {
      setActionId(null)
    }
  }

  async function handleEscalate(id: string) {
    setActionId(id)
    try {
      await escalateClawback(id)
      setClawbacks(prev => prev.map(c => c.id === id ? { ...c, status: 'escalated' } : c))
    } catch {
      // silently fail
    } finally {
      setActionId(null)
    }
  }

  const eligible = clawbacks.filter(c => c.outstandingPesewas < WRITEOFF_THRESHOLD && c.daysOutstanding >= WRITEOFF_INACTIVE_DAYS)

  return (
     <PageGuard permission="view_payments">
    <div>
      <PageHeader title="Payments" subtitle="Financial transactions and payout management" />

      <Tabs defaultValue="clawbacks" className="mb-6">
        <TabsList className="bg-white">
          <TabsTrigger value="transactions" asChild><Link href="/payments/transactions">Transactions</Link></TabsTrigger>
          <TabsTrigger value="revenue" asChild><Link href="/payments/revenue">Revenue</Link></TabsTrigger>
          <TabsTrigger value="batch-payouts" asChild><Link href="/payments/batch-payouts">Batch Payouts</Link></TabsTrigger>
          <TabsTrigger value="clawbacks" asChild><Link href="/payments/clawbacks">Clawbacks</Link></TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="bg-amber-50 rounded-lg px-4 py-3 mb-5 text-sm text-amber-800 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <strong>Clawback rules:</strong> Amounts under GHS 100 inactive for 90+ days are eligible for write-off.
          Amounts over GHS 100 must be escalated for manual collection.
          Provider accounts with outstanding clawbacks cannot be deactivated.
        </div>
      </div>

      {eligible.length > 0 && (
        <Alert className="mb-4 bg-emerald-50">
          <AlertDescription className="text-emerald-700 text-sm">
            <strong>{eligible.length} clawback{eligible.length > 1 ? 's' : ''}</strong> under GHS 100 are inactive for 90+ days and eligible for write-off.
          </AlertDescription>
        </Alert>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Provider</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead>Original Dispute</TableHead>
              <TableHead>Initiated</TableHead>
              <TableHead className="text-right">Days Outstanding</TableHead>
              <TableHead>Eligible for Write-off</TableHead>
              <TableHead className="text-right">Actions</TableHead>
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
            ) : clawbacks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-gray-400 text-sm">No outstanding clawbacks</TableCell>
              </TableRow>
            ) : (
              clawbacks.map(cb => {
                const isEligible = cb.outstandingPesewas < WRITEOFF_THRESHOLD && cb.daysOutstanding >= WRITEOFF_INACTIVE_DAYS
                const isHighValue = cb.outstandingPesewas >= WRITEOFF_THRESHOLD
                const isActing = actionId === cb.id
                return (
                  <TableRow key={cb.id} className="hover:bg-gray-50">
                    <TableCell>
                      <p className="font-medium text-sm text-gray-900">{cb.providerName ?? '—'}</p>
                      <p className="text-xs text-gray-500">{cb.providerId}</p>
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold text-red-600">
                      {formatGhs(cb.outstandingPesewas)}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-slate-500">{cb.originalDisputeId ?? '—'}</TableCell>
                    <TableCell className="text-sm text-gray-500">{formatDate(cb.initiatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <span className={`text-sm font-medium ${cb.daysOutstanding >= 60 ? 'text-red-600' : cb.daysOutstanding >= 30 ? 'text-orange-500' : 'text-gray-500'}`}>
                        {cb.daysOutstanding}d
                      </span>
                    </TableCell>
                    <TableCell>
                      {isEligible
                        ? <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">✓ Eligible</span>
                        : isHighValue
                        ? <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Escalate Required</span>
                        : <span className="text-xs text-gray-500">Not yet</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 justify-end">
                        {isEligible && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 text-emerald-600 hover:bg-emerald-50"
                            disabled={isActing}
                            onClick={() => handleWriteOff(cb)}
                          >
                            {isActing ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Write Off'}
                          </Button>
                        )}
                        {isHighValue && cb.status !== 'escalated' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 text-red-600 hover:bg-red-50 gap-1"
                            disabled={isActing}
                            onClick={() => handleEscalate(cb.id)}
                          >
                            {isActing ? <Loader2 className="h-3 w-3 animate-spin" /> : <><ArrowUpRight className="h-3.5 w-3.5" /> Escalate</>}
                          </Button>
                        )}
                        {cb.status === 'escalated' && (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Escalated</span>
                        )}
                        <Button size="sm" variant="ghost" className="text-xs h-7 gap-1">
                          <Phone className="h-3.5 w-3.5" /> Contact
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
        <div className="px-4 py-3 bg-gray-50">
          <p className="text-xs text-gray-500">
            Total outstanding: <strong className="text-red-600">
              {loading ? '—' : formatGhs(totalOutstanding || clawbacks.reduce((s, c) => s + c.outstandingPesewas, 0))}
            </strong>
          </p>
        </div>
      </div>
    </div>
  </PageGuard>
  )
}
