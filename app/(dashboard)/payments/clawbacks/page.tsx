'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowUpRight, ExternalLink, Loader2, MessageSquareText, Phone } from 'lucide-react'
import { PageGuard } from '@/components/common/page-guard'
import { RoleGate } from '@/components/common/role-gate'
import { PageHeader } from '@/components/common/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PaymentsTabs } from '@/components/payments/payments-tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  escalateClawback,
  listAllClawbacks,
  sendDirectSms,
  writeOffClawback,
  type AdminClawback,
} from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { useDateRange } from '@/components/common/date-range-filter'
import { PageSizeSelect } from '@/components/common/table-controls'
import { ghanaDateKey, dateBasisCaption } from '@/lib/date-range'
import { groupClawbacksByProvider, type ProviderClawbackGroup } from '@/lib/clawback-groups'
import { paymentStatusLabel } from '@/lib/payment-labels'

const WRITEOFF_THRESHOLD = 10000
const WRITEOFF_INACTIVE_DAYS = 90

function formatGhs(pesewas: number) {
  return `GHS ${(pesewas / 100).toFixed(2)}`
}

function formatDate(iso: string) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Mobile-app role the debt belongs to. */
function providerRoleLabel(providerType: string | null) {
  const value = (providerType ?? '').toLowerCase()
  if (value.includes('driver')) return 'Driver'
  if (value.includes('artisan')) return 'Artisan'
  return 'Role not provided'
}

function plainLabel(value: string | null) {
  if (!value) return 'Not provided'
  return value.toLowerCase().split('_').map(word => word[0]?.toUpperCase() + word.slice(1)).join(' ')
}

function statusBadgeClass(status: string) {
  const base = 'inline-flex rounded-full px-2 py-0.5 text-xs font-medium '
  if (status === 'settled') return base + 'bg-emerald-50 text-emerald-700'
  if (status === 'partial' || status === 'mixed') return base + 'bg-amber-50 text-amber-700'
  if (status === 'reconciliation_required') return base + 'bg-violet-50 text-violet-700'
  if (status === 'escalated') return base + 'bg-red-50 text-red-700'
  return base + 'bg-gray-100 text-gray-600'
}

function isWriteOffEligible(debt: AdminClawback) {
  return debt.status !== 'reconciliation_required'
    && debt.outstandingPesewas > 0
    && debt.outstandingPesewas < WRITEOFF_THRESHOLD
    && debt.daysOutstanding >= WRITEOFF_INACTIVE_DAYS
}

/** Ghana calendar date of a record, or null when the backend sent no usable date. */
function recordDateKey(iso: string): string | null {
  if (!iso) return null
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? null : ghanaDateKey(parsed)
}

function isWithinRange(debt: AdminClawback, from?: string, to?: string) {
  const key = recordDateKey(debt.initiatedAt)
  if (!key) return false
  if (from && key < from) return false
  if (to && key > to) return false
  return true
}

