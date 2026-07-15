'use client'

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { PageGuard } from '@/components/common/page-guard'
import { RoleGate } from '@/components/common/role-gate'
import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  CalendarDays,
  Car,
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  Loader2,
  MessageSquare,
  Send,
  Star,
  User,
  WalletCards,
  Wrench,
} from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { PageHeader } from '@/components/common/page-header'
import {
  listClawbacks,
  writeOffClawback,
  escalateClawback,
  sendSmsToUser,
  getUser,
  listRides,
  listArtisanJobs,
  type AdminClawback,
  type PlatformUser,
} from '@/lib/api'
import { ApiError } from '@/lib/api-client'

const WRITEOFF_THRESHOLD = 10000 // GHS 100 in pesewas
const WRITEOFF_INACTIVE_DAYS = 90

function formatGhs(pesewas: number) {
  return 'GHS ' + (pesewas / 100).toFixed(2)
}

function formatDate(iso: string) {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

type BalanceSourceKind = 'cash_commission' | 'refund_recovery' | 'manual' | 'write_off' | 'other'

const SOURCE_FILTERS: Array<{ value: BalanceSourceKind | 'all'; label: string }> = [
  { value: 'all', label: 'All balances' },
  { value: 'cash_commission', label: 'Cash commission owed' },
  { value: 'refund_recovery', label: 'Refund recoveries' },
  { value: 'manual', label: 'Manual balances' },
  { value: 'write_off', label: 'Write-offs' },
  { value: 'other', label: 'Other' },
]

const SOURCE_DETAILS: Record<BalanceSourceKind, { label: string; short: string; description: string }> = {
  cash_commission: {
    label: 'Cash commission owed',
    short: 'Cash commission',
    description: 'Commission MyShop is owed from cash-paid bookings.',
  },
  refund_recovery: {
    label: 'Refund recovery',
    short: 'Refund recovery',
    description: 'Refund or dispute amount MyShop is recovering from a provider.',
  },
  manual: {
    label: 'Manual balance',
    short: 'Manual',
    description: 'Balance added manually by finance or ops.',
  },
  write_off: {
    label: 'Write-off adjustment',
    short: 'Write-off',
    description: 'Balance adjusted through a write-off flow.',
  },
  other: {
    label: 'Other provider balance',
    short: 'Other',
    description: 'Provider balance from an uncategorized source.',
  },
}

function sourceKey(source: string | null) {
  return (source ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function sourceKind(source: string | null): BalanceSourceKind {
  const key = sourceKey(source)
  if (key.includes('cash') || key.includes('commission')) return 'cash_commission'
  if (key.includes('dispute') || key.includes('refund') || key.includes('clawback')) return 'refund_recovery'
  if (key.includes('manual')) return 'manual'
  if (key.includes('write')) return 'write_off'
  return 'other'
}

function sourceLabel(source: string | null) {
  return SOURCE_DETAILS[sourceKind(source)].label
}

function sourceDescription(source: string | null) {
  return SOURCE_DETAILS[sourceKind(source)].description
}

function defaultReminderMessage(cb: AdminClawback) {
  const name = cb.providerName?.trim() || 'there'
  return `Hi ${name}, you have an outstanding MyShop balance of ${formatGhs(cb.outstandingPesewas)}. `
    + `Please settle it via the MyShop app to avoid restrictions on your account. Thank you.`
}

function formatStatus(status: string) {
  if (!status) return '-'
  if (status === 'mixed') return 'Multiple'
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
    case 'mixed':
      return base + 'bg-slate-100 text-slate-700'
    default:
      return base + 'bg-gray-100 text-gray-600'
  }
}

type AggregatedClawback = AdminClawback & {
  clawbackCount: number
  clawbacks: AdminClawback[]
  originalDisputeIds: string[]
  sources: string[]
  statuses: string[]
}

function groupKeyForClawback(clawback: AdminClawback) {
  if (clawback.userId.trim()) return `user:${clawback.userId.trim()}`
  if (clawback.providerId.trim()) return `provider:${clawback.providerId.trim()}`
  if (clawback.providerName?.trim()) return `provider-name:${clawback.providerName.trim().toLowerCase()}`
  return `clawback:${clawback.id}`
}

function addUnique(values: string[], value: string | null | undefined) {
  const normalized = value?.trim()
  if (normalized && !values.includes(normalized)) values.push(normalized)
}

function olderDate(current: string, next: string) {
  if (!current) return next
  if (!next) return current

  const currentTime = new Date(current).getTime()
  const nextTime = new Date(next).getTime()
  if (Number.isNaN(currentTime)) return next
  if (Number.isNaN(nextTime)) return current

  return nextTime < currentTime ? next : current
}

function aggregateStatus(statuses: string[]) {
  if (statuses.length === 0) return 'outstanding'
  if (statuses.length === 1) return statuses[0]
  return 'mixed'
}

function aggregateClawbacks(clawbacks: AdminClawback[]): AggregatedClawback[] {
  const groups = new Map<string, AggregatedClawback>()

  clawbacks.forEach(clawback => {
    const key = groupKeyForClawback(clawback)
    const existing = groups.get(key)

    if (!existing) {
      groups.set(key, {
        ...clawback,
        id: key,
        source: clawback.source,
        originalDisputeId: clawback.originalDisputeId,
        clawbackCount: 1,
        clawbacks: [clawback],
        originalDisputeIds: clawback.originalDisputeId ? [clawback.originalDisputeId] : [],
        sources: clawback.source ? [clawback.source] : [],
        statuses: clawback.status ? [clawback.status] : [],
      })
      return
    }

    existing.amountPesewas += clawback.amountPesewas
    existing.paidAmountPesewas += clawback.paidAmountPesewas
    existing.outstandingPesewas += clawback.outstandingPesewas
    existing.initiatedAt = olderDate(existing.initiatedAt, clawback.initiatedAt)
    existing.daysOutstanding = Math.max(existing.daysOutstanding, clawback.daysOutstanding)
    existing.clawbackCount += 1
    existing.clawbacks.push(clawback)

    if (!existing.providerName && clawback.providerName) existing.providerName = clawback.providerName
    if (!existing.providerId && clawback.providerId) existing.providerId = clawback.providerId
    if (!existing.userId && clawback.userId) existing.userId = clawback.userId

    addUnique(existing.originalDisputeIds, clawback.originalDisputeId)
    addUnique(existing.sources, clawback.source)
    addUnique(existing.statuses, clawback.status)
  })

  return Array.from(groups.values()).map(group => ({
    ...group,
    source: group.sources.length === 1 ? group.sources[0] : null,
    originalDisputeId: group.originalDisputeIds.length === 1 ? group.originalDisputeIds[0] : null,
    status: aggregateStatus(group.statuses),
  }))
}

function sourceSummary(sources: string[]) {
  if (sources.length === 0) return 'Unknown source'
  if (sources.length === 1) return sourceLabel(sources[0])

  const kinds = Array.from(new Set(sources.map(sourceKind)))
  if (kinds.length === 1) {
    return `${SOURCE_DETAILS[kinds[0]].short} (${sources.length} entries)`
  }
  return `${kinds.length} source types`
}

type ProviderRole = 'driver' | 'artisan' | 'provider'

type ProviderStats = {
  role: ProviderRole
  totalCompleted: number | null
  completedToday: number | null
  rating: number | null
  ratingCount: number
  cancellations30d: number | null
  balanceEntries: number
  totalOriginalPesewas: number
  totalRecoveredPesewas: number
  totalOwedPesewas: number
  cashCommissionOwedPesewas: number
  refundRecoveryOwedPesewas: number
  manualOwedPesewas: number
  oldestBalanceDays: number
  todayLookupFailed: boolean
}

function localDateForApi() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatNumber(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '-'
  return value.toLocaleString()
}

function formatRating(value: number | null | undefined, ratingCount: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return '-'
  return `${Number(value).toFixed(1)} (${formatNumber(ratingCount ?? 0)})`
}

function formatText(value: string | number | boolean | null | undefined) {
  if (value == null || value === '') return '-'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function formatKm(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '-'
  return `${value.toLocaleString()} km`
}

function formatShortId(value: string | null | undefined) {
  if (!value?.trim()) return '-'
  return value.trim().slice(-12).toUpperCase()
}

function formatVehicle(user: PlatformUser | null) {
  const vehicle = user?.driver
  if (!vehicle) return '-'
  const name = [vehicle.vehicleColor, vehicle.vehicleYear, vehicle.vehicleMake, vehicle.vehicleModel]
    .filter(Boolean)
    .join(' ')
  return name || '-'
}

function inferProviderRole(user: PlatformUser | null, providerId?: string): ProviderRole {
  const id = providerId?.trim()
  if (user?.driver && (!id || user.driver.id === id)) return 'driver'
  if (user?.artisan && (!id || user.artisan.id === id)) return 'artisan'
  if (user?.driver) return 'driver'
  if (user?.artisan) return 'artisan'
  return 'provider'
}

function providerRoleLabel(role: ProviderRole) {
  switch (role) {
    case 'driver':
      return 'Driver'
    case 'artisan':
      return 'Artisan'
    default:
      return 'Provider'
  }
}

function providerDirectoryPath(role: ProviderRole, user?: PlatformUser | null) {
  if (role === 'driver' || user?.roles.includes('driver')) return '/users/drivers'
  if (role === 'artisan' || user?.roles.includes('artisan')) return '/users/artisans'
  return '/users/drivers'
}

function balanceOwedByKind(balance: AggregatedClawback, kind: BalanceSourceKind) {
  return balance.clawbacks.reduce((sum, item) => (
    sourceKind(item.source) === kind ? sum + item.outstandingPesewas : sum
  ), 0)
}

function buildProviderStats(
  balance: AggregatedClawback,
  user: PlatformUser | null,
  completedToday: number | null,
  todayLookupFailed: boolean,
): ProviderStats {
  const role = inferProviderRole(user, balance.providerId)
  const provider = role === 'driver' ? user?.driver : role === 'artisan' ? user?.artisan : null

  return {
    role,
    totalCompleted: role === 'driver'
      ? user?.driver?.completedRidesCount ?? null
      : role === 'artisan'
        ? user?.artisan?.completedJobsCount ?? null
        : null,
    completedToday,
    rating: provider?.avgRating ?? null,
    ratingCount: provider?.ratingCount ?? 0,
    cancellations30d: provider?.cancellationCount30d ?? null,
    balanceEntries: balance.clawbackCount,
    totalOriginalPesewas: balance.amountPesewas,
    totalRecoveredPesewas: balance.paidAmountPesewas,
    totalOwedPesewas: balance.outstandingPesewas,
    cashCommissionOwedPesewas: balanceOwedByKind(balance, 'cash_commission'),
    refundRecoveryOwedPesewas: balanceOwedByKind(balance, 'refund_recovery'),
    manualOwedPesewas: balanceOwedByKind(balance, 'manual'),
    oldestBalanceDays: balance.daysOutstanding,
    todayLookupFailed,
  }
}

function providerSearchTerm(balance: AggregatedClawback, user: PlatformUser | null) {
  return (
    balance.providerId?.trim() ||
    balance.providerName?.trim() ||
    user?.phone?.trim() ||
    user?.fullName?.trim() ||
    ''
  )
}

async function fetchCompletedToday(
  balance: AggregatedClawback,
  user: PlatformUser | null,
  role: ProviderRole,
) {
  if (role !== 'driver' && role !== 'artisan') return null
  const search = providerSearchTerm(balance, user)
  if (!search) return null

  const today = localDateForApi()
  if (role === 'driver') {
    const res = await listRides({ status: 'completed', search, from: today, to: today, page: 1, limit: 1 })
    return res.total ?? 0
  }

  const res = await listArtisanJobs({ status: 'completed', search, from: today, to: today, page: 1, limit: 1 })
  return res.total ?? 0
}

export default function ProviderBalancesPage() {
  const [clawbacks, setClawbacks] = useState<AdminClawback[]>([])
  const [totalOutstanding, setTotalOutstanding] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionId, setActionId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [sourceFilter, setSourceFilter] = useState<BalanceSourceKind | 'all'>('all')
  const [detailFor, setDetailFor] = useState<AggregatedClawback | null>(null)
  const [detailUser, setDetailUser] = useState<PlatformUser | null>(null)
  const [detailStats, setDetailStats] = useState<ProviderStats | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

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

  function closeProviderDetails() {
    setDetailFor(null)
    setDetailUser(null)
    setDetailStats(null)
    setDetailError('')
    setDetailLoading(false)
  }

  async function openProviderDetails(balance: AggregatedClawback) {
    setDetailFor(balance)
    setDetailUser(null)
    setDetailStats(buildProviderStats(balance, null, null, false))
    setDetailError('')

    const userId = balance.userId?.trim()
    if (!userId) {
      setDetailError('Provider profile unavailable because this balance is not linked to a user account yet.')
      return
    }

    setDetailLoading(true)
    try {
      const user = await getUser(userId)
      const role = inferProviderRole(user, balance.providerId)
      let completedToday: number | null = null
      let todayLookupFailed = false

      try {
        completedToday = await fetchCompletedToday(balance, user, role)
      } catch {
        todayLookupFailed = true
      }

      setDetailUser(user)
      setDetailStats(buildProviderStats(balance, user, completedToday, todayLookupFailed))
      setDetailError(todayLookupFailed
        ? 'Profile loaded, but today’s completed booking count could not be loaded.'
        : '')
    } catch (err) {
      setDetailUser(null)
      setDetailStats(buildProviderStats(balance, null, null, false))
      setDetailError(err instanceof ApiError ? err.message : 'Failed to load provider details.')
    } finally {
      setDetailLoading(false)
    }
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
            ? 'Provider balance endpoint is not yet available on the backend.'
            : err.message)
        } else {
          setError('Failed to load provider balances.')
        }
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const balanceTotals = useMemo(() => {
    const base: Record<BalanceSourceKind, number> = {
      cash_commission: 0,
      refund_recovery: 0,
      manual: 0,
      write_off: 0,
      other: 0,
    }
    clawbacks.forEach(c => {
      base[sourceKind(c.source)] += c.outstandingPesewas
    })
    return base
  }, [clawbacks])

  const filteredClawbacks = useMemo(
    () => sourceFilter === 'all' ? clawbacks : clawbacks.filter(c => sourceKind(c.source) === sourceFilter),
    [clawbacks, sourceFilter],
  )
  const aggregatedClawbacks = useMemo(() => aggregateClawbacks(filteredClawbacks), [filteredClawbacks])
  const displayedOutstanding = aggregatedClawbacks.reduce((sum, c) => sum + c.outstandingPesewas, 0)
  const allOutstanding = totalOutstanding || clawbacks.reduce((sum, c) => sum + c.outstandingPesewas, 0)

  async function handleWriteOff(clawback: AggregatedClawback) {
    setActionId(clawback.id)
    setActionError('')
    const ids = new Set(clawback.clawbacks.map(c => c.id))
    try {
      await Promise.all(clawback.clawbacks.map(c => (
        writeOffClawback(c.id, 'Write-off approved: under GHS 100, inactive 90+ days')
      )))
      setClawbacks(prev => prev.filter(c => !ids.has(c.id)))
      setTotalOutstanding(prev => Math.max(0, prev - clawback.outstandingPesewas))
    } catch (err) {
      setActionError(err instanceof ApiError
        ? `Write-off failed: ${err.message}`
        : 'Write-off failed. Please try again.')
    } finally {
      setActionId(null)
    }
  }

  async function handleEscalate(clawback: AggregatedClawback) {
    setActionId(clawback.id)
    setActionError('')
    const targets = clawback.clawbacks.filter(c => c.status !== 'escalated')
    const ids = new Set(targets.map(c => c.id))
    try {
      await Promise.all(targets.map(c => escalateClawback(c.id)))
      setClawbacks(prev => prev.map(c => ids.has(c.id) ? { ...c, status: 'escalated' } : c))
    } catch (err) {
      setActionError(err instanceof ApiError
        ? `Escalation failed: ${err.message}`
        : 'Escalation failed. Please try again.')
    } finally {
      setActionId(null)
    }
  }

  const eligible = aggregatedClawbacks.filter(c => (
    c.outstandingPesewas > 0 &&
    c.outstandingPesewas < WRITEOFF_THRESHOLD &&
    c.daysOutstanding >= WRITEOFF_INACTIVE_DAYS
  ))

  return (
     <PageGuard permission="view_payments">
    <div>
      <PageHeader title="Payments" subtitle="Transactions, payouts, refund recoveries, and cash commission balances" />

      <Tabs defaultValue="provider-balances" className="mb-6">
        <TabsList className="bg-white">
          <TabsTrigger value="transactions" asChild><Link href="/payments/transactions">Transactions</Link></TabsTrigger>
          <TabsTrigger value="revenue" asChild><Link href="/payments/revenue">Revenue</Link></TabsTrigger>
          <TabsTrigger value="batch-payouts" asChild><Link href="/payments/batch-payouts">Batch Payouts</Link></TabsTrigger>
          <TabsTrigger value="provider-balances" asChild><Link href="/payments/provider-balances">Provider Balances</Link></TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="bg-amber-50 rounded-lg px-4 py-3 mb-5 text-sm text-amber-800 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <strong>Provider balance rules:</strong> Cash commission owed is commission from cash-paid bookings.
          Refund recoveries are amounts MyShop collects back after a customer refund or dispute. Both sources use the same write-off rules:
          under GHS 100 inactive for 90+ days can be written off; GHS 100+ should be escalated for manual collection.
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="bg-white rounded-lg shadow-sm px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">All provider balances</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{formatGhs(allOutstanding)}</p>
          <p className="text-xs text-gray-500 mt-1">All sources combined</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Cash commission owed</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{formatGhs(balanceTotals.cash_commission)}</p>
          <p className="text-xs text-gray-500 mt-1">Cash booking commission not remitted yet</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Refund recoveries</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{formatGhs(balanceTotals.refund_recovery)}</p>
          <p className="text-xs text-gray-500 mt-1">Refund or dispute recoveries from providers</p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Select value={sourceFilter} onValueChange={v => setSourceFilter(v as BalanceSourceKind | 'all')}>
          <SelectTrigger className="w-60 bg-white"><SelectValue placeholder="Balance source" /></SelectTrigger>
          <SelectContent>
            {SOURCE_FILTERS.map(filter => (
              <SelectItem key={filter.value} value={filter.value}>{filter.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-gray-500">
          Showing {filteredClawbacks.length} of {clawbacks.length} balance entr{filteredClawbacks.length === 1 ? 'y' : 'ies'}
        </p>
      </div>

      {eligible.length > 0 && (
        <Alert className="mb-4 bg-emerald-50">
          <AlertDescription className="text-emerald-700 text-sm">
            <strong>{eligible.length} provider balance{eligible.length > 1 ? 's' : ''}</strong> under GHS 100 are inactive for 90+ days and eligible for write-off.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Couldn&apos;t load provider balances</p>
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
              <TableHead>Balance source</TableHead>
              <TableHead className="text-right">Original balance</TableHead>
              <TableHead className="text-right">Recovered / paid</TableHead>
              <TableHead className="text-right">Still owed</TableHead>
              <TableHead>Linked disputes</TableHead>
              <TableHead>First opened</TableHead>
              <TableHead className="text-right">Oldest balance</TableHead>
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
            ) : aggregatedClawbacks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-12 text-gray-400 text-sm">
                  {error ? 'No provider balances to display while the endpoint is unavailable.' : 'No outstanding provider balances'}
                </TableCell>
              </TableRow>
            ) : (
              aggregatedClawbacks.map(cb => {
                const isEligible = cb.outstandingPesewas > 0 && cb.outstandingPesewas < WRITEOFF_THRESHOLD && cb.daysOutstanding >= WRITEOFF_INACTIVE_DAYS
                const isHighValue = cb.outstandingPesewas >= WRITEOFF_THRESHOLD
                const isActing = actionId === cb.id
                return (
                  <TableRow key={cb.id} className="hover:bg-gray-50">
                    <TableCell>
                      <p className="font-medium text-sm text-gray-900">{cb.providerName ?? '-'}</p>
                      <p className="text-xs text-gray-500 font-mono">{cb.providerId.slice(-12).toUpperCase()}</p>
                      {cb.clawbackCount > 1 && (
                        <p className="text-xs text-gray-500">{cb.clawbackCount} balance entries aggregated</p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600" title={cb.sources.map(sourceDescription).join(', ')}>
                      {sourceSummary(cb.sources)}
                    </TableCell>
                    <TableCell className="text-right text-sm text-gray-700">{formatGhs(cb.amountPesewas)}</TableCell>
                    <TableCell className="text-right text-sm text-emerald-600">{formatGhs(cb.paidAmountPesewas)}</TableCell>
                    <TableCell className="text-right text-sm font-semibold text-red-600">
                      {formatGhs(cb.outstandingPesewas)}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {cb.originalDisputeIds.length > 0
                        ? (
                          <div className="flex flex-col gap-1">
                            {cb.originalDisputeIds.slice(0, 2).map(disputeId => (
                              <Link
                                key={disputeId}
                                href={`/disputes?search=${encodeURIComponent(disputeId)}`}
                                className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                              >
                                {disputeId.slice(-8).toUpperCase()}
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            ))}
                            {cb.originalDisputeIds.length > 2 && (
                              <span className="text-xs text-slate-500">+{cb.originalDisputeIds.length - 2} more</span>
                            )}
                          </div>
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
                      <span className={statusBadgeClass(cb.status)} title={cb.statuses.map(formatStatus).join(', ')}>
                        {formatStatus(cb.status)}
                      </span>
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
                        {isHighValue && cb.clawbacks.some(c => c.status !== 'escalated') && (
                          <RoleGate permission="escalate_clawback">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7 text-red-600 hover:bg-red-50 gap-1"
                              disabled={isActing}
                              onClick={() => handleEscalate(cb)}
                            >
                              {isActing ? <Loader2 className="h-3 w-3 animate-spin" /> : <><ArrowUpRight className="h-3.5 w-3.5" /> Escalate</>}
                            </Button>
                          </RoleGate>
                        )}
                        {cb.status === 'escalated' && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">Escalated</span>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7 gap-1"
                          onClick={() => openProviderDetails(cb)}
                          title={cb.providerName ? `View ${cb.providerName}'s details and stats` : 'View provider details and stats'}
                        >
                          <User className="h-3.5 w-3.5" /> Details
                        </Button>
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
            Showing still owed: <strong className="text-red-600">
              {loading ? '—' : formatGhs(displayedOutstanding)}
            </strong>
            {sourceFilter !== 'all' && (
              <span> · All provider balances: <strong className="text-gray-700">{formatGhs(allOutstanding)}</strong></span>
            )}
            {sourceFilter === 'all' && (
              <span> · Cash commission: <strong className="text-gray-700">{formatGhs(balanceTotals.cash_commission)}</strong></span>
            )}
          </p>
        </div>
      </div>

      <ProviderDetailsSheet
        balance={detailFor}
        user={detailUser}
        stats={detailStats}
        loading={detailLoading}
        error={detailError}
        onClose={closeProviderDetails}
      />

      <Dialog open={remindFor !== null} onOpenChange={o => { if (!o) closeReminder() }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-gray-900">Send balance reminder</DialogTitle>
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

function ProviderDetailsSheet({
  balance,
  user,
  stats,
  loading,
  error,
  onClose,
}: {
  balance: AggregatedClawback | null
  user: PlatformUser | null
  stats: ProviderStats | null
  loading: boolean
  error: string
  onClose: () => void
}) {
  const role = stats?.role ?? inferProviderRole(user, balance?.providerId)
  const RoleIcon = role === 'artisan' ? Wrench : role === 'driver' ? Car : User
  const driver = role === 'driver' ? user?.driver : null
  const artisan = role === 'artisan' ? user?.artisan : null
  const name = balance?.providerName?.trim()
    || driver?.displayName
    || artisan?.displayName
    || user?.fullName
    || 'Provider details'
  const completedNoun = role === 'artisan' ? 'jobs' : role === 'driver' ? 'rides' : 'bookings'
  const search = balance ? providerSearchTerm(balance, user) : ''
  const profileHref = user && search
    ? `${providerDirectoryPath(role, user)}?search=${encodeURIComponent(search)}`
    : null

  return (
    <Sheet open={!!balance} onOpenChange={open => { if (!open) onClose() }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0">
        {balance && (
          <>
            <SheetHeader className="px-6 py-4 border-b border-gray-100">
              <SheetTitle className="text-base flex items-center gap-2 pr-8">
                <RoleIcon className="h-4 w-4 text-orange-500" />
                <span className="truncate">{name}</span>
                <span className="ml-auto shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                  {providerRoleLabel(role)}
                </span>
              </SheetTitle>
              <p className="font-mono text-xs text-gray-400 break-all">
                Provider {formatShortId(balance.providerId)} · User {formatShortId(balance.userId)}
              </p>
            </SheetHeader>

            <div className="px-6 py-5 space-y-5">
              {loading && (
                <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading provider profile and today&apos;s completed {completedNoun}.
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-start gap-3 rounded-lg bg-gray-50 p-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-gray-700 shadow-sm">
                  {initials(name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
                  <p className="text-xs text-gray-500">{formatText(user?.phone)} · {formatText(user?.email)}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Account {formatProviderStatus(user?.status)} · Joined {formatDate(user?.createdAt ?? '')}
                  </p>
                </div>
                {profileHref && (
                  <Button asChild size="sm" variant="outline" className="h-8 shrink-0 gap-1 text-xs">
                    <Link href={profileHref}>
                      <ExternalLink className="h-3.5 w-3.5" />
                      Profile
                    </Link>
                  </Button>
                )}
              </div>

              <DetailsSection title={`${providerRoleLabel(role)} statistics`} icon={<Activity className="h-3.5 w-3.5" />}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <StatTile
                    icon={<Activity className="h-4 w-4 text-blue-600" />}
                    label={`Total completed ${completedNoun}`}
                    value={formatNumber(stats?.totalCompleted)}
                  />
                  <StatTile
                    icon={<CalendarDays className="h-4 w-4 text-emerald-600" />}
                    label={`Completed today`}
                    value={stats?.todayLookupFailed ? 'Unavailable' : formatNumber(stats?.completedToday)}
                  />
                  <StatTile
                    icon={<Star className="h-4 w-4 text-amber-500" />}
                    label="Rating"
                    value={formatRating(stats?.rating, stats?.ratingCount)}
                  />
                  <StatTile
                    icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
                    label="Cancellations in 30 days"
                    value={formatNumber(stats?.cancellations30d)}
                  />
                </div>
              </DetailsSection>

              <DetailsSection title="Balance statistics" icon={<CircleDollarSign className="h-3.5 w-3.5" />}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <StatTile
                    icon={<CircleDollarSign className="h-4 w-4 text-red-600" />}
                    label="Still owed"
                    value={stats ? formatGhs(stats.totalOwedPesewas) : '-'}
                  />
                  <StatTile
                    icon={<WalletCards className="h-4 w-4 text-gray-600" />}
                    label="Original balance"
                    value={stats ? formatGhs(stats.totalOriginalPesewas) : '-'}
                  />
                  <StatTile
                    icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                    label="Recovered / paid"
                    value={stats ? formatGhs(stats.totalRecoveredPesewas) : '-'}
                  />
                  <StatTile
                    icon={<CalendarDays className="h-4 w-4 text-orange-500" />}
                    label="Oldest balance"
                    value={stats ? `${stats.oldestBalanceDays}d` : '-'}
                  />
                  <StatTile
                    icon={<WalletCards className="h-4 w-4 text-slate-600" />}
                    label="Cash commission owed"
                    value={stats ? formatGhs(stats.cashCommissionOwedPesewas) : '-'}
                  />
                  <StatTile
                    icon={<BadgeCheck className="h-4 w-4 text-violet-600" />}
                    label="Refund recoveries owed"
                    value={stats ? formatGhs(stats.refundRecoveryOwedPesewas) : '-'}
                  />
                  <StatTile
                    icon={<CircleDollarSign className="h-4 w-4 text-gray-600" />}
                    label="Manual balances owed"
                    value={stats ? formatGhs(stats.manualOwedPesewas) : '-'}
                  />
                  <StatTile
                    icon={<Activity className="h-4 w-4 text-gray-600" />}
                    label="Balance entries"
                    value={formatNumber(stats?.balanceEntries)}
                  />
                </div>
              </DetailsSection>

              <DetailsSection title="Provider profile" icon={<User className="h-3.5 w-3.5" />}>
                <DetailRow label="Full name" value={formatText(user?.fullName)} />
                <DetailRow label="Phone" value={user?.phone ? <a className="text-blue-600 hover:underline" href={`tel:${user.phone}`}>{user.phone}</a> : '-'} />
                <DetailRow label="Email" value={formatText(user?.email)} />
                <DetailRow label="Roles" value={user?.roles?.length ? user.roles.map(formatProviderStatus).join(', ') : '-'} />
                <DetailRow label="Account status" value={formatProviderStatus(user?.status)} />
                <DetailRow label="Registration" value={registrationLabel(user)} />
              </DetailsSection>

              {role === 'driver' && (
                <DetailsSection title="Driver operations" icon={<Car className="h-3.5 w-3.5" />}>
                  <DetailRow label="Display name" value={formatText(driver?.displayName)} />
                  <DetailRow label="Legal name" value={formatText(driver?.legalName)} />
                  <DetailRow label="Verification" value={formatProviderStatus(driver?.verificationStatus)} />
                  <DetailRow label="Online status" value={formatProviderStatus(driver?.onlineStatus)} />
                  <DetailRow label="Vehicle" value={formatVehicle(user)} />
                  <DetailRow label="Plate" value={formatText(driver?.vehiclePlate)} />
                  <DetailRow label="Licence number" value={formatText(driver?.licenceNumber)} />
                  <DetailRow label="Licence expiry" value={formatDate(driver?.licenceExpiry ?? '')} />
                  <DetailRow label="Service radius" value={formatKm(driver?.serviceRadius)} />
                  <DetailRow label="Payout method" value={formatProviderStatus(driver?.payoutMethod)} />
                  <DetailRow label="Payout preference" value={formatProviderStatus(driver?.payoutPreference)} />
                  <DetailRow label="Payout locked" value={formatText(driver?.payoutLocked)} />
                  <DetailRow label="Suspension" value={suspensionLabel(driver?.suspension)} />
                </DetailsSection>
              )}

              {role === 'artisan' && (
                <DetailsSection title="Artisan operations" icon={<Wrench className="h-3.5 w-3.5" />}>
                  <DetailRow label="Business name" value={formatText(artisan?.businessName)} />
                  <DetailRow label="Display name" value={formatText(artisan?.displayName)} />
                  <DetailRow label="Legal name" value={formatText(artisan?.legalName)} />
                  <DetailRow label="Verification" value={formatProviderStatus(artisan?.verificationStatus)} />
                  <DetailRow label="Online status" value={formatProviderStatus(artisan?.onlineStatus)} />
                  <DetailRow label="Categories" value={artisan?.categories?.filter(Boolean).join(', ') || '-'} />
                  <DetailRow label="Business phone" value={formatText(artisan?.businessPhone)} />
                  <DetailRow label="Business address" value={formatText(artisan?.businessAddress)} />
                  <DetailRow label="Service radius" value={formatKm(artisan?.serviceRadius)} />
                  <DetailRow label="Shop capacity" value={formatText(artisan?.shopCapacity)} />
                  <DetailRow label="Max concurrent jobs" value={formatNumber(artisan?.maxConcurrentJobs)} />
                  <DetailRow label="Payout method" value={formatProviderStatus(artisan?.payoutMethod)} />
                  <DetailRow label="Payout preference" value={formatProviderStatus(artisan?.payoutPreference)} />
                  <DetailRow label="Payout locked" value={formatText(artisan?.payoutLocked)} />
                  <DetailRow label="Suspension" value={suspensionLabel(artisan?.suspension)} />
                </DetailsSection>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function DetailsSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {icon}
        {title}
      </p>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function StatTile({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">{value}</p>
        </div>
        <div className="shrink-0 rounded-md bg-gray-50 p-1.5">{icon}</div>
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-2 last:border-0">
      <span className="text-xs uppercase tracking-wide text-gray-500">{label}</span>
      <span className="max-w-[65%] text-right text-sm text-gray-900 break-words">{value || '-'}</span>
    </div>
  )
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'P'
  return parts.slice(0, 2).map(part => part[0]?.toUpperCase()).join('')
}

function formatProviderStatus(value: string | null | undefined) {
  if (!value) return '-'
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase())
}

function registrationLabel(user: PlatformUser | null) {
  if (!user) return '-'
  if (user.registrationComplete === true) {
    return `Completed${user.registrationCompletedAt ? ` on ${formatDate(user.registrationCompletedAt)}` : ''}`
  }
  if (user.registrationComplete === false) return 'Incomplete'
  return '-'
}

function suspensionLabel(suspension: NonNullable<PlatformUser['driver']>['suspension'] | undefined) {
  if (!suspension) return 'None'
  const trigger = formatProviderStatus(suspension.triggerType)
  const reason = suspension.reason || 'Reason unavailable'
  const date = suspension.suspendedAt ? ` since ${formatDate(suspension.suspendedAt)}` : ''
  return `${trigger}: ${reason}${date}`
}
