'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Calendar, Loader2, Megaphone, Pencil, Plus, Send,
} from 'lucide-react'
import { PageGuard } from '@/components/common/page-guard'
import { PageHeader } from '@/components/common/page-header'
import { RoleGate } from '@/components/common/role-gate'
import { DataTable, type DataTableColumn } from '@/components/common/data-table'
import { FilterBar } from '@/components/common/filter-bar'
import { ErrorState } from '@/components/common/error-state'
import { EmptyState } from '@/components/common/empty-state'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  getCategories, getPromoCampaignSanityLimits, getRideCategories, listPromoCampaigns,
  submitPromoCampaign,
  type PromoCampaign, type PromoCampaignAudience, type PromoCampaignSanityLimits,
  type PromoCampaignStatus,
} from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { formatDate } from '@/lib/format-date'
import { formatGhs } from '@/lib/money'
import { isProviderAudience } from '@/lib/promo-campaign-contract'
import { CampaignAudienceBadge } from './_components/campaign-audience-badge'
import { CampaignDetailSheet } from './_components/campaign-detail-sheet'
import { CampaignFormDialog, type CategoryOption } from './_components/campaign-form-dialog'
import { CampaignStatusBadge } from './_components/campaign-status-badge'
import { SanityLimitsCard } from './_components/sanity-limits-card'

const STATUS_OPTIONS: Array<{ value: 'all' | PromoCampaignStatus; label: string }> = [
  { value: 'all',              label: 'All' },
  { value: 'draft',            label: 'Draft' },
  { value: 'pending_approval', label: 'Pending approval' },
  { value: 'approved',         label: 'Approved' },
  { value: 'paused',           label: 'Paused' },
  { value: 'ended',            label: 'Ended' },
  { value: 'budget_exhausted', label: 'Budget exhausted' },
]

const AUDIENCE_OPTIONS: Array<{ value: 'all' | PromoCampaignAudience; label: string }> = [
  { value: 'all',     label: 'All audiences' },
  { value: 'client',  label: 'Client' },
  { value: 'driver',  label: 'Drivers' },
  { value: 'artisan', label: 'Artisans' },
]

const TYPE_LABELS = {
  percentage_discount: '% off', fixed_discount: 'Flat off', commission_relief: 'Commission relief',
} as const
const SCOPE_LABELS = { ride: 'Rides', artisan_job: 'Artisan jobs', both: 'Rides & jobs' } as const

function describeValue(c: PromoCampaign): string {
  if (c.campaignType === 'commission_relief') {
    return `${c.discountValue}% commission relief${c.maxDiscountPesewas != null ? ` (max ${formatGhs(c.maxDiscountPesewas)})` : ''}`
  }
  return c.campaignType === 'percentage_discount'
    ? `${c.discountValue}%${c.maxDiscountPesewas != null ? ` (max ${formatGhs(c.maxDiscountPesewas)})` : ''}`
    : formatGhs(c.discountValue)
}