export default function ClawbacksPage() {
  const [clawbacks, setClawbacks] = useState<AdminClawback[]>([])
  const [totalOutstanding, setTotalOutstanding] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionId, setActionId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(15)
  // Deep links from the Commission Ledger ("Debtors by date") carry ?from=&to=
  // so both pages show the same settlement day.
  const { from, to, control: dateControl } = useDateRange('all', { onChange: () => setSelectedGroupKey(null), readUrl: true })
  const dateFiltered = useMemo(
    () => (from || to ? clawbacks.filter(item => isWithinRange(item, from, to)) : clawbacks),
    [clawbacks, from, to],
  )
  // Records the backend sent without a date can't be placed in a range - say so
  // rather than dropping them silently.
  const undatedHidden = from || to ? clawbacks.filter(item => !recordDateKey(item.initiatedAt)).length : 0

  const groups = useMemo(() => groupClawbacksByProvider(dateFiltered), [dateFiltered])
  const selected = groups.find(group => (group.providerId || group.clawbacks[0].id) === selectedGroupKey) ?? null
  const eligibleCount = dateFiltered.filter(isWriteOffEligible).length
  const visibleOutstanding = groups.reduce((sum, group) => sum + group.outstandingPesewas, 0)

  // Everything is already in memory, so paging is a slice - the totals below the
  // table stay whole-set figures, not per-page ones.
  const totalPages = Math.max(1, Math.ceil(groups.length / limit))
  const currentPage = Math.min(page, totalPages)
  const pageGroups = groups.slice((currentPage - 1) * limit, currentPage * limit)
  const firstRowNumber = groups.length === 0 ? 0 : (currentPage - 1) * limit + 1
  const lastRowNumber = (currentPage - 1) * limit + pageGroups.length

  useEffect(() => { setPage(1) }, [from, to, limit])

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    listAllClawbacks({ from, to })
      .then(result => {
        setClawbacks(result.items)
        setTotalOutstanding(result.totalOutstandingPesewas)
        setTruncated(result.truncated)
      })
      .catch(err => {
        setClawbacks([])
        setTotalOutstanding(0)
        setTruncated(false)
        setError(err instanceof ApiError
          ? (err.status === 404 ? 'The money-owed service is not available yet.' : err.message)
          : 'Failed to load amounts owed.')
      })
      .finally(() => setLoading(false))
  }, [from, to])

  useEffect(() => { load() }, [load])

  async function handleWriteOff(debt: AdminClawback) {
    setActionId(debt.id)
    setActionError('')
    try {
      await writeOffClawback(debt.id, 'Approved for clearing: under GHS 100 and unpaid for at least 90 days')
      setClawbacks(previous => previous.filter(item => item.id !== debt.id))
      setTotalOutstanding(previous => Math.max(0, previous - debt.outstandingPesewas))
    } catch (err) {
      setActionError(err instanceof ApiError ? `Could not clear this amount: ${err.message}` : 'Could not clear this amount. Try again.')
    } finally {
      setActionId(null)
    }
  }

  async function handleEscalate(debt: AdminClawback) {
    setActionId(debt.id)
    setActionError('')
    try {
      await escalateClawback(debt.id)
      setClawbacks(previous => previous.map(item => item.id === debt.id ? { ...item, status: 'escalated' } : item))
    } catch (err) {
      setActionError(err instanceof ApiError ? `Could not send for follow-up: ${err.message}` : 'Could not send for follow-up. Try again.')
    } finally {
      setActionId(null)
    }
  }

  return (
    <PageGuard permission="view_payments">
      <div>
        <PageHeader
          title="Money owed"
          subtitle="Cash commission and refunds providers still owe MyShop"
          tabs={<PaymentsTabs />}
        />

        <div className="mb-5 flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>How old unpaid amounts are handled:</strong> amounts below GHS 100 that have been unpaid for 90 days can be cleared.
            Amounts of GHS 100 or more must be sent for manual follow-up.
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {dateControl}
          <PageSizeSelect value={limit} onChange={setLimit} />
          <p className="text-xs text-gray-500">Newest records first. Filters by the date each amount was recorded.</p>
        </div>

        {truncated && (
          <Alert className="mb-4 bg-amber-50">
            <AlertDescription className="text-sm text-amber-800">
              There are more records than this page can load at once. Narrow the date range to see the rest.
            </AlertDescription>
          </Alert>
        )}

        {eligibleCount > 0 && (
          <Alert className="mb-4 bg-emerald-50">
            <AlertDescription className="text-sm text-emerald-700">
              <strong>{eligibleCount} record{eligibleCount === 1 ? '' : 's'}</strong> can now be cleared.
            </AlertDescription>
          </Alert>
        )}

        {(error || actionError) && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">{error ? 'Could not load amounts owed' : 'Action not completed'}</p>
              <p className="mt-0.5 text-xs">{error || actionError}</p>
            </div>
            {error && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={load}>Retry</Button>}
          </div>
        )}

        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead>Person</TableHead>
                <TableHead className="text-right">Number of records</TableHead>
                <TableHead className="text-right">Total owed</TableHead>
                <TableHead className="text-right">Already paid</TableHead>
                <TableHead className="text-right">Still to pay</TableHead>
                <TableHead>Latest record</TableHead>
                <TableHead>Oldest record</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [...Array(5)].map((_, index) => (
                  <TableRow key={index}>
                    {[...Array(9)].map((__, cell) => <TableCell key={cell}><div className="h-4 animate-pulse rounded bg-gray-100" /></TableCell>)}
                  </TableRow>
                ))
              ) : groups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center text-sm text-gray-400">
                    {from || to ? 'No unpaid amounts recorded in this date range' : 'No unpaid amounts'}
                  </TableCell>
                </TableRow>
              ) : pageGroups.map(group => (
                <TableRow
                  key={group.providerId || group.clawbacks[0].id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => setSelectedGroupKey(group.providerId || group.clawbacks[0].id)}
                >
                  <TableCell>
                    <p className="text-sm font-medium text-gray-900">{group.providerName ?? 'Name not provided'}</p>
                    <p className="text-xs text-gray-500">
                      {providerRoleLabel(group.providerType)} - {group.providerPhone ?? 'Phone not provided'}
                    </p>
                  </TableCell>
                  <TableCell className="text-right text-sm">{group.clawbacks.length}</TableCell>
                  <TableCell className="text-right text-sm">{formatGhs(group.amountPesewas)}</TableCell>
                  <TableCell className="text-right text-sm text-emerald-600">{formatGhs(group.paidAmountPesewas)}</TableCell>
                  <TableCell className="text-right text-sm font-semibold text-red-600">{formatGhs(group.outstandingPesewas)}</TableCell>
                  <TableCell className="text-sm text-gray-700">{formatDate(group.latestInitiatedAt)}</TableCell>
                  <TableCell className="text-sm text-gray-500">{formatDate(group.initiatedAt)}</TableCell>
                  <TableCell><span className={statusBadgeClass(group.status)}>{paymentStatusLabel(group.status)}</span></TableCell>
                  <TableCell className="text-right"><Button size="sm" variant="outline">View records</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
            <p className="text-xs text-gray-500">
              {loading && <Loader2 className="inline h-3 w-3 animate-spin" />}
              {!loading && groups.length === 0 && 'Nothing to show'}
              {!loading && groups.length > 0 &&
                `Showing ${firstRowNumber}-${lastRowNumber} of ${groups.length} ${groups.length === 1 ? 'person' : 'people'} - ${dateFiltered.length} record${dateFiltered.length === 1 ? '' : 's'} - ${dateBasisCaption('Debts', 'recorded')}`}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Page {currentPage} of {totalPages}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1 || loading}
                onClick={() => setPage(currentPage - 1)}
              >Previous</Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages || loading}
                onClick={() => setPage(currentPage + 1)}
              >Next</Button>
            </div>
          </div>
          <div className="bg-gray-50 px-4 py-3 text-xs text-gray-500">
            Total still to be paid{from || to ? ' in this date range' : ''}
            {totalPages > 1 ? ', across all pages' : ''}:{' '}
            <strong className="text-red-600">
              {loading ? '-' : formatGhs(from || to ? visibleOutstanding : totalOutstanding || visibleOutstanding)}
            </strong>
            {undatedHidden > 0 && (
              <span className="ml-2 text-amber-700">
                {undatedHidden} record{undatedHidden === 1 ? '' : 's'} hidden - no start date recorded. Choose &quot;All time&quot; to see {undatedHidden === 1 ? 'it' : 'them'}.
              </span>
            )}
          </div>
        </div>

        <DebtDetailsSheet
          group={selected}
          actionId={actionId}
          onClose={() => setSelectedGroupKey(null)}
          onWriteOff={handleWriteOff}
          onEscalate={handleEscalate}
        />
      </div>
    </PageGuard>
  )
}

