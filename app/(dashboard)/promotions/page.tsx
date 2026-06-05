'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus, Pencil, RefreshCw, Search, Ticket, Loader2, AlertTriangle,
  Power, PowerOff, BarChart3, Calendar, ToggleLeft, ToggleRight,
} from 'lucide-react'
import { PageGuard } from '@/components/common/page-guard'
import { PageHeader } from '@/components/common/page-header'
import { RoleGate } from '@/components/common/role-gate'
import { StatusBadge } from '@/components/common/status-badge'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  listPromos, getPromo, createPromo, updatePromo, listPromoRedemptions,
  type Promo, type PromoDetail, type PromoStatus, type PromoType, type PromoScope,
  type PromoRedemptionItem,
} from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { formatGhs } from '@/lib/money'

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: Array<{ value: 'all' | PromoStatus; label: string }> = [
  { value: 'active',    label: 'Active' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'inactive',  label: 'Inactive' },
  { value: 'expired',   label: 'Expired' },
  { value: 'all',       label: 'All' },
]

const TYPE_LABELS: Record<PromoType, string> = {
  PERCENTAGE_DISCOUNT: '% off',
  FIXED_DISCOUNT:      'Flat off',
  FREE_RIDE:           'Free ride',
  BONUS_POINTS:        'Bonus points',
}

const SCOPE_LABELS: Record<PromoScope, string> = {
  ride: 'Rides',
  job:  'Jobs',
  both: 'Rides & jobs',
}

function fmtDate(iso: string | null) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

