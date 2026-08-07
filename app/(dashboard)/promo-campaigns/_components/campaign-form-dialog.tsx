'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  createPromoCampaign, updatePromoCampaign,
  type CreatePromoCampaignInput, type PromoCampaign, type PromoCampaignAudience,
  type PromoCampaignSanityLimits, type PromoCampaignScope, type PromoCampaignType,
} from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { formatGhs } from '@/lib/money'
import {
  audienceScopedPayloadFields, ghsInputToPesewas, isProviderAudience,
  pesewasToGhsInput, validatePromoCampaignDraft,
} from '@/lib/promo-campaign-contract'

export interface CategoryOption {
  id: string
  name: string
}

interface FormState {
  name: string
  description: string
  termsText: string
  audience: PromoCampaignAudience
  campaignType: PromoCampaignType
  discountValue: string // percent for percentage_discount/commission_relief, GHS for fixed_discount
  maxDiscountGhs: string
  minBookingGhs: string
  promoScope: PromoCampaignScope
  rideCategoryIds: string[]
  serviceCategoryIds: string[]
  newClientsOnly: boolean
  maxUsesPerUser: string
  maxUsesPerUserPerDay: string
  budgetCapGhs: string
  startsAt: string // datetime-local
  endsAt: string // datetime-local
  bannerPriority: string
}

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  termsText: '',
  audience: 'client',
  campaignType: 'percentage_discount',
  discountValue: '10',
  maxDiscountGhs: '50.00',
  minBookingGhs: '',
  promoScope: 'both',
  rideCategoryIds: [],
  serviceCategoryIds: [],
  newClientsOnly: false,
  maxUsesPerUser: '',
  maxUsesPerUserPerDay: '',
  budgetCapGhs: '',
  startsAt: '',
  endsAt: '',
  bannerPriority: '0',
}

