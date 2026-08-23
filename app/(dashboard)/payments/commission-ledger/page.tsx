'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Download, Search, Landmark, Receipt, Wallet, HandCoins, CreditCard, ArrowUpRight } from 'lucide-react'
import { PageGuard } from '@/components/common/page-guard'
import { PageHeader } from '@/components/common/page-header'
import { PaymentsTabs } from '@/components/payments/payments-tabs'
import { StatCard } from '@/components/common/stat-card'
import { PeriodControls, usePeriod } from '@/components/common/period-controls'
import { ReportTable, type ReportColumn } from '@/components/common/report-table'
import { EmptyState } from '@/components/common/empty-state'
import { Pager } from '@/components/common/pager'
import { VerticalTabs, type Vertical } from '@/components/common/vertical-tabs'
import { StatusBadge } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { getCommissionLedger, type CommissionLedgerReport, type CommissionLedgerRow, type LedgerGroupBy } from '@/lib/api'
import { ApiError, userSafeAdminError } from '@/lib/api-client'
import { ledgerRowBalances } from '@/lib/commission-ledger-contract'
import { formatGhs } from '@/lib/money'
import { formatDate, formatDateTime } from '@/lib/format-date'
import { dateRangeLabel } from '@/lib/date-range'
import { paymentMethodLabel } from '@/lib/payment-labels'
import { exportTableCsv } from '@/lib/report-export'

const PAGE_SIZE = 50
type LedgerView = Extract<LedgerGroupBy, 'provider' | 'day'>

function providerTypeFor(vertical: Vertical): 'driver' | 'artisan' | undefined {
  if (vertical === 'rides') return 'driver'
  if (vertical === 'artisans') return 'artisan'
  return undefined
}

function roleLabel(type: 'driver' | 'artisan' | null): string {
  return type === 'driver' ? 'Driver' : type === 'artisan' ? 'Artisan' : 'Provider'
}

function bookingHref(row: CommissionLedgerRow): string | null {
  if (!row.bookingId) return null
  return row.bookingType === 'artisan_job' ? `/artisan-jobs/${row.bookingId}` : `/rides/${row.bookingId}`
}

function Money({ value, tone }: { value: number; tone?: 'muted' | 'strong' | 'debt' }) {
  const cls = tone === 'strong' ? 'font-semibold text-gray-900'
    : tone === 'debt' ? (value > 0 ? 'font-semibold text-red-600' : 'text-gray-400')
    : value === 0 ? 'text-gray-400' : 'text-gray-700'
  return <span className={cls}>{formatGhs(value)}</span>
}