function fmtDateShort(iso: string | null) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function describeDiscount(p: { promoType: PromoType; discountValue: number; maxDiscountPesewas: number | null }): string {
  switch (p.promoType) {
    case 'PERCENTAGE_DISCOUNT':
      return p.maxDiscountPesewas != null
        ? `${p.discountValue}% off - max ${formatGhs(p.maxDiscountPesewas)}`
        : `${p.discountValue}% off`
    case 'FIXED_DISCOUNT':
      return `${formatGhs(p.discountValue)} off`
    case 'FREE_RIDE':
      return 'Free booking'
    case 'BONUS_POINTS':
      return `+${p.discountValue} loyalty points`
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PromotionsPage() {
  const [promos, setPromos] = useState<Promo[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<'all' | PromoStatus>('active')
  const [typeFilter, setTypeFilter] = useState<'all' | PromoType>('all')
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const LIMIT = 50

  const [editing, setEditing] = useState<Promo | null>(null)
  const [creating, setCreating] = useState(false)
  const [openRedemptions, setOpenRedemptions] = useState<Promo | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Debounced search
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300)
    return () => clearTimeout(id)
  }, [searchInput])

  useEffect(() => { setPage(1) }, [statusFilter, typeFilter, debouncedSearch])

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const res = await listPromos({
        status: statusFilter === 'all' ? undefined : statusFilter,
        promoType: typeFilter === 'all' ? undefined : typeFilter,
        search: debouncedSearch || undefined,
        page,
        limit: LIMIT,
      })
      setPromos(res.items)
      setTotal(res.total)
      setTotalPages(res.totalPages)
    } catch (err) {
      setPromos([])
      setTotal(0)
      setTotalPages(1)
      if (err instanceof ApiError && err.status === 404) {
        setError('Promotions endpoint is not yet available on the backend.')
      } else {
        setError(err instanceof ApiError ? err.message : 'Failed to load promotions.')
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [statusFilter, typeFilter, debouncedSearch, page])

  useEffect(() => { load() }, [load])
  useAutoRefresh(() => load(true))

  async function handleToggleActive(p: Promo) {
    setTogglingId(p.id)
    try {
      const updated = await updatePromo(p.id, { isActive: !p.isActive })
      setPromos(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x))
    } catch {
      // Surface as a small banner? Keep silent for now.
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <PageGuard permission="view_promotions">
      <div>
        <PageHeader
          title="Promotions"
          subtitle="Manage promo codes - clients redeem these at booking checkout."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => load()} disabled={loading} className="gap-1.5">
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </Button>
              <RoleGate permission="manage_promotions">
                <Button onClick={() => setCreating(true)} className="gap-2 text-white" style={{ backgroundColor: '#F5A623' }}>
                  <Plus className="h-4 w-4" /> New Promo
                </Button>
              </RoleGate>
            </div>
          }
        />

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              placeholder="Search by code prefix…"
              className="pl-9 uppercase"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value.toUpperCase())}
            />
          </div>
          <Select value={statusFilter} onValueChange={v => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-36 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={v => setTypeFilter(v as typeof typeFilter)}>
            <SelectTrigger className="w-40 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="PERCENTAGE_DISCOUNT">% discount</SelectItem>
              <SelectItem value="FIXED_DISCOUNT">Flat discount</SelectItem>
              <SelectItem value="FREE_RIDE">Free ride</SelectItem>
              <SelectItem value="BONUS_POINTS">Bonus points</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto text-sm text-gray-500">{total} promo{total === 1 ? '' : 's'}</div>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Code</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Discount</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Scope</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Usage</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Window</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : promos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-14 text-gray-400">
                    <Ticket className="h-8 w-8 mx-auto mb-2 text-gray-200" />
                    <p className="text-sm">{debouncedSearch || statusFilter !== 'all' || typeFilter !== 'all'
                      ? 'No promos match your filters.'
                      : 'No promo codes yet.'}</p>
                  </TableCell>
                </TableRow>
              ) : (
                promos.map(p => {
                  const usagePct = p.maxUsesTotal != null && p.maxUsesTotal > 0
                    ? Math.min(100, Math.round((p.currentUses / p.maxUsesTotal) * 100))
                    : null
                  return (
                    <TableRow key={p.id} className="hover:bg-gray-50">
                      <TableCell>
                        <button
                          className="font-mono text-sm font-semibold text-orange-600 hover:underline"
                          onClick={() => setOpenRedemptions(p)}
                        >
                          {p.code}
                        </button>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-gray-800">{describeDiscount(p)}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{TYPE_LABELS[p.promoType]}</p>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-gray-600">{SCOPE_LABELS[p.promoScope]}</span>
                      </TableCell>
                      <TableCell><StatusBadge status={p.status} /></TableCell>
                      <TableCell>
                        <div className="text-xs text-gray-700">
                          {p.currentUses}
                          {p.maxUsesTotal != null && <span className="text-gray-400"> / {p.maxUsesTotal}</span>}
                        </div>
                        {usagePct != null && (
                          <div className="mt-1 h-1 w-20 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${usagePct >= 90 ? 'bg-red-400' : usagePct >= 60 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                              style={{ width: `${usagePct}%` }}
                            />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-gray-500">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-gray-400" />
                          {fmtDateShort(p.startsAt)} -&gt; {p.expiresAt ? fmtDateShort(p.expiresAt) : <span className="text-gray-400">never</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-gray-400 hover:text-gray-700"
                            onClick={() => setOpenRedemptions(p)}
                            title="Redemption history"
                          >
                            <BarChart3 className="h-3.5 w-3.5" />
                          </Button>
                          <RoleGate permission="manage_promotions">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-gray-400 hover:text-gray-700"
                              onClick={() => setEditing(p)}
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-8 w-8 ${p.isActive ? 'text-emerald-500 hover:text-gray-400' : 'text-gray-300 hover:text-emerald-500'}`}
                              disabled={togglingId === p.id}
                              onClick={() => handleToggleActive(p)}
                              title={p.isActive ? 'Deactivate' : 'Activate'}
                            >
                              {togglingId === p.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : p.isActive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
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

          <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
            <p className="text-xs text-gray-500">
              {loading ? <Loader2 className="h-3 w-3 animate-spin inline" /> : `Page ${page} of ${totalPages} (${total} total)`}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        </div>

        <PromoFormDialog
          open={creating || !!editing}
          existing={editing}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); load(true) }}
        />

        <RedemptionDrawer
          promo={openRedemptions}
          onClose={() => setOpenRedemptions(null)}
        />
      </div>
    </PageGuard>
  )
}

// ── Form dialog ───────────────────────────────────────────────────────────────

interface FormState {
  code: string
  promoType: PromoType
  promoScope: PromoScope
  discountValue: string  // string for input control; parse to int on submit
  maxDiscountGhs: string
  minBookingGhs: string
  maxUsesTotal: string
  maxUsesPerUser: string
  startsAt: string  // ISO date or empty
  expiresAt: string  // ISO date or empty
  isActive: boolean
}

const EMPTY_FORM: FormState = {
  code: '',
  promoType: 'PERCENTAGE_DISCOUNT',
  promoScope: 'both',
  discountValue: '10',
  maxDiscountGhs: '50.00',
  minBookingGhs: '0',
  maxUsesTotal: '',
  maxUsesPerUser: '1',
  startsAt: '',
  expiresAt: '',
  isActive: true,
}

function ghsToPesewas(ghs: string): number {
  const n = parseFloat(ghs)
  return Number.isFinite(n) ? Math.round(n * 100) : NaN
}
function pesewasToGhs(p: number): string {
  return (p / 100).toFixed(2)
}

function PromoFormDialog({
  open, existing, onClose, onSaved,
}: {
  open: boolean
  existing: Promo | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = existing !== null
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    if (existing) {
      setForm({
        code: existing.code,
        promoType: existing.promoType,
        promoScope: existing.promoScope,
        discountValue: String(existing.discountValue),
        maxDiscountGhs: existing.maxDiscountPesewas != null ? pesewasToGhs(existing.maxDiscountPesewas) : '',
        minBookingGhs: pesewasToGhs(existing.minBookingPesewas),
        maxUsesTotal: existing.maxUsesTotal != null ? String(existing.maxUsesTotal) : '',
        maxUsesPerUser: String(existing.maxUsesPerUser),
        startsAt: existing.startsAt.slice(0, 16),
        expiresAt: existing.expiresAt ? existing.expiresAt.slice(0, 16) : '',
        isActive: existing.isActive,
      })
    } else {
      setForm(EMPTY_FORM)
    }
    setError('')
  }, [open, existing])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  const isPercent = form.promoType === 'PERCENTAGE_DISCOUNT'
  const isFree = form.promoType === 'FREE_RIDE'
  const isPoints = form.promoType === 'BONUS_POINTS'

  // Live preview of the effect.
  const previewText = useMemo(() => {
    const dv = Number(form.discountValue)
    if (!Number.isFinite(dv) || dv <= 0) return null
    if (isFree) return 'Recipient gets the entire booking free.'
    if (isPoints) return `Recipient receives ${dv} loyalty points instead of a fare discount.`
    const maxCap = ghsToPesewas(form.maxDiscountGhs)
    const minBook = ghsToPesewas(form.minBookingGhs)
    if (isPercent) {
      return `${dv}% off${Number.isFinite(maxCap) && maxCap > 0 ? ` up to ${formatGhs(maxCap)}` : ''}${minBook > 0 ? `, min booking ${formatGhs(minBook)}` : ''}.`
    }
    return `${formatGhs(dv)} off${minBook > 0 ? ` on bookings ≥ ${formatGhs(minBook)}` : ''}.`
  }, [form.discountValue, form.maxDiscountGhs, form.minBookingGhs, isPercent, isFree, isPoints])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!isEdit) {
      const code = form.code.trim().toUpperCase()
      if (!/^[A-Z0-9-]{3,32}$/.test(code)) {
        setError('Code must be 3-32 chars, uppercase letters, digits, or dashes.')
        return
      }
      const dv = Number(form.discountValue)
      if (!Number.isFinite(dv) || dv < 1) { setError('Discount value must be ≥ 1.'); return }
      if (isPercent && dv > 100) { setError('Percentage discount cannot exceed 100.'); return }
      if (isPercent && !form.maxDiscountGhs.trim()) {
        setError('Max discount (cap) is required for percentage promos.')
        return
      }
    }

    const startsAtISO = form.startsAt ? new Date(form.startsAt).toISOString() : undefined
    const expiresAtISO = form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined
    if (startsAtISO && expiresAtISO && new Date(expiresAtISO) <= new Date(startsAtISO)) {
      setError('Expires-at must be after starts-at.')
      return
    }

    const maxDiscountPesewas = form.maxDiscountGhs ? ghsToPesewas(form.maxDiscountGhs) : undefined
    const minBookingPesewas = form.minBookingGhs ? ghsToPesewas(form.minBookingGhs) : 0
    const maxUsesTotal = form.maxUsesTotal ? Number(form.maxUsesTotal) : undefined
    const maxUsesPerUser = Number(form.maxUsesPerUser) || 1

    setSaving(true)
    try {
      if (isEdit) {
        await updatePromo(existing!.id, {
          isActive: form.isActive,
          expiresAt: expiresAtISO ?? null,
          maxUsesTotal: maxUsesTotal,
          maxUsesPerUser,
          minBookingPesewas,
          ...(isPercent && maxDiscountPesewas != null ? { maxDiscountPesewas } : {}),
        })
      } else {
        await createPromo({
          code: form.code.trim().toUpperCase(),
          promoType: form.promoType,
          promoScope: form.promoScope,
          discountValue: Number(form.discountValue),
          maxDiscountPesewas,
          minBookingPesewas,
          maxUsesTotal,
          maxUsesPerUser,
          startsAt: startsAtISO,
          expiresAt: expiresAtISO,
          isActive: form.isActive,
        })
      }
      onSaved()
    } catch (err: unknown) {
      if (err instanceof ApiError && err.message.includes('PROMO_CODE_EXISTS')) {
        setError('A promo with this code already exists.')
      } else {
        setError(err instanceof ApiError ? err.message : 'Failed to save promo.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit promo: ${existing!.code}` : 'New promo code'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Code, type, scope, and discount value are frozen after creation to keep redemption history consistent.'
              : 'Codes are visible to clients only when they type them at checkout. Broadcasting comes in a later phase.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Code + active toggle */}
          <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Code</Label>
              <Input
                value={form.code}
                onChange={e => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
                placeholder="FIRSTRIDE20"
                disabled={isEdit}
                maxLength={32}
                className="font-mono uppercase"
              />
              <p className="text-[10px] text-gray-400">3-32 chars, uppercase letters, digits, dashes. Frozen after creation.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Active</Label>
              <Button
                type="button"
                variant="outline"
                onClick={() => set('isActive', !form.isActive)}
                className={form.isActive ? 'text-emerald-600 border-emerald-200' : 'text-gray-400'}
              >
                {form.isActive ? <Power className="h-4 w-4 mr-1" /> : <PowerOff className="h-4 w-4 mr-1" />}
                {form.isActive ? 'On' : 'Off'}
              </Button>
            </div>
          </div>

          {/* Type + scope */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</Label>
              <Select value={form.promoType} onValueChange={v => set('promoType', v as PromoType)} disabled={isEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENTAGE_DISCOUNT">% off</SelectItem>
                  <SelectItem value="FIXED_DISCOUNT">Flat amount off</SelectItem>
                  <SelectItem value="FREE_RIDE">Free booking</SelectItem>
                  <SelectItem value="BONUS_POINTS">Bonus loyalty points</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Scope</Label>
              <Select value={form.promoScope} onValueChange={v => set('promoScope', v as PromoScope)} disabled={isEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Rides & jobs</SelectItem>
                  <SelectItem value="ride">Rides only</SelectItem>
                  <SelectItem value="job">Jobs only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Discount value(s) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {isPercent ? 'Percent off (1-100)' : isPoints ? 'Points' : isFree ? 'N/A (free booking)' : 'Amount off (GHS)'}
              </Label>
              <Input
                type="number"
                min={isPercent ? 1 : 0}
                max={isPercent ? 100 : undefined}
                step={isPercent || isPoints ? 1 : 0.01}
                disabled={isEdit || isFree}
                value={form.discountValue}
                onChange={e => set('discountValue', e.target.value)}
              />
              <p className="text-[10px] text-gray-400">{isEdit ? 'Frozen after creation.' : isPercent ? 'Capped by the max-discount value below.' : isPoints ? 'Awarded as loyalty points; no fare discount.' : isFree ? 'Discount = full booking amount.' : 'Flat pesewas off the fare.'}</p>
            </div>
            {isPercent && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Max discount (GHS)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.maxDiscountGhs}
                  onChange={e => set('maxDiscountGhs', e.target.value)}
                />
                <p className="text-[10px] text-gray-400">Caps the % discount in absolute terms.</p>
              </div>
            )}
          </div>

          {/* Min booking + uses */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Min booking (GHS)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={form.minBookingGhs}
                onChange={e => set('minBookingGhs', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Max total uses</Label>
              <Input
                type="number"
                min={1}
                placeholder="Unlimited"
                value={form.maxUsesTotal}
                onChange={e => set('maxUsesTotal', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Per-user uses</Label>
              <Input
                type="number"
                min={1}
                value={form.maxUsesPerUser}
                onChange={e => set('maxUsesPerUser', e.target.value)}
              />
            </div>
          </div>

          {/* Date window */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Starts</Label>
              <Input
                type="datetime-local"
                disabled={isEdit}
                value={form.startsAt}
                onChange={e => set('startsAt', e.target.value)}
              />
              <p className="text-[10px] text-gray-400">{isEdit ? 'Frozen after creation.' : 'Leave blank to start immediately.'}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Expires</Label>
              <Input
                type="datetime-local"
                value={form.expiresAt}
                onChange={e => set('expiresAt', e.target.value)}
              />
              <p className="text-[10px] text-gray-400">Leave blank for never.</p>
            </div>
          </div>

          {previewText && (
            <div className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 text-xs text-orange-700">
              <span className="font-semibold">Preview:</span> {previewText}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving} className="text-white gap-2" style={{ backgroundColor: '#F5A623' }}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? 'Save changes' : 'Create promo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Redemption drawer ─────────────────────────────────────────────────────────

function RedemptionDrawer({
  promo, onClose,
}: {
  promo: Promo | null
  onClose: () => void
}) {
  const [detail, setDetail] = useState<PromoDetail | null>(null)
  const [redemptions, setRedemptions] = useState<PromoRedemptionItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!promo) {
      setDetail(null); setRedemptions([]); setError('')
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    Promise.all([
      getPromo(promo.id),
      listPromoRedemptions(promo.id, { limit: 50 }),
    ])
      .then(([d, r]) => {
        if (cancelled) return
        setDetail(d)
        setRedemptions(r.items)
      })
      .catch(err => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : 'Failed to load promo detail.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [promo?.id])

  if (!promo) return null

  return (
    <Sheet open={!!promo} onOpenChange={open => { if (!open) onClose() }}>
      <SheetContent className="sm:max-w-xl overflow-y-auto p-0">
        <SheetHeader className="px-6 py-4 border-b border-gray-100">
          <SheetTitle className="text-base flex items-center gap-2 font-mono">
            <Ticket className="h-4 w-4 text-gray-600" /> {promo.code}
            <span className="ml-auto"><StatusBadge status={promo.status} /></span>
          </SheetTitle>
        </SheetHeader>

        <div className="px-6 py-5 space-y-5">
          {loading && (
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" /> <span className="text-sm">Loading…</span>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          {detail && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Total uses" value={`${detail.currentUses}${detail.maxUsesTotal != null ? ` / ${detail.maxUsesTotal}` : ''}`} />
                <Stat label="Unique redeemers" value={String(detail.stats.uniqueRedeemerCount)} />
                <Stat label="Total discounted" value={formatGhs(detail.stats.totalDiscountedPesewas)} />
                <Stat label="Rides / Jobs" value={`${detail.stats.rideRedemptions} / ${detail.stats.jobRedemptions}`} />
              </div>

              <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1">
                <p className="text-gray-500">{describeDiscount(detail)}</p>
                <p className="text-gray-400">{SCOPE_LABELS[detail.promoScope]} - {TYPE_LABELS[detail.promoType]}</p>
                <p className="text-gray-400">{fmtDate(detail.startsAt)} -&gt; {detail.expiresAt ? fmtDate(detail.expiresAt) : 'never'}</p>
              </div>

              {/* Redemption history */}
              <section className="space-y-2">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">
                  Redemption history ({redemptions.length})
                </p>
                {redemptions.length === 0 ? (
                  <div className="text-xs text-gray-400 italic bg-gray-50 rounded-lg p-3">
                    No redemptions yet.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
                    {redemptions.map(r => (
                      <div key={r.id} className="flex items-center justify-between gap-3 bg-white border border-gray-100 rounded-lg px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <p className="text-gray-800 truncate">{r.clientName ?? '-'}</p>
                          <p className="text-gray-400 text-[10px]">
                            {r.bookingType} - {fmtDate(r.createdAt)}
                          </p>
                        </div>
                        <span className="font-medium text-emerald-700">{formatGhs(r.discountPesewas)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-lg p-3">
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-lg font-semibold text-gray-800 mt-0.5 tabular-nums">{value}</p>
    </div>
  )
}

