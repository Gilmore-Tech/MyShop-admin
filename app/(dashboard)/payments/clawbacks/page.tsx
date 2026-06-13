'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageGuard } from '@/components/common/page-guard'
import { RoleGate } from '@/components/common/role-gate'
import Link from 'next/link'
import { AlertTriangle, Phone, ArrowUpRight, Loader2, ExternalLink, MessageSquare, Send, CheckCircle2 } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/common/page-header'
import { listClawbacks, writeOffClawback, escalateClawback, sendSmsToUser, type AdminClawback } from '@/lib/api'
import { ApiError } from '@/lib/api-client'

const WRITEOFF_THRESHOLD = 10000 // GHS 100 in pesewas
const WRITEOFF_INACTIVE_DAYS = 90

function formatGhs(pesewas: number) {
  return 'GHS ' + (pesewas / 100).toFixed(2)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatSource(source: string | null) {
  if (!source) return '-'
  return source
    .toLowerCase()
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function defaultReminderMessage(cb: AdminClawback) {
  const name = cb.providerName?.trim() || 'there'
  return `Hi ${name}, you have an outstanding MyShop balance of ${formatGhs(cb.outstandingPesewas)}. `
    + `Please settle it via the MyShop app to avoid restrictions on your account. Thank you.`
}

function formatStatus(status: string) {
  if (!status) return '-'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function statusBadgeClass(status: string) {
  const base = 'inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium '
  switch (status) {
    case 'settled':
      return base + 'bg-emerald-50 text-emerald-700'
    case 'partial':
      return base + 'bg-amber-50 text-amber-700'
    case 'escalated':
      return base + 'bg-red-50 text-red-700'
    default:
      return base + 'bg-gray-100 text-gray-600'
  }
}

export default function ClawbacksPage() {
  const [clawbacks, setClawbacks] = useState<AdminClawback[]>([])
  const [totalOutstanding, setTotalOutstanding] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionId, setActionId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  // Reminder SMS dialog state
  const [remindFor, setRemindFor] = useState<AdminClawback | null>(null)
  const [remindMessage, setRemindMessage] = useState('')
  const [remindSending, setRemindSending] = useState(false)
  const [remindError, setRemindError] = useState('')
  const [remindSent, setRemindSent] = useState(false)

  function openReminder(cb: AdminClawback) {
    setRemindFor(cb)
    setRemindMessage(defaultReminderMessage(cb))
    setRemindError('')
    setRemindSent(false)
  }

  function closeReminder() {
    if (remindSending) return
    setRemindFor(null)
  }

  async function handleSendReminder() {
    if (!remindFor || !remindMessage.trim()) return
    // SMS must target the provider's user-account id. `providerId` is the
    // drivers/artisans row id and is rejected by the backend user lookup (404).
    if (!remindFor.userId) {
      setRemindError('No user account is linked to this provider yet, so a reminder can’t be sent. Use Contact to reach them.')
      return
    }
    setRemindSending(true)
    setRemindError('')
    try {
      const res = await sendSmsToUser(remindFor.userId, remindMessage.trim())
      if (res.sent > 0) {
        setRemindSent(true)
      } else {
        setRemindError(res.reason ?? 'The SMS could not be delivered. Please try again.')
      }
    } catch (err) {
      setRemindError(err instanceof ApiError ? err.message : 'Failed to send the reminder.')
    } finally {
      setRemindSending(false)
    }
  }

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    listClawbacks()
      .then(res => {
        setClawbacks(res.items)
        setTotalOutstanding(res.totalOutstandingPesewas)
      })
      .catch(err => {
        setClawbacks([])
        setTotalOutstanding(0)
        if (err instanceof ApiError) {
          setError(err.status === 404
            ? 'Clawbacks endpoint is not yet available on the backend.'
            : err.message)
        } else {
          setError('Failed to load clawbacks.')
        }
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function handleWriteOff(clawback: AdminClawback) {
    setActionId(clawback.id)
    setActionError('')
    try {
      await writeOffClawback(clawback.id, 'Write-off approved: under GHS 100, inactive 90+ days')
      setClawbacks(prev => prev.filter(c => c.id !== clawback.id))
      setTotalOutstanding(prev => prev - clawback.outstandingPesewas)
    } catch (err) {
      setActionError(err instanceof ApiError
        ? `Write-off failed: ${err.message}`
        : 'Write-off failed. Please try again.')
    } finally {
      setActionId(null)
    }
  }

  async function handleEscalate(id: string) {
    setActionId(id)
    setActionError('')
    try {
      await escalateClawback(id)
      setClawbacks(prev => prev.map(c => c.id === id ? { ...c, status: 'escalated' } : c))
    } catch (err) {
      setActionError(err instanceof ApiError
        ? `Escalation failed: ${err.message}`
        : 'Escalation failed. Please try again.')
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

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Couldn&apos;t load clawbacks</p>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={load}>Retry</Button>
        </div>
      )}

      {actionError && (
        <div className="mb-4 bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3">{actionError}</div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Provider</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Original Amount</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead>Original Dispute</TableHead>
              <TableHead>Initiated</TableHead>
              <TableHead className="text-right">Days Outstanding</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(10)].map((_, j) => (
                    <TableCell key={j}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : clawbacks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-12 text-gray-400 text-sm">
                  {error ? 'No clawbacks to display while the endpoint is unavailable.' : 'No outstanding clawbacks'}
                </TableCell>
              </TableRow>
            ) : (
              clawbacks.map(cb => {
                const isEligible = cb.outstandingPesewas < WRITEOFF_THRESHOLD && cb.daysOutstanding >= WRITEOFF_INACTIVE_DAYS
                const isHighValue = cb.outstandingPesewas >= WRITEOFF_THRESHOLD
                const isActing = actionId === cb.id
                return (
                  <TableRow key={cb.id} className="hover:bg-gray-50">
                    <TableCell>
                      <p className="font-medium text-sm text-gray-900">{cb.providerName ?? '-'}</p>
                      <p className="text-xs text-gray-500 font-mono">{cb.providerId.slice(-12).toUpperCase()}</p>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">{formatSource(cb.source)}</TableCell>
                    <TableCell className="text-right text-sm text-gray-700">{formatGhs(cb.amountPesewas)}</TableCell>
                    <TableCell className="text-right text-sm text-emerald-600">{formatGhs(cb.paidAmountPesewas)}</TableCell>
                    <TableCell className="text-right text-sm font-semibold text-red-600">
                      {formatGhs(cb.outstandingPesewas)}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {cb.originalDisputeId
                        ? (
                          <Link
                            href={`/disputes?search=${encodeURIComponent(cb.originalDisputeId)}`}
                            className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                          >
                            {cb.originalDisputeId.slice(-8).toUpperCase()}
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        )
                        : <span className="text-slate-500">-</span>}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">{formatDate(cb.initiatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <span className={`text-sm font-medium ${cb.daysOutstanding >= 60 ? 'text-red-600' : cb.daysOutstanding >= 30 ? 'text-orange-500' : 'text-gray-500'}`}>
                        {cb.daysOutstanding}d
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={statusBadgeClass(cb.status)}>{formatStatus(cb.status)}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 justify-end">
                        {isEligible && (
                          <RoleGate permission="write_off_clawback">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7 text-emerald-600 hover:bg-emerald-50"
                              disabled={isActing}
                              onClick={() => handleWriteOff(cb)}
                            >
                              {isActing ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Write Off'}
                            </Button>
                          </RoleGate>
                        )}
                        {isHighValue && cb.status !== 'escalated' && (
                          <RoleGate permission="escalate_clawback">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7 text-red-600 hover:bg-red-50 gap-1"
                              disabled={isActing}
                              onClick={() => handleEscalate(cb.id)}
                            >
                              {isActing ? <Loader2 className="h-3 w-3 animate-spin" /> : <><ArrowUpRight className="h-3.5 w-3.5" /> Escalate</>}
                            </Button>
                          </RoleGate>
                        )}
                        {cb.status === 'escalated' && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">Escalated</span>
                        )}
                        <RoleGate permission="send_announcement">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 gap-1"
                            onClick={() => openReminder(cb)}
                            title={cb.providerName ? `Send ${cb.providerName} an SMS reminder` : 'Send an SMS reminder'}
                          >
                            <MessageSquare className="h-3.5 w-3.5" /> Remind
                          </Button>
                        </RoleGate>
                        <Button
                          asChild
                          size="sm"
                          variant="ghost"
                          className="text-xs h-7 gap-1"
                          title={cb.providerName ? `Open ${cb.providerName}'s profile to recover phone` : 'Open provider profile'}
                        >
                          <Link href={`/users/drivers?search=${encodeURIComponent(cb.providerName ?? cb.providerId)}`}>
                            <Phone className="h-3.5 w-3.5" /> Contact
                          </Link>
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

      <Dialog open={remindFor !== null} onOpenChange={o => { if (!o) closeReminder() }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-gray-900">Send debt reminder</DialogTitle>
            <DialogDescription className="text-xs text-gray-400">
              Sends an SMS to {remindFor?.providerName?.trim() || 'this provider'} about their outstanding balance of{' '}
              {remindFor ? formatGhs(remindFor.outstandingPesewas) : ''}.
            </DialogDescription>
          </DialogHeader>

          {remindSent ? (
            <div className="flex flex-col items-center text-center py-6 gap-2">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <p className="text-sm font-medium text-gray-900">Reminder sent</p>
              <p className="text-xs text-gray-500">The SMS has been delivered to the provider.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <Textarea
                value={remindMessage}
                onChange={e => setRemindMessage(e.target.value)}
                rows={5}
                maxLength={320}
                disabled={remindSending}
                className="resize-none text-sm"
                placeholder="Reminder message…"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">{remindMessage.length}/320 characters</p>
                <p className="text-xs text-gray-400">Sent via SMS</p>
              </div>
              {remindError && (
                <div className="bg-red-50 text-red-700 text-xs rounded-lg px-3 py-2">{remindError}</div>
              )}
            </div>
          )}

          <DialogFooter>
            {remindSent ? (
              <Button size="sm" onClick={closeReminder}>Done</Button>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={closeReminder} disabled={remindSending}>Cancel</Button>
                <Button size="sm" className="gap-1" onClick={handleSendReminder} disabled={remindSending || !remindMessage.trim()}>
                  {remindSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Send reminder
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  </PageGuard>
  )
}