// datetime-local values are wall-clock local time (Africa/Accra for ops); the
// API boundary is always ISO UTC.
function isoToLocalInput(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function localInputToIso(value: string): string {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

export function CampaignFormDialog({
  open, existing, limits, rideCategories, serviceCategories, onClose, onSaved,
}: {
  open: boolean
  existing: PromoCampaign | null
  limits: PromoCampaignSanityLimits | null
  rideCategories: CategoryOption[]
  serviceCategories: CategoryOption[]
  onClose: () => void
  onSaved: (campaign: PromoCampaign) => void
}) {
  const isEdit = existing !== null
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    if (existing) {
      setForm({
        name: existing.name,
        description: existing.description ?? '',
        termsText: existing.termsText ?? '',
        audience: existing.audience,
        campaignType: existing.campaignType,
        discountValue: existing.campaignType === 'fixed_discount'
          ? pesewasToGhsInput(existing.discountValue)
          : String(existing.discountValue),
        maxDiscountGhs: pesewasToGhsInput(existing.maxDiscountPesewas),
        minBookingGhs: pesewasToGhsInput(existing.minBookingPesewas),
        promoScope: existing.promoScope,
        rideCategoryIds: existing.rideCategoryIds,
        serviceCategoryIds: existing.serviceCategoryIds,
        newClientsOnly: existing.newClientsOnly,
        maxUsesPerUser: existing.maxUsesPerUser != null ? String(existing.maxUsesPerUser) : '',
        maxUsesPerUserPerDay: existing.maxUsesPerUserPerDay != null ? String(existing.maxUsesPerUserPerDay) : '',
        budgetCapGhs: pesewasToGhsInput(existing.budgetCapPesewas),
        startsAt: existing.startsAt ? isoToLocalInput(existing.startsAt) : '',
        endsAt: existing.endsAt ? isoToLocalInput(existing.endsAt) : '',
        bannerPriority: String(existing.bannerPriority),
      })
    } else {
      setForm(EMPTY_FORM)
    }
    setError('')
  }, [open, existing])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  const isProvider = isProviderAudience(form.audience)
  const isPercent = form.campaignType === 'percentage_discount'
  const isRelief = form.campaignType === 'commission_relief'
  const showRideCategories = form.audience === 'driver'
    || (!isProvider && (form.promoScope === 'ride' || form.promoScope === 'both'))
  const showServiceCategories = form.audience === 'artisan'
    || (!isProvider && (form.promoScope === 'artisan_job' || form.promoScope === 'both'))

  // Provider audiences are locked to commission relief; switching back to
  // client restores a discount type. Categories that no longer apply are
  // dropped so a stale selection can never reach the payload.
  function setAudience(audience: PromoCampaignAudience) {
    setForm(f => ({
      ...f,
      audience,
      campaignType: isProviderAudience(audience)
        ? 'commission_relief'
        : f.campaignType === 'commission_relief' ? 'percentage_discount' : f.campaignType,
      rideCategoryIds: audience === 'artisan' ? [] : f.rideCategoryIds,
      serviceCategoryIds: audience === 'driver' ? [] : f.serviceCategoryIds,
    }))
  }

  const previewText = useMemo(() => {
    const dv = Number(form.discountValue)
    if (!Number.isFinite(dv) || dv <= 0) return null
    if (isRelief) {
      const cap = ghsInputToPesewas(form.maxDiscountGhs)
      return `Forgives ${dv}% of the platform commission${Number.isFinite(cap) && cap > 0 ? `, up to ${formatGhs(cap)} per booking` : ''}.`
    }
    if (isPercent) {
      const cap = ghsInputToPesewas(form.maxDiscountGhs)
      return `${dv}% off automatically at checkout${Number.isFinite(cap) && cap > 0 ? `, capped at ${formatGhs(cap)}` : ''}.`
    }
    const pesewas = ghsInputToPesewas(form.discountValue)
    return Number.isFinite(pesewas) ? `${formatGhs(pesewas)} off automatically at checkout.` : null
  }, [form.discountValue, form.maxDiscountGhs, isPercent, isRelief])

  function toggleCategory(key: 'rideCategoryIds' | 'serviceCategoryIds', id: string) {
    setForm(f => ({
      ...f,
      [key]: f[key].includes(id) ? f[key].filter(x => x !== id) : [...f[key], id],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    // Percent semantics (percentage_discount + commission_relief) stay raw;
    // only fixed_discount is a GHS amount that crosses the API in pesewas.
    const discountValue = form.campaignType === 'fixed_discount'
      ? ghsInputToPesewas(form.discountValue)
      : Number(form.discountValue)
    const maxDiscountPesewas = form.maxDiscountGhs.trim() ? ghsInputToPesewas(form.maxDiscountGhs) : NaN
    const minBookingPesewas = form.minBookingGhs.trim() ? ghsInputToPesewas(form.minBookingGhs) : NaN
    const budgetCapPesewas = form.budgetCapGhs.trim() ? ghsInputToPesewas(form.budgetCapGhs) : NaN
    const startsAtIso = form.startsAt ? localInputToIso(form.startsAt) : ''
    const endsAtIso = form.endsAt ? localInputToIso(form.endsAt) : ''

    const validationError = validatePromoCampaignDraft(
      {
        name: form.name,
        audience: form.audience,
        campaignType: form.campaignType,
        discountValue,
        maxDiscountPesewas: Number.isFinite(maxDiscountPesewas) ? maxDiscountPesewas : null,
        promoScope: form.promoScope,
        rideCategoryIds: showRideCategories ? form.rideCategoryIds : [],
        serviceCategoryIds: showServiceCategories ? form.serviceCategoryIds : [],
        startsAt: startsAtIso,
        endsAt: endsAtIso,
        budgetCapPesewas: Number.isFinite(budgetCapPesewas) ? budgetCapPesewas : null,
      },
      limits,
    )
    if (validationError) { setError(validationError); return }

    const maxUsesPerUser = form.maxUsesPerUser.trim() ? Number(form.maxUsesPerUser) : undefined
    const maxUsesPerUserPerDay = form.maxUsesPerUserPerDay.trim() ? Number(form.maxUsesPerUserPerDay) : undefined
    const audienceWord = isProvider ? 'provider' : 'client'
    if (maxUsesPerUser !== undefined && (!Number.isInteger(maxUsesPerUser) || maxUsesPerUser < 1)) {
      setError(`Max uses per ${audienceWord} must be a whole number of at least 1.`)
      return
    }
    if (maxUsesPerUserPerDay !== undefined && (!Number.isInteger(maxUsesPerUserPerDay) || maxUsesPerUserPerDay < 1)) {
      setError(`Max daily uses per ${audienceWord} must be a whole number of at least 1.`)
      return
    }

    const payload: CreatePromoCampaignInput = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      termsText: form.termsText.trim() || undefined,
      campaignType: form.campaignType,
      discountValue,
      maxDiscountPesewas: Number.isFinite(maxDiscountPesewas) ? maxDiscountPesewas : undefined,
      minBookingPesewas: Number.isFinite(minBookingPesewas) ? minBookingPesewas : undefined,
      // audience + promoScope + category restrictions move together: provider
      // audiences never send promoScope and only their vertical's categories.
      ...audienceScopedPayloadFields({
        audience: form.audience,
        promoScope: form.promoScope,
        rideCategoryIds: form.rideCategoryIds,
        serviceCategoryIds: form.serviceCategoryIds,
      }),
      newClientsOnly: form.newClientsOnly,
      maxUsesPerUser,
      maxUsesPerUserPerDay,
      budgetCapPesewas: Number.isFinite(budgetCapPesewas) ? budgetCapPesewas : undefined,
      startsAt: startsAtIso,
      endsAt: endsAtIso,
      bannerPriority: Number(form.bannerPriority) || 0,
    }

    setSaving(true)
    try {
      const saved = isEdit
        ? await updatePromoCampaign(existing!.id, payload)
        : await createPromoCampaign(payload)
      onSaved(saved)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the campaign.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !saving) onClose() }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit campaign: ${existing!.name}` : 'New promo campaign'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? existing!.status === 'pending_approval'
                ? 'Editing a campaign that is awaiting approval returns it to draft — it must be re-submitted.'
                : 'Campaigns stay in draft until submitted for maker-checker approval.'
              : 'Campaigns apply automatically at checkout — clients never type a code. A different admin must approve before it goes live.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Audience */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Audience</Label>
            <Select value={form.audience} onValueChange={v => setAudience(v as PromoCampaignAudience)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="client">Client</SelectItem>
                <SelectItem value="driver">Drivers</SelectItem>
                <SelectItem value="artisan">Artisans</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-gray-400">
              {isProvider
                ? 'Provider campaigns forgive a share of the platform commission instead of discounting the fare.'
                : 'Client campaigns discount the fare at checkout.'}
            </p>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</Label>
            <Input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Kumasi launch week"
              maxLength={120}
            />
          </div>

          {/* Description + terms */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder="Internal note shown to admins."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Terms shown to {isProvider ? 'providers' : 'clients'}
              </Label>
              <Textarea
                rows={2}
                value={form.termsText}
                onChange={e => set('termsText', e.target.value)}
                placeholder={isProvider
                  ? 'e.g. Relief applies to the platform commission only.'
                  : 'e.g. Discount applies to the pre-promo fare.'}
              />
            </div>
          </div>

          {/* Type + value + cap */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</Label>
              <Select
                value={form.campaignType}
                onValueChange={v => set('campaignType', v as PromoCampaignType)}
                disabled={isProvider}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {isProvider ? (
                    <SelectItem value="commission_relief">Commission relief</SelectItem>
                  ) : (
                    <>
                      <SelectItem value="percentage_discount">% off</SelectItem>
                      <SelectItem value="fixed_discount">Flat amount off</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
              {isProvider && (
                <p className="text-[10px] text-gray-400">Provider campaigns always forgive commission.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {isRelief ? 'Commission relief % (1-100)' : isPercent ? 'Percent off (1-100)' : 'Amount off (GHS)'}
              </Label>
              <Input
                type="number"
                min={form.campaignType === 'fixed_discount' ? 0.01 : 1}
                max={form.campaignType === 'fixed_discount' ? undefined : 100}
                step={form.campaignType === 'fixed_discount' ? 0.01 : 1}
                value={form.discountValue}
                onChange={e => set('discountValue', e.target.value)}
              />
            </div>
            {(isPercent || isRelief) && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {isRelief ? 'Relief cap (GHS)' : 'Max discount (GHS)'}
                </Label>
                <Input
                  type="number"
                  min={0.01}
                  step={0.01}
                  placeholder={isRelief ? 'Uncapped' : undefined}
                  value={form.maxDiscountGhs}
                  onChange={e => set('maxDiscountGhs', e.target.value)}
                />
                <p className="text-[10px] text-gray-400">
                  {isRelief ? 'Optional cap on forgone commission per booking.' : 'Required for % campaigns.'}
                </p>
              </div>
            )}
          </div>

          {/* Scope + min booking. Provider audiences imply their scope
              server-side (driver -> ride, artisan -> artisan_job), so the
              selector is hidden and promoScope is never sent for them. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {!isProvider && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Scope</Label>
                <Select value={form.promoScope} onValueChange={v => set('promoScope', v as PromoCampaignScope)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Rides & artisan jobs</SelectItem>
                    <SelectItem value="ride">Rides only</SelectItem>
                    <SelectItem value="artisan_job">Artisan jobs only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Min booking (GHS)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                placeholder="No minimum"
                value={form.minBookingGhs}
                onChange={e => set('minBookingGhs', e.target.value)}
              />
            </div>
          </div>

          {/* Category targeting */}
          {(showRideCategories || showServiceCategories) && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {showRideCategories && (
                <CategoryPicker
                  label="Ride tiers"
                  emptyHint="All ride tiers"
                  options={rideCategories}
                  selected={form.rideCategoryIds}
                  onToggle={id => toggleCategory('rideCategoryIds', id)}
                />
              )}
              {showServiceCategories && (
                <CategoryPicker
                  label="Service categories"
                  emptyHint="All service categories"
                  options={serviceCategories}
                  selected={form.serviceCategoryIds}
                  onToggle={id => toggleCategory('serviceCategoryIds', id)}
                />
              )}
            </div>
          )}

          {/* Targeting + usage caps */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Max uses / {isProvider ? 'provider' : 'client'}
              </Label>
              <Input
                type="number"
                min={1}
                placeholder="Unlimited"
                value={form.maxUsesPerUser}
                onChange={e => set('maxUsesPerUser', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Max daily uses / {isProvider ? 'provider' : 'client'}
              </Label>
              <Input
                type="number"
                min={1}
                placeholder="Unlimited"
                value={form.maxUsesPerUserPerDay}
                onChange={e => set('maxUsesPerUserPerDay', e.target.value)}
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <Checkbox
                  checked={form.newClientsOnly}
                  onCheckedChange={checked => set('newClientsOnly', checked === true)}
                />
                {isProvider ? 'New providers only' : 'New clients only'}
              </label>
            </div>
          </div>

          {/* Budget + banner priority */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Budget cap (GHS)</Label>
              <Input
                type="number"
                min={0.01}
                step={0.01}
                placeholder="Uncapped"
                value={form.budgetCapGhs}
                onChange={e => set('budgetCapGhs', e.target.value)}
              />
              <p className="text-[10px] text-gray-400">The campaign auto-stops when total discounts reach this amount.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Banner priority</Label>
              <Input
                type="number"
                min={0}
                step={1}
                value={form.bannerPriority}
                onChange={e => set('bannerPriority', e.target.value)}
              />
              <p className="text-[10px] text-gray-400">
                Higher shows first in the {isProvider ? 'provider' : 'client'} app carousel.
              </p>
            </div>
          </div>

          {/* Window */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Starts</Label>
              <Input
                type="datetime-local"
                value={form.startsAt}
                onChange={e => set('startsAt', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ends</Label>
              <Input
                type="datetime-local"
                value={form.endsAt}
                onChange={e => set('endsAt', e.target.value)}
              />
            </div>
          </div>

          {previewText && (
            <div className="rounded-lg border border-orange-100 bg-orange-50 px-3 py-2 text-xs text-orange-700">
              <span className="font-semibold">Preview:</span> {previewText}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving} className="gap-2 text-white" style={{ backgroundColor: '#F5A623' }}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? 'Save draft' : 'Create draft'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CategoryPicker({
  label, emptyHint, options, selected, onToggle,
}: {
  label: string
  emptyHint: string
  options: CategoryOption[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</Label>
      <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2">
        {options.length === 0 ? (
          <p className="px-1 py-2 text-xs italic text-gray-400">No options available.</p>
        ) : (
          options.map(option => (
            <label key={option.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm text-gray-700 hover:bg-gray-50">
              <Checkbox
                checked={selected.includes(option.id)}
                onCheckedChange={() => onToggle(option.id)}
              />
              <span className="truncate">{option.name}</span>
            </label>
          ))
        )}
      </div>
      <p className="text-[10px] text-gray-400">
        {selected.length === 0 ? `None selected — applies to ${emptyHint.toLowerCase()}.` : `${selected.length} selected.`}
      </p>
    </div>
  )
}
