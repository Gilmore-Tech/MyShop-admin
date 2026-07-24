'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, BellRing, Loader2, RefreshCw } from 'lucide-react'
import { PageGuard } from '@/components/common/page-guard'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ApiError } from '@/lib/api-client'
import { listWebhookFailures, type WebhookFailure } from '@/lib/api'

const LIMIT = 50

function formatDateTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'GMT', timeZoneName: 'short',
  })
}

function codeLabel(value: string | null) {
  return value ? value.replaceAll('_', ' ') : 'Unknown processing failure'
}

export default function WebhookFailuresPage() {
  const [items, setItems] = useState<WebhookFailure[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    listWebhookFailures({ page, limit: LIMIT })
      .then(result => {
        setItems(result.items)
        setTotal(result.total)
        setTotalPages(Math.max(1, result.totalPages))
      })
      .catch(err => {
        setItems([])
        setTotal(0)
        setTotalPages(1)
        setError(err instanceof ApiError ? err.message : 'Failed to load webhook failures.')
      })
      .finally(() => setLoading(false))
  }, [page])

  useEffect(() => { load() }, [load])

  return (
    <PageGuard permission="view_payments">
      <div>
        <PageHeader title="Payments" subtitle="See money received, money paid out, refunds, and debts" />

        <Tabs defaultValue="webhook-failures" className="mb-6">
          <TabsList className="bg-white">
            <TabsTrigger value="transactions" asChild><Link href="/payments/transactions">Payment Activity</Link></TabsTrigger>
            <TabsTrigger value="revenue" asChild><Link href="/payments/revenue">Money Summary</Link></TabsTrigger>
            <TabsTrigger value="batch-payouts" asChild><Link href="/payments/batch-payouts">Provider Payments</Link></TabsTrigger>
            <TabsTrigger value="clawbacks" asChild><Link href="/payments/clawbacks">Money Owed</Link></TabsTrigger>
            <TabsTrigger value="webhook-failures" asChild><Link href="/payments/webhook-failures">Payment Errors</Link></TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold">Payment events that need a manual check</p>
              <p className="mt-1 text-xs leading-5 text-amber-800">
                These Paystack payment updates could not be completed automatically. This page
                only shows what needs attention; it does not retry or move any money. Sensitive
                payment details remain hidden.
              </p>
            </div>
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-gray-500">
            {total} event{total === 1 ? '' : 's'} requiring review
          </p>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">Couldn&apos;t load webhook failures</p>
              <p className="mt-0.5 text-xs">{error}</p>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={load}>Retry</Button>
          </div>
        )}

        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead>Received</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Reason code</TableHead>
                <TableHead className="text-right">Processing attempts</TableHead>
                <TableHead>Operator alert</TableHead>
                <TableHead>Event ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [...Array(6)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(6)].map((_, j) => (
                      <TableCell key={j}><div className="h-4 animate-pulse rounded bg-gray-100" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-sm text-gray-400">
                    {error ? 'No events to display while the endpoint is unavailable.' : 'No webhook failures require review.'}
                  </TableCell>
                </TableRow>
              ) : (
                items.map(item => (
                  <TableRow key={item.id} className="hover:bg-gray-50">
                    <TableCell className="whitespace-nowrap text-sm text-gray-600">{formatDateTime(item.receivedAt)}</TableCell>
                    <TableCell>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700">{item.eventType}</span>
                    </TableCell>
                    <TableCell className="max-w-72 text-xs font-medium text-red-700">{codeLabel(item.lastErrorCode)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{item.attemptCount}</TableCell>
                    <TableCell>
                      <div className="flex items-start gap-1.5 text-xs">
                        <BellRing className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${item.adminAlertedAt ? 'text-emerald-600' : 'text-amber-600'}`} />
                        <div>
                          <p className={item.adminAlertedAt ? 'font-medium text-emerald-700' : 'font-medium text-amber-700'}>
                            {item.adminAlertedAt ? 'Delivered' : 'Pending retry'}
                          </p>
                          <p className="text-gray-500">
                            {item.adminAlertedAt
                              ? formatDateTime(item.adminAlertedAt)
                              : `${item.adminAlertAttempts} attempt${item.adminAlertAttempts === 1 ? '' : 's'}`}
                          </p>
                          {!item.adminAlertedAt && item.adminAlertLastError && (
                            <p className="mt-0.5 text-amber-700">{codeLabel(item.adminAlertLastError)}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-48 break-all font-mono text-xs text-gray-500">{item.id}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-500">
              {loading ? <Loader2 className="inline h-3 w-3 animate-spin" /> : `Page ${page} of ${totalPages}`}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage(value => value + 1)}>Next</Button>
            </div>
          </div>
        </div>
      </div>
    </PageGuard>
  )
}