function DebtDetailsSheet({
  group,
  actionId,
  onClose,
  onWriteOff,
  onEscalate,
}: {
  group: ProviderClawbackGroup | null
  actionId: string | null
  onClose: () => void
  onWriteOff: (debt: AdminClawback) => void
  onEscalate: (debt: AdminClawback) => void
}) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [smsResult, setSmsResult] = useState('')
  const hasCollectibleDebt = Boolean(
    group?.clawbacks.some(debt =>
      debt.status !== 'reconciliation_required' && debt.outstandingPesewas > 0
    )
  )
  const hasReconciliation = Boolean(
    group?.clawbacks.some(debt => debt.status === 'reconciliation_required')
  )

  useEffect(() => {
    if (!group) return
    setMessage(hasCollectibleDebt
      ? `Hello ${group.providerName ?? 'there'}, this is a reminder that you still owe MyShop ${formatGhs(group.outstandingPesewas)}. Please make payment as soon as possible. Thank you.`
      : '')
    setSmsResult('')
  }, [group, hasCollectibleDebt])

  async function sendDebtSms() {
    if (!group?.providerPhone || !hasCollectibleDebt) return
    setSending(true)
    setSmsResult('')
    try {
      const result = await sendDirectSms(group.providerPhone, message.trim())
      setSmsResult(result.sent > 0 ? 'Message sent successfully.' : result.reason ?? 'The reminder could not be delivered.')
    } catch (err) {
      setSmsResult(err instanceof ApiError ? err.message : 'The reminder could not be sent. Try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Sheet open={Boolean(group)} onOpenChange={open => { if (!open) onClose() }}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-2xl">
        {group && (
          <>
            <SheetHeader className="border-b p-6">
              <SheetTitle>Amounts owed by {group.providerName ?? 'this person'}</SheetTitle>
              <p className="text-sm text-gray-500">{group.clawbacks.length} individual record{group.clawbacks.length === 1 ? '' : 's'}</p>
            </SheetHeader>

            <div className="space-y-6 p-6">
              <section className="rounded-lg border bg-gray-50 p-4">
                <h3 className="mb-3 text-sm font-semibold">Contact details</h3>
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <div><p className="text-xs text-gray-500">Name</p><p className="font-medium">{group.providerName ?? 'Not provided'}</p></div>
                  <div><p className="text-xs text-gray-500">Phone number</p><p className="flex items-center gap-1.5 font-medium"><Phone className="h-3.5 w-3.5" />{group.providerPhone ?? 'Not provided'}</p></div>
                  <div><p className="text-xs text-gray-500">Role on the app</p><p className="font-medium">{providerRoleLabel(group.providerType)}</p></div>
                  <div className="sm:col-span-2"><p className="text-xs text-gray-500">Provider ID</p><p className="break-all font-mono text-xs">{group.providerId || 'Not provided'}</p></div>
                </div>
                {group.providerId && (
                  <Link
                    href={`/payments/commission-ledger?providerId=${encodeURIComponent(group.providerId)}${group.providerType ? `&providerType=${encodeURIComponent(group.providerType.toLowerCase())}` : ''}`}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                  >
                    Open in Commission charges <ArrowUpRight className="h-3 w-3" />
                  </Link>
                )}
              </section>

              <section className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">{hasReconciliation ? 'Original recorded amount' : 'Total owed'}</p><p className="mt-1 font-semibold">{formatGhs(group.amountPesewas)}</p></div>
                <div className="rounded-lg bg-emerald-50 p-3"><p className="text-xs text-emerald-700">Already paid</p><p className="mt-1 font-semibold text-emerald-700">{formatGhs(group.paidAmountPesewas)}</p></div>
                <div className="rounded-lg bg-red-50 p-3"><p className="text-xs text-red-700">Still to pay</p><p className="mt-1 font-semibold text-red-700">{formatGhs(group.outstandingPesewas)}</p></div>
              </section>

              <section>
                <h3 className="mb-3 text-sm font-semibold">Individual records</h3>
                <div className="space-y-3">
                  {group.clawbacks.map(debt => {
                    const acting = actionId === debt.id
                    return (
                      <div key={debt.id} className="rounded-lg border p-4">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">{plainLabel(debt.source)}</p>
                            <p className="text-xs text-gray-500">
                              Recorded {formatDate(debt.initiatedAt)} - unpaid for {debt.daysOutstanding} days
                              {debt.settledAt ? ` - closed ${formatDate(debt.settledAt)}` : ''}
                            </p>
                            {debt.reason && <p className="mt-1 text-xs text-gray-500">Reason: {debt.reason}</p>}
                            {debt.status === 'reconciliation_required' && (
                              <p className="mt-2 rounded-md bg-violet-50 px-2 py-1.5 text-xs text-violet-800">
                                Collection is paused. Reconcile the provider payout and any amount already recovered before taking another debt action.
                              </p>
                            )}
                          </div>
                          <span className={statusBadgeClass(debt.status)}>{paymentStatusLabel(debt.status)}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div><p className="text-xs text-gray-500">Amount owed</p><p>{formatGhs(debt.amountPesewas)}</p></div>
                          <div><p className="text-xs text-gray-500">Paid</p><p className="text-emerald-600">{formatGhs(debt.paidAmountPesewas)}</p></div>
                          <div><p className="text-xs text-gray-500">Still to pay</p><p className="font-semibold text-red-600">{formatGhs(debt.outstandingPesewas)}</p></div>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          {debt.originalDisputeId ? (
                            <Link href={`/disputes?search=${encodeURIComponent(debt.originalDisputeId)}`} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                              View related complaint <ExternalLink className="h-3 w-3" />
                            </Link>
                          ) : <span />}
                          <div className="flex gap-2">
                            {isWriteOffEligible(debt) && (
                              <RoleGate permission="write_off_clawback">
                                <Button size="sm" variant="outline" disabled={acting} onClick={() => onWriteOff(debt)}>
                                  {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Clear amount'}
                                </Button>
                              </RoleGate>
                            )}
                            {debt.outstandingPesewas >= WRITEOFF_THRESHOLD && debt.status !== 'escalated' && (
                              <RoleGate permission="escalate_clawback">
                                <Button size="sm" variant="outline" className="text-red-600" disabled={acting} onClick={() => onEscalate(debt)}>
                                  {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><ArrowUpRight className="mr-1 h-3.5 w-3.5" />Send for follow-up</>}
                                </Button>
                              </RoleGate>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>

              {hasCollectibleDebt ? (
                <section className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-blue-950"><MessageSquareText className="h-4 w-4" />Send payment reminder by SMS</h3>
                  <Textarea className="mt-3 min-h-28 bg-white" value={message} onChange={event => setMessage(event.target.value)} maxLength={480} />
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className={`text-xs ${smsResult.includes('successfully') ? 'text-emerald-700' : 'text-red-600'}`}>{smsResult}</p>
                    <Button onClick={sendDebtSms} disabled={sending || !group.providerPhone || !message.trim()}>
                      {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquareText className="mr-2 h-4 w-4" />}
                      Send SMS reminder
                    </Button>
                  </div>
                  {!group.providerPhone && <p className="mt-2 text-xs text-amber-700">A phone number is required before a reminder can be sent.</p>}
                </section>
              ) : (
                <Alert className="border-violet-200 bg-violet-50 text-violet-900">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Payment reminders are disabled while these records require financial reconciliation.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
