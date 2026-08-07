'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle, Calendar, Loader2, Megaphone, Pencil, Plus, RefreshCw, Send,
} from 'lucide-react'
import { PageGuard } from '@/components/common/page-guard'
import { PageHeader } from '@/components/common/page-header'
import { RoleGate } from '@/components/common/role-gate'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  getCategories, getPromoCampaignSanityLimits, getRideCategories, listPromoCampaigns,
  submitPromoCampaign,
  type PromoCampaign, type PromoCampaignSanityLimits, type PromoCampaignStatus,
} from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { formatDate } from '@/lib/format-date'
import { formatGhs } from '@/lib/money'
import { CampaignDetailSheet } from './_components/campaign-detail-sheet'
import { CampaignFormDialog, type CategoryOption } from './_components/campaign-form-dialog'
import { CampaignStatusBadge } from './_components/campaign-status-badge'
import { SanityLimitsCard } from './_components/sanity-limits-card'

const STATUS_OPTIONS: Array<{ value: 'all' | PromoCampaignStatus; label: string }> = [
  { value: 'all',              label: 'All' },
  { value: 'draft',            label: 'Draft' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved',         label: 'Approved' },
  { value: 'paused',           label: 'Paused' },
  { value: 'ended',            label: 'Ended' },
  { value: 'budget_exhausted', label: 'Budget Exhausted' },
]

const TYPE_LABELS = { percentage_discount: '% off', fixed_discount: 'Flat off' } as const
const SCOPE_LABELS = { ride: 'Rides', artisan_job: 'Artisan jobs', both: 'Rides & jobs' } as const

function describeValue(c: PromoCampaign): string {
  return c.campaignType === 'percentage_discount'
    ? `${c.discountValue}%${c.maxDiscountPesewas != null ? ` (max ${formatGhs(c.maxDiscountPesewas)})` : ''}`
    : formatGhs(c.discountValue)
}

export default function PromoCampaignsPage() {
  const [campaigns, setCampaigns] = useState<PromoCampaign[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<'all' | PromoCampaignStatus>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const LIMIT = 20
  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  const [limits, setLimits] = useState<PromoCampaignSanityLimits | null>(null)
  const [limitsLoading, setLimitsLoading] = useState(true)
  const [rideCategories, setRideCategories] = useState<CategoryOption[]>([])
  const [serviceCategories, setServiceCategories] = useState<CategoryOption[]>([])

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<PromoCampaign | null>(null)
  const [openCampaignId, setOpenCampaignId] = useState<string | null>(null)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [rowError, setRowError] = useState('')

  useEffect(() => { setPage(1) }, [statusFilter])

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const res = await listPromoCampaigns({
        status: statusFilter === 'all' ? undefined : statusFilter,
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
  }, [statusFilter, page])

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

  return (
    <PageGuard permission="view_promotions">
      <div>
        <PageHeader
          title="Promo Campaigns"
          subtitle="Auto-apply discount campaigns with budgets, banners and maker-checker approval."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1.5">
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </Button>
              <RoleGate permission="manage_promotions">
                <Button onClick={() => setCreating(true)} className="gap-2 text-white" style={{ backgroundColor: '#F5A623' }}>
                  <Plus className="h-4 w-4" /> New Campaign
                </Button>
              </RoleGate>
            </div>
          }
        />

        <SanityLimitsCard limits={limits} loading={limitsLoading} onUpdated={setLimits} />

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Select value={statusFilter} onValueChange={v => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-44 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto text-sm text-gray-500">{total} campaign{total === 1 ? '' : 's'}</div>
        </div>

        {(error || rowError) && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <p className="text-sm text-red-700">{error || rowError}</p>
          </div>
        )}

        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Campaign</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Discount</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Scope</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Window</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Budget</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><div className="h-4 animate-pulse rounded bg-gray-100" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : campaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-14 text-center text-gray-400">
                    <Megaphone className="mx-auto mb-2 h-8 w-8 text-gray-200" />
                    <p className="text-sm">
                      {statusFilter !== 'all' ? 'No campaigns match this status.' : 'No promo campaigns yet.'}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                campaigns.map(c => {
                  const budgetPct = c.budgetCapPesewas != null && c.budgetCapPesewas > 0
                    ? Math.min(100, Math.round((c.budgetSpentPesewas / c.budgetCapPesewas) * 100))
                    : null
                  return (
                    <TableRow key={c.id} className="hover:bg-gray-50">
                      <TableCell>
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
                            className="max-w-[180px] truncate text-left text-sm font-semibold text-orange-600 hover:underline"
                            title={c.name}
                            onClick={() => setOpenCampaignId(c.id)}
                          >
                            {c.name}
                          </button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-gray-800">{describeValue(c)}</p>
                        <p className="mt-0.5 text-[10px] text-gray-400">
                          {TYPE_LABELS[c.campaignType]}{c.newClientsOnly ? ' - new clients' : ''}
                        </p>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-gray-600">{SCOPE_LABELS[c.promoScope]}</span>
                      </TableCell>
                      <TableCell className="text-xs text-gray-500">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-gray-400" />
                          {formatDate(c.startsAt)} -&gt; {formatDate(c.endsAt)}
                        </div>
                      </TableCell>
                      <TableCell><CampaignStatusBadge status={c.status} /></TableCell>
                      <TableCell>
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
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <RoleGate permission="manage_promotions">
                            {(c.status === 'draft' || c.status === 'pending_approval') && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-400 hover:text-gray-700"
                                onClick={() => setEditing(c)}
                                title={c.status === 'pending_approval' ? 'Edit (returns to draft)' : 'Edit draft'}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {c.status === 'draft' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-400 hover:text-orange-600"
                                disabled={submittingId === c.id}
                                onClick={() => void handleQuickSubmit(c)}
                                title="Submit for approval"
                              >
                                {submittingId === c.id
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <Send className="h-3.5 w-3.5" />}
                              </Button>
                            )}
                          </RoleGate>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-500">
              {loading ? <Loader2 className="inline h-3 w-3 animate-spin" /> : `Page ${page} of ${totalPages} (${total} total)`}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        </div>

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