export default function CommissionLedgerPage() {
  const period = usePeriod('this_month', 'day')
  const [view, setView] = useState<LedgerView>('provider')
  const [vertical, setVertical] = useState<Vertical>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [report, setReport] = useState<CommissionLedgerReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [unavailable, setUnavailable] = useState(false)
  const [selected, setSelected] = useState<CommissionLedgerRow | null>(null)
  // A deep link (?providerId=&providerType=) from Money Owed opens that provider directly.
  const [linkedProvider, setLinkedProvider] = useState<{ id: string; type: 'driver' | 'artisan' | null } | null>(null)
  const requestSequence = useRef(0)
  const { from, to } = period
  const providerType = providerTypeFor(vertical)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('providerId')
    const type = params.get('providerType')
    if (id) setLinkedProvider({ id, type: type === 'driver' || type === 'artisan' ? type : null })
  }, [])

  useEffect(() => { setPage(1) }, [from, to, view, vertical])

  const load = useCallback(async () => {
    const request = ++requestSequence.current
    setLoading(true)
    setError('')
    setUnavailable(false)
    try {
      const next = await getCommissionLedger({ from, to, groupBy: view, providerType, page, limit: PAGE_SIZE })
      if (request === requestSequence.current) setReport(next)
    } catch (err) {
      if (request !== requestSequence.current) return
      setReport(null)
      if (err instanceof ApiError && err.status === 404) setUnavailable(true)
      else setError(userSafeAdminError(err, 'Failed to load the commission ledger.'))
    } finally {
      if (request === requestSequence.current) setLoading(false)
    }
  }, [from, to, view, providerType, page])

  useEffect(() => { load() }, [load])

  const rows = useMemo(() => {
    const all = report?.rows ?? []
    if (view !== 'provider' || !search.trim()) return all
    const q = search.trim().toLowerCase()
    return all.filter(r => (r.fullName ?? '').toLowerCase().includes(q) || (r.phone ?? '').includes(q))
  }, [report, view, search])

  const totals = report?.totals
  const unbalanced = useMemo(() => rows.filter(r => !ledgerRowBalances(r)).length, [rows])

  const providerColumns: ReportColumn<CommissionLedgerRow>[] = [
    {
      key: 'provider', header: 'Provider', footer: 'Total',
      render: r => (
        <div className="min-w-[160px]">
          <p className="font-medium text-gray-900">{r.fullName ?? 'Name not provided'}</p>
          <p className="text-xs text-gray-500">{roleLabel(r.providerType)}{r.phone ? ` - ${r.phone}` : ''}</p>
        </div>
      ),
    },
    { key: 'bookings', header: 'Bookings', align: 'right', render: r => r.bookings.toLocaleString(), footer: totals?.bookings.toLocaleString() },
    { key: 'fares', header: 'Pre-promo fares', align: 'right', responsiveClassName: 'hidden xl:table-cell', render: r => <Money value={r.prePromoFaresPesewas} />, footer: totals ? formatGhs(totals.prePromoFaresPesewas) : undefined },
    { key: 'commission', header: 'Commission', align: 'right', render: r => <Money value={r.commissionPesewas} tone="strong" />, footer: totals ? formatGhs(totals.commissionPesewas) : undefined },
    { key: 'promo', header: 'Promo funded', align: 'right', responsiveClassName: 'hidden lg:table-cell', render: r => <Money value={r.promoSubsidyPesewas} />, footer: totals ? formatGhs(totals.promoSubsidyPesewas) : undefined },
    { key: 'netted', header: 'Netted vs promo', align: 'right', render: r => <Money value={r.commissionNettedAgainstPromoPesewas} />, footer: totals ? formatGhs(totals.commissionNettedAgainstPromoPesewas) : undefined },
    { key: 'debt', header: 'Cash debt', align: 'right', render: r => <Money value={r.cashCommissionOwedPesewas} tone="debt" />, footer: totals ? formatGhs(totals.cashCommissionOwedPesewas) : undefined },
    { key: 'paid', header: 'Paid', align: 'right', responsiveClassName: 'hidden lg:table-cell', render: r => <Money value={r.clawbackPaidPesewas} />, footer: totals ? formatGhs(totals.clawbackPaidPesewas) : undefined },
    { key: 'outstanding', header: 'Outstanding', align: 'right', render: r => <Money value={r.clawbackOutstandingPesewas} tone="debt" />, footer: totals ? formatGhs(totals.clawbackOutstandingPesewas) : undefined },
    { key: 'withheld', header: 'Withheld (digital)', align: 'right', responsiveClassName: 'hidden xl:table-cell', render: r => <Money value={r.digitalCommissionWithheldPesewas} />, footer: totals ? formatGhs(totals.digitalCommissionWithheldPesewas) : undefined },
  ]

  const dayColumns: ReportColumn<CommissionLedgerRow>[] = [
    { key: 'day', header: 'Settlement date', footer: 'Total', render: r => <span className="font-medium text-gray-900">{r.period ? formatDate(r.period) : '-'}</span> },
    { key: 'bookings', header: 'Bookings', align: 'right', render: r => r.bookings.toLocaleString(), footer: totals?.bookings.toLocaleString() },
    { key: 'commission', header: 'Commission', align: 'right', render: r => <Money value={r.commissionPesewas} tone="strong" />, footer: totals ? formatGhs(totals.commissionPesewas) : undefined },
    { key: 'netted', header: 'Netted vs promo', align: 'right', responsiveClassName: 'hidden md:table-cell', render: r => <Money value={r.commissionNettedAgainstPromoPesewas} />, footer: totals ? formatGhs(totals.commissionNettedAgainstPromoPesewas) : undefined },
    { key: 'recorded', header: 'Debt recorded', align: 'right', render: r => <Money value={r.clawbackRecordedPesewas} tone="debt" />, footer: totals ? formatGhs(totals.clawbackRecordedPesewas) : undefined },
    { key: 'paid', header: 'Paid', align: 'right', render: r => <Money value={r.clawbackPaidPesewas} />, footer: totals ? formatGhs(totals.clawbackPaidPesewas) : undefined },
    { key: 'written', header: 'Written off', align: 'right', responsiveClassName: 'hidden lg:table-cell', render: r => <Money value={r.clawbackWrittenOffPesewas} />, footer: totals ? formatGhs(totals.clawbackWrittenOffPesewas) : undefined },
    { key: 'outstanding', header: 'Outstanding', align: 'right', render: r => <Money value={r.clawbackOutstandingPesewas} tone="debt" />, footer: totals ? formatGhs(totals.clawbackOutstandingPesewas) : undefined },
    {
      key: 'link', header: '', align: 'right',
      render: r => r.period ? (
        <Link
          href={`/payments/clawbacks?from=${r.period.slice(0, 10)}&to=${r.period.slice(0, 10)}`}
          onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
        >
          Money Owed <ArrowUpRight className="h-3 w-3" />
        </Link>
      ) : null,
    },
  ]

  function exportCsv() {
    const headers = view === 'provider'
      ? ['Provider', 'Role', 'Phone', 'Bookings', 'Pre-promo fares (GHS)', 'Commission (GHS)', 'Relief (GHS)', 'Promo funded (GHS)', 'Netted vs promo (GHS)', 'Cash debt (GHS)', 'Paid (GHS)', 'Outstanding (GHS)', 'Withheld digital (GHS)']
      : ['Settlement date', 'Bookings', 'Commission (GHS)', 'Relief (GHS)', 'Promo funded (GHS)', 'Netted vs promo (GHS)', 'Debt recorded (GHS)', 'Paid (GHS)', 'Written off (GHS)', 'Outstanding (GHS)']
    const body = rows.map(r => view === 'provider'
      ? [r.fullName, roleLabel(r.providerType), r.phone, r.bookings, r.prePromoFaresPesewas / 100, r.commissionPesewas / 100, r.commissionReliefPesewas / 100, r.promoSubsidyPesewas / 100, r.commissionNettedAgainstPromoPesewas / 100, r.cashCommissionOwedPesewas / 100, r.clawbackPaidPesewas / 100, r.clawbackOutstandingPesewas / 100, r.digitalCommissionWithheldPesewas / 100]
      : [r.period, r.bookings, r.commissionPesewas / 100, r.commissionReliefPesewas / 100, r.promoSubsidyPesewas / 100, r.commissionNettedAgainstPromoPesewas / 100, r.clawbackRecordedPesewas / 100, r.clawbackPaidPesewas / 100, r.clawbackWrittenOffPesewas / 100, r.clawbackOutstandingPesewas / 100])
    exportTableCsv(`commission-ledger-${view}-${vertical}`, headers, body)
  }

  const caption = report
    ? `${dateRangeLabel(period.preset)} - ${report.total.toLocaleString()} ${view === 'provider' ? 'provider' : 'day'}${report.total === 1 ? '' : 's'}`
    : dateRangeLabel(period.preset)

  return (
    <PageGuard permission="view_payments">
      <div>
        <PageHeader
          title="Payments"
          subtitle="See money received, money paid out, refunds, and debts"
          actions={
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv} disabled={rows.length === 0}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          }
        />
        <PaymentsTabs active="commission-ledger" />

        <div className="mb-4">
          <h2 className="text-base font-semibold text-gray-900">Commission Ledger</h2>
          <p className="text-sm text-gray-500">
            The full platform commission on every settled booking, per provider, whether or not a promo applied. On cash bookings the promo MyShop funded is netted against the commission first; only the remainder becomes a debt the provider owes.
          </p>
        </div>

        <PeriodControls
          period={period}
          showGroupBy={false}
          onRefresh={load}
          loading={loading}
          caption={caption}
          extra={
            <>
              <div role="tablist" aria-label="Ledger view" className="inline-flex items-center h-9 rounded-lg bg-gray-100 p-[3px] gap-0.5">
                {([['provider', 'By provider'], ['day', 'Debtors by date']] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={view === value}
                    onClick={() => setView(value)}
                    className={`h-full px-3 rounded-md text-xs font-semibold transition-colors ${view === value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <VerticalTabs value={vertical} onChange={setVertical} />
              {view === 'provider' && (
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or phone" className="h-9 w-56 pl-8 bg-white" />
                </div>
              )}
            </>
          }
        />

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">Couldn&apos;t load the ledger</p>
              <p className="text-xs mt-0.5">{error}</p>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={load}>Retry</Button>
          </div>
        )}

        {unbalanced > 0 && (
          <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-4 py-2.5">
            {unbalanced} row{unbalanced === 1 ? '' : 's'} do not reconcile (commission - relief should equal netted + cash debt + withheld). Report this to engineering before relying on the figures.
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <StatCard icon={Receipt} label="Commission (gross)" value={totals ? formatGhs(totals.commissionPesewas) : '-'} sub="On pre-promo fares, before netting" loading={loading} />
          <StatCard icon={Wallet} label="Netted against promo" value={totals ? formatGhs(totals.commissionNettedAgainstPromoPesewas) : '-'} sub="Retained instead of collected; finance moves this wallet to bank" loading={loading} />
          <StatCard icon={HandCoins} label="Cash debt recorded" value={totals ? formatGhs(totals.cashCommissionOwedPesewas) : '-'} sub="Owed back by providers on cash bookings" loading={loading} />
          <StatCard icon={Landmark} label="Debt outstanding" value={totals ? formatGhs(totals.clawbackOutstandingPesewas) : '-'} sub={totals ? `${formatGhs(totals.clawbackPaidPesewas)} paid so far` : undefined} tone={totals && totals.clawbackOutstandingPesewas > 0 ? 'negative' : 'neutral'} loading={loading} />
          <StatCard icon={CreditCard} label="Withheld from payouts" value={totals ? formatGhs(totals.digitalCommissionWithheldPesewas) : '-'} sub="MoMo and card bookings" loading={loading} />
        </div>

        {view === 'provider' ? (
          <ReportTable<CommissionLedgerRow>
            columns={providerColumns}
            rows={rows}
            rowKey={r => r.key}
            loading={loading}
            showFooter
            minWidth={960}
            onRowClick={row => setSelected(row)}
            empty={unavailable
              ? <EmptyState variant="unavailable" title="The commission ledger is not available yet" description="The server has not been updated with this report. The page will populate automatically once it is deployed." />
              : <EmptyState title="No settled bookings in this period" description="Try a wider date range or another vertical." />}
            caption="Dated by settlement (GMT): when the booking's payment was recorded. Click a provider for the per-booking breakdown."
          />
        ) : (
          <ReportTable<CommissionLedgerRow>
            columns={dayColumns}
            rows={rows}
            rowKey={r => r.key}
            loading={loading}
            showFooter
            minWidth={880}
            empty={unavailable
              ? <EmptyState variant="unavailable" title="The commission ledger is not available yet" description="The server has not been updated with this report." />
              : <EmptyState title="No settled bookings in this period" />}
            caption="Same settlement-date basis as Payments - Money Owed, so a day's Debt recorded here equals that day's total there."
          />
        )}

        {report && report.total > PAGE_SIZE && (
          <Pager page={page} pageSize={PAGE_SIZE} total={report.total} onPage={setPage} />
        )}

        <ProviderBookingsSheet
          from={from}
          to={to}
          provider={selected
            ? { id: selected.providerId ?? '', type: selected.providerType, name: selected.fullName, phone: selected.phone }
            : linkedProvider
              ? { id: linkedProvider.id, type: linkedProvider.type, name: null, phone: null }
              : null}
          onClose={() => { setSelected(null); setLinkedProvider(null) }}
        />
      </div>
    </PageGuard>
  )
}

function ProviderBookingsSheet({ provider, from, to, onClose }: {
  provider: { id: string; type: 'driver' | 'artisan' | null; name: string | null; phone: string | null } | null
  from?: string
  to?: string
  onClose: () => void
}) {
  const [rows, setRows] = useState<CommissionLedgerRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const providerId = provider?.id ?? null

  useEffect(() => {
    if (!providerId) return
    let cancelled = false
    setLoading(true)
    setError('')
    getCommissionLedger({ from, to, groupBy: 'booking', providerId, limit: 100 })
      .then(result => { if (!cancelled) setRows(result.rows) })
      .catch(err => { if (!cancelled) { setRows([]); setError(userSafeAdminError(err, 'Failed to load bookings.')) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [providerId, from, to])

  const columns: ReportColumn<CommissionLedgerRow>[] = [
    {
      key: 'booking', header: 'Booking',
      render: r => {
        const href = bookingHref(r)
        const label = r.bookingType === 'artisan_job' ? 'Job' : 'Ride'
        return href ? <Link href={href} className="text-blue-600 hover:underline font-medium">{label} {r.bookingId?.slice(0, 8)}</Link> : <span>{label}</span>
      },
    },
    { key: 'settled', header: 'Settled', render: r => <span className="text-gray-600">{formatDateTime(r.settledAt)}</span> },
    { key: 'method', header: 'Method', render: r => <span className="text-gray-600">{r.paymentMethod ? paymentMethodLabel(r.paymentMethod) : '-'}</span> },
    { key: 'fare', header: 'Fare', align: 'right', render: r => <Money value={r.prePromoFaresPesewas} /> },
    { key: 'commission', header: 'Commission', align: 'right', render: r => <Money value={r.commissionPesewas} tone="strong" /> },
    { key: 'promo', header: 'Promo', align: 'right', render: r => <Money value={r.promoSubsidyPesewas} /> },
    { key: 'netted', header: 'Netted', align: 'right', render: r => <Money value={r.commissionNettedAgainstPromoPesewas} /> },
    { key: 'debt', header: 'Cash debt', align: 'right', render: r => <Money value={r.cashCommissionOwedPesewas} tone="debt" /> },
    { key: 'withheld', header: 'Withheld', align: 'right', render: r => <Money value={r.digitalCommissionWithheldPesewas} /> },
    { key: 'status', header: 'Debt status', render: r => r.clawbackStatus ? <StatusBadge status={r.clawbackStatus} /> : <span className="text-gray-400">-</span> },
  ]

  return (
    <Sheet open={Boolean(provider)} onOpenChange={open => { if (!open) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto p-0">
        {provider && (
          <>
            <SheetHeader className="border-b p-6">
              <SheetTitle>Commission by booking - {provider.name ?? roleLabel(provider.type)}</SheetTitle>
              <SheetDescription>
                {roleLabel(provider.type)}{provider.phone ? ` - ${provider.phone}` : ''} - settled {from && to ? `${formatDate(from)} to ${formatDate(to)}` : 'in the selected period'}
              </SheetDescription>
            </SheetHeader>
            <div className="p-6">
              {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
              <ReportTable<CommissionLedgerRow>
                columns={columns}
                rows={rows}
                rowKey={r => r.key}
                loading={loading}
                minWidth={900}
                empty={<EmptyState title="No settled bookings for this provider in the period" />}
                caption={rows.length >= 100 ? 'Showing the 100 most recent bookings. Narrow the date range to see older ones.' : undefined}
              />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