export default function PromoCampaignsPage() {
  const [campaigns, setCampaigns] = useState<PromoCampaign[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<'all' | PromoCampaignStatus>('all')
  const [audienceFilter, setAudienceFilter] = useState<'all' | PromoCampaignAudience>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const LIMIT = 20

  const [limits, setLimits] = useState<PromoCampaignSanityLimits | null>(null)
  const [limitsLoading, setLimitsLoading] = useState(true)
  const [rideCategories, setRideCategories] = useState<CategoryOption[]>([])
  const [serviceCategories, setServiceCategories] = useState<CategoryOption[]>([])

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<PromoCampaign | null>(null)
  const [openCampaignId, setOpenCampaignId] = useState<string | null>(null)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [rowError, setRowError] = useState('')

  useEffect(() => { setPage(1) }, [statusFilter, audienceFilter])

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const res = await listPromoCampaigns({
        status: statusFilter === 'all' ? undefined : statusFilter,
        audience: audienceFilter === 'all' ? undefined : audienceFilter,
        page,
        limit: LIMIT,
      })
      setCampaigns(res.campaigns)
      setTotal(res.total)
    } catch (err) {
      setCampaigns([])
      setTotal(0)
      if (err instanceof ApiError && err.status === 404) {
        setError('Promo campaigns endpoint is not yet available on the backend.')
      } else {
        setError(err instanceof ApiError ? err.message : 'Failed to load promo campaigns.')
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [statusFilter, audienceFilter, page])

  useEffect(() => { void load() }, [load])
  useAutoRefresh(() => void load(true))

  // Sanity limits + category options load once; both are non-fatal if missing.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const l = await getPromoCampaignSanityLimits()
        if (!cancelled) setLimits(l)
      } catch {
        /* card shows an unavailable state; backend still validates */
      } finally {
        if (!cancelled) setLimitsLoading(false)
      }
    })()
    void getRideCategories()
      .then(list => { if (!cancelled) setRideCategories(list.map(c => ({ id: c.id, name: c.name }))) })
      .catch(() => { /* picker falls back to "all tiers" */ })
    void getCategories()
      .then(list => {
        if (cancelled) return
        // Flatten one level of nesting so sub-categories are pickable too.
        const flat = list.flatMap(c => [c, ...(c.children ?? [])])
        setServiceCategories(flat.map(c => ({ id: c.id, name: c.name })))
      })
      .catch(() => { /* picker falls back to "all categories" */ })
    return () => { cancelled = true }
  }, [])

  async function handleQuickSubmit(campaign: PromoCampaign) {
    setSubmittingId(campaign.id)
    setRowError('')
    try {
      await submitPromoCampaign(campaign.id)
      await load(true)
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Failed to submit the campaign for approval.')
    } finally {
      setSubmittingId(null)
    }
  }

  const columns: DataTableColumn<PromoCampaign>[] = [
    {
      key: 'campaign', header: 'Campaign',
      render: c => (
        <div className="flex items-center gap-2.5">
          {c.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={c.bannerUrl}
              alt=""
              className="h-8 w-20 shrink-0 rounded border border-gray-100 object-cover"
            />
          ) : (
            <div className="flex h-8 w-20 shrink-0 items-center justify-center rounded border border-dashed border-gray-200">
              <Megaphone className="h-3.5 w-3.5 text-gray-200" />
            </div>
          )}
          <button
            className="max-w-[180px] truncate text-left text-sm font-semibold text-primary hover:underline"
            title={c.name}
            onClick={e => { e.stopPropagation(); setOpenCampaignId(c.id) }}
          >
            {c.name}
          </button>
        </div>
      ),
    },
    { key: 'audience', header: 'Audience', render: c => <CampaignAudienceBadge audience={c.audience} /> },
    {
      key: 'discount', header: 'Discount',
      render: c => (
        <>
          <p className="text-sm text-gray-800">{describeValue(c)}</p>
          <p className="mt-0.5 text-[10px] text-gray-400">
            {TYPE_LABELS[c.campaignType]}
            {c.newClientsOnly ? (isProviderAudience(c.audience) ? ' - new providers' : ' - new clients') : ''}
          </p>
        </>
      ),
    },
    { key: 'scope', header: 'Scope', render: c => <span className="text-xs text-gray-600">{SCOPE_LABELS[c.promoScope]}</span> },
    {
      key: 'window', header: 'Window',
      render: c => (
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <Calendar className="h-3 w-3 text-gray-400" />
          {formatDate(c.startsAt)} -&gt; {formatDate(c.endsAt)}
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: c => <CampaignStatusBadge status={c.status} /> },
    {
      key: 'budget', header: 'Budget committed',
      render: c => {
        const budgetPct = c.budgetCapPesewas != null && c.budgetCapPesewas > 0
          ? Math.min(100, Math.round((c.budgetSpentPesewas / c.budgetCapPesewas) * 100))
          : null
        return (
          <>
            <div className="text-xs text-gray-700">
              {formatGhs(c.budgetSpentPesewas, { withPrefix: false })}
              {c.budgetCapPesewas != null
                ? <span className="text-gray-400"> / {formatGhs(c.budgetCapPesewas, { withPrefix: false })}</span>
                : <span className="text-gray-400"> / uncapped</span>}
            </div>
            {budgetPct != null && (
              <div className="mt-1 h-1 w-20 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full ${budgetPct >= 90 ? 'bg-red-400' : budgetPct >= 60 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                  style={{ width: `${budgetPct}%` }}
                />
              </div>
            )}
          </>
        )
      },
    },
    {
      key: 'actions', header: '', align: 'right',
      render: c => (
        <div className="flex items-center justify-end gap-1">
          <RoleGate permission="manage_promotions">
            {(c.status === 'draft' || c.status === 'pending_approval') && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-400 hover:text-gray-700"
                onClick={e => { e.stopPropagation(); setEditing(c) }}
                title={c.status === 'pending_approval' ? 'Edit (returns to draft)' : 'Edit draft'}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            {c.status === 'draft' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-400 hover:text-primary"
                disabled={submittingId === c.id}
                onClick={e => { e.stopPropagation(); void handleQuickSubmit(c) }}
                title="Submit for approval"
              >
                {submittingId === c.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Send className="h-3.5 w-3.5" />}
              </Button>
            )}
          </RoleGate>
        </div>
      ),
    },
  ]

  return (
    <PageGuard permission="view_promotions">
      <div>
        <PageHeader
          title="Promo campaigns"
          subtitle="Auto-apply discount campaigns with budgets and banners - a different admin must approve before they go live."
          actions={
            <RoleGate permission="manage_promotions">
              <Button variant="brand" onClick={() => setCreating(true)} className="gap-2">
                <Plus className="h-4 w-4" /> New campaign
              </Button>
            </RoleGate>
          }
        />

        <SanityLimitsCard limits={limits} loading={limitsLoading} onUpdated={setLimits} />

        <FilterBar
          onRefresh={() => void load()}
          refreshing={loading}
          meta={`${total} campaign${total === 1 ? '' : 's'}`}
        >
          <Select value={statusFilter} onValueChange={v => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-44 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={audienceFilter} onValueChange={v => setAudienceFilter(v as typeof audienceFilter)}>
            <SelectTrigger className="w-40 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {AUDIENCE_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterBar>

        {rowError && <ErrorState compact title="That action failed" detail={rowError} className="mb-4" />}

        <DataTable<PromoCampaign>
          columns={columns}
          rows={campaigns}
          rowKey={c => c.id}
          loading={loading}
          error={error || null}
          onRetry={() => void load()}
          onRowClick={c => setOpenCampaignId(c.id)}
          rowAriaLabel={c => `Open campaign ${c.name}`}
          empty={
            <EmptyState
              icon={Megaphone}
              title={statusFilter !== 'all' || audienceFilter !== 'all' ? 'No campaigns match these filters' : 'No promo campaigns yet'}
            />
          }
          pagination={{ page, pageSize: LIMIT, total, onPage: setPage }}
          minWidth={860}
        />

        <CampaignFormDialog
          open={creating || !!editing}
          existing={editing}
          limits={limits}
          rideCategories={rideCategories}
          serviceCategories={serviceCategories}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); void load(true) }}
        />

        <CampaignDetailSheet
          campaignId={openCampaignId}
          rideCategories={rideCategories}
          serviceCategories={serviceCategories}
          onClose={() => setOpenCampaignId(null)}
          onChanged={() => void load(true)}
          onEdit={campaign => { setOpenCampaignId(null); setEditing(campaign) }}
        />
      </div>
    </PageGuard>
  )
}
