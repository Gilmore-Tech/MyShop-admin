'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Ban, CheckCircle2, ImagePlus, Loader2, Megaphone,
  Pause, Pencil, Play, Send, XCircle,
} from 'lucide-react'
import { RoleGate } from '@/components/common/role-gate'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { DetailSheet } from '@/components/common/detail-sheet'
import { ErrorState } from '@/components/common/error-state'
import { FormDialog } from '@/components/common/form-dialog'
import { PageSkeleton } from '@/components/common/load-state'
import { StatCard } from '@/components/common/stat-card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  approvePromoCampaign, endPromoCampaign, getPromoCampaign, pausePromoCampaign,
  rejectPromoCampaign, resumePromoCampaign, submitPromoCampaign, updatePromoCampaign,
  uploadPromoCampaignBanner,
  type PromoCampaign, type PromoCampaignDetail,
} from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { formatDateTime } from '@/lib/format-date'
import { formatGhs } from '@/lib/money'
import {
  canResumePromoCampaign, ghsInputToPesewas, isProviderAudience, pesewasToGhsInput,
  validatePromoBannerFile,
  PROMO_BANNER_ACCEPTED_TYPES,
} from '@/lib/promo-campaign-contract'
import { CampaignAudienceBadge } from './campaign-audience-badge'
import { CampaignStatusBadge } from './campaign-status-badge'
import type { CategoryOption } from './campaign-form-dialog'

const TYPE_LABELS = {
  percentage_discount: '% off', fixed_discount: 'Flat off', commission_relief: 'Commission relief',
} as const
const SCOPE_LABELS = { ride: 'Rides', artisan_job: 'Artisan jobs', both: 'Rides & artisan jobs' } as const

function describeCampaignDiscount(c: PromoCampaign): string {
  if (c.campaignType === 'commission_relief') {
    return c.maxDiscountPesewas != null
      ? `Forgives ${c.discountValue}% of platform commission, up to ${formatGhs(c.maxDiscountPesewas)} per booking`
      : `Forgives ${c.discountValue}% of platform commission`
  }
  if (c.campaignType === 'percentage_discount') {
    return c.maxDiscountPesewas != null
      ? `${c.discountValue}% off - max ${formatGhs(c.maxDiscountPesewas)}`
      : `${c.discountValue}% off`
  }
  return `${formatGhs(c.discountValue)} off`
}

function categoryNames(ids: string[], options: CategoryOption[]): string {
  if (ids.length === 0) return 'All'
  const byId = new Map(options.map(o => [o.id, o.name]))
  return ids.map(id => byId.get(id) ?? id).join(', ')
}

export function CampaignDetailSheet({
  campaignId, rideCategories, serviceCategories, onClose, onChanged, onEdit,
}: {
  campaignId: string | null
  rideCategories: CategoryOption[]
  serviceCategories: CategoryOption[]
  onClose: () => void
  onChanged: () => void
  onEdit: (campaign: PromoCampaign) => void
}) {
  const [detail, setDetail] = useState<PromoCampaignDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [endConfirmOpen, setEndConfirmOpen] = useState(false)
  const [restrictedEditOpen, setRestrictedEditOpen] = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async () => {
    if (!campaignId) return
    setLoading(true)
    setError('')
    try {
      setDetail(await getPromoCampaign(campaignId))
    } catch (err) {
      setDetail(null)
      setError(err instanceof ApiError ? err.message : 'Failed to load the campaign.')
    } finally {
      setLoading(false)
    }
  }, [campaignId])

  useEffect(() => {
    setDetail(null)
    setActionError('')
    setRejectOpen(false)
    setEndConfirmOpen(false)
    setRestrictedEditOpen(false)
    if (campaignId) void load()
  }, [campaignId, load])

  async function runAction(name: string, action: () => Promise<PromoCampaign>) {
    setPendingAction(name)
    setActionError('')
    try {
      await action()
      await load()
      onChanged()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'The action could not be completed.')
      // A 409 state conflict means our copy is stale - reload it.
      if (err instanceof ApiError && err.status === 409) void load()
    } finally {
      setPendingAction(null)
    }
  }

  async function handleBannerFile(file: File) {
    if (!detail) return
    const clientError = validatePromoBannerFile(file)
    if (clientError) { setActionError(clientError); return }
    setUploadingBanner(true)
    setActionError('')
    try {
      await uploadPromoCampaignBanner(detail.id, file)
      await load()
      onChanged()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Banner upload failed.')
    } finally {
      setUploadingBanner(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (!campaignId) return null

  const busy = pendingAction !== null || uploadingBanner
  const isProvider = detail != null && isProviderAudience(detail.audience)
  const audienceWord = isProvider ? 'provider' : 'client'
  const canResume = detail != null && canResumePromoCampaign(detail.status)
  const budgetPct = detail?.budgetCapPesewas != null && detail.budgetCapPesewas > 0
    ? Math.min(100, Math.round((detail.stats.budgetCommittedPesewas / detail.budgetCapPesewas) * 100))
    : null

  return (
    <>
      <DetailSheet
        open={!!campaignId}
        onClose={() => { if (!busy) onClose() }}
        title={
          <span className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 shrink-0 text-gray-600" />
            <span className="truncate">{detail?.name ?? 'Campaign'}</span>
          </span>
        }
        status={detail && (
          <>
            <CampaignAudienceBadge audience={detail.audience} />
            <CampaignStatusBadge status={detail.status} />
          </>
        )}
        size="lg"
      >
        {loading ? (
          <PageSkeleton variant="stats" />
        ) : error ? (
          <ErrorState title="Could not load the campaign" detail={error} onRetry={() => void load()} />
        ) : detail ? (
          <div className="space-y-5">
            {detail.status === 'draft' && detail.rejectionReason && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <span className="font-semibold">Returned by the approver:</span> {detail.rejectionReason}
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard compact label="Reserved redemptions" value={String(detail.stats.reservedRedemptions)} />
              <StatCard compact label="Settled redemptions" value={String(detail.stats.settledRedemptions)} />
              <StatCard
                compact
                label={isProvider ? 'Unique providers (committed)' : 'Unique clients (committed)'}
                value={detail.stats.uniqueBeneficiaries == null ? 'Unavailable' : String(detail.stats.uniqueBeneficiaries)}
              />
              <StatCard
                compact
                label="Budget reserved"
                value={detail.stats.budgetReservedPesewas == null ? 'Unavailable' : formatGhs(detail.stats.budgetReservedPesewas)}
              />
              <StatCard
                compact
                label="Settled spend"
                value={detail.stats.budgetSettledPesewas == null ? 'Unavailable' : formatGhs(detail.stats.budgetSettledPesewas)}
              />
              <StatCard
                compact
                label="Total committed"
                value={`${formatGhs(detail.stats.budgetCommittedPesewas)}${detail.budgetCapPesewas != null ? ` / ${formatGhs(detail.budgetCapPesewas)}` : ''}`}
              />
            </div>
            <p className="text-[10px] leading-4 text-gray-400">
              Committed counts include reserved and settled redemptions. Total committed is reserved budget plus
              settled spend; released and refunded redemptions are excluded.
            </p>
            {budgetPct != null && (
              <div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full ${budgetPct >= 90 ? 'bg-red-400' : budgetPct >= 60 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                    style={{ width: `${budgetPct}%` }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-gray-400">{budgetPct}% of budget committed</p>
              </div>
            )}

            {/* Terms */}
            <div className="space-y-1 rounded-lg bg-gray-50 p-3 text-xs">
              <p className="text-gray-700">{describeCampaignDiscount(detail)} <span className="text-gray-400">({TYPE_LABELS[detail.campaignType]})</span></p>
              <p className="text-gray-500">{SCOPE_LABELS[detail.promoScope]}</p>
              {(detail.promoScope === 'ride' || detail.promoScope === 'both') && (
                <p className="text-gray-500">Ride tiers: {categoryNames(detail.rideCategoryIds, rideCategories)}</p>
              )}
              {(detail.promoScope === 'artisan_job' || detail.promoScope === 'both') && (
                <p className="text-gray-500">Service categories: {categoryNames(detail.serviceCategoryIds, serviceCategories)}</p>
              )}
              <p className="text-gray-500">
                Min booking: {detail.minBookingPesewas != null ? formatGhs(detail.minBookingPesewas) : 'none'}
                {' - '}Per {audienceWord}: {detail.maxUsesPerUser ?? 'unlimited'}
                {' - '}Per {audienceWord}/day: {detail.maxUsesPerUserPerDay ?? 'unlimited'}
              </p>
              <p className="text-gray-500">
                {detail.newClientsOnly ? `New ${audienceWord}s only` : `All ${audienceWord}s`}
              </p>
              <p className="text-gray-500">{formatDateTime(detail.startsAt)} -&gt; {formatDateTime(detail.endsAt)}</p>
              {detail.description && <p className="pt-1 text-gray-500">{detail.description}</p>}
              {detail.termsText && (
                <p className="italic text-gray-400">
                  {isProvider ? 'Provider terms' : 'Client terms'}: {detail.termsText}
                </p>
              )}
              <p className="pt-1 text-gray-400">
                Created {formatDateTime(detail.createdAt)}
                {detail.approvedAt ? ` - approved ${formatDateTime(detail.approvedAt)}` : ''}
              </p>
            </div>

            {/* Banner */}
            <section className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
                Banner <span className="normal-case tracking-normal text-gray-400">(1200x480 recommended, JPEG/PNG/WebP, 5MB or less)</span>
              </p>
              {detail.bannerUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={detail.bannerUrl}
                  alt={`${detail.name} banner`}
                  className="aspect-[1200/480] w-full rounded-lg border border-gray-100 object-cover"
                />
              ) : (
                <div className="flex aspect-[1200/480] w-full items-center justify-center rounded-lg border border-dashed border-gray-200 text-xs text-gray-400">
                  No banner uploaded yet.
                </div>
              )}
              <RoleGate permission="manage_promotions">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={PROMO_BANNER_ACCEPTED_TYPES.join(',')}
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) void handleBannerFile(file)
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadingBanner ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                  {detail.bannerUrl ? 'Replace banner' : 'Upload banner'}
                </Button>
              </RoleGate>
            </section>

            {/* Priority + budget line */}
            <p className="text-xs text-gray-400">Banner priority: {detail.bannerPriority}</p>

            {actionError && (
              <ErrorState compact title="That did not work" detail={actionError} />
            )}

            {/* Lifecycle actions */}
            <section className="space-y-2 border-t border-gray-100 pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Actions</p>
              <div className="flex flex-wrap gap-2">
                {detail.status === 'draft' && (
                  <RoleGate permission="manage_promotions">
                    <Button size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={() => onEdit(detail)}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="brand"
                      className="gap-1.5"
                      disabled={busy}
                      onClick={() => void runAction('submit', () => submitPromoCampaign(detail.id))}
                    >
                      {pendingAction === 'submit' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Submit for approval
                    </Button>
                  </RoleGate>
                )}

                {detail.status === 'pending_approval' && (
                  <>
                    <RoleGate permission="manage_promotions">
                      <Button size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={() => onEdit(detail)}>
                        <Pencil className="h-3.5 w-3.5" /> Edit (returns to draft)
                      </Button>
                    </RoleGate>
                    <RoleGate permission="approve_promotions">
                      <Button
                        size="sm"
                        className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                        disabled={busy}
                        onClick={() => void runAction('approve', () => approvePromoCampaign(detail.id))}
                      >
                        {pendingAction === 'approve' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        Approve
                      </Button>
                      <Button size="sm" variant="destructive" className="gap-1.5" disabled={busy} onClick={() => setRejectOpen(true)}>
                        <XCircle className="h-3.5 w-3.5" /> Reject
                      </Button>
                    </RoleGate>
                  </>
                )}

                {(detail.status === 'approved' || canResume) && (
                  <RoleGate permission="manage_promotions">
                    {detail.status === 'approved' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={busy}
                        onClick={() => void runAction('pause', () => pausePromoCampaign(detail.id))}
                      >
                        {pendingAction === 'pause' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />}
                        Pause
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={busy}
                        onClick={() => void runAction('resume', () => resumePromoCampaign(detail.id))}
                      >
                        {pendingAction === 'resume' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                        Resume
                      </Button>
                    )}
                    {detail.status !== 'budget_exhausted' && (
                      <Button size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={() => setRestrictedEditOpen(true)}>
                        <Pencil className="h-3.5 w-3.5" /> Adjust budget / end date
                      </Button>
                    )}
                    <Button size="sm" variant="destructive" className="gap-1.5" disabled={busy} onClick={() => setEndConfirmOpen(true)}>
                      <Ban className="h-3.5 w-3.5" /> End campaign
                    </Button>
                  </RoleGate>
                )}

                {detail.status === 'ended' && (
                  <p className="text-xs italic text-gray-400">
                    This campaign has finished. No further actions are available.
                  </p>
                )}
              </div>
              {detail.status === 'pending_approval' && (
                <p className="text-[10px] text-gray-400">
                  A different admin must approve this campaign - the admin who created it cannot approve it.
                </p>
              )}
              {detail.status === 'budget_exhausted' && (
                <p className="text-[10px] leading-4 text-amber-700">
                  A release or refund can reactivate this campaign automatically after committed budget drops below
                  the cap. If repaired historical drift leaves it stopped, Resume is available only while the campaign
                  window remains open and the backend confirms budget is available.
                </p>
              )}
            </section>
          </div>
        ) : null}
      </DetailSheet>

      {detail && (
        <>
          <ConfirmDialog
            open={rejectOpen}
            onClose={() => setRejectOpen(false)}
            title="Reject this campaign?"
            description="The campaign returns to draft and the creator sees your reason."
            confirmLabel="Reject campaign"
            destructive
            loading={pendingAction === 'reject'}
            requireReason
            minReason={1}
            reasonLabel="Reason"
            reasonPlaceholder="What must change before this can go live?"
            onConfirm={reason => void runAction('reject', () => rejectPromoCampaign(detail.id, reason)).then(() => setRejectOpen(false))}
          />
          <ConfirmDialog
            open={endConfirmOpen}
            onClose={() => setEndConfirmOpen(false)}
            title={`End "${detail.name}" permanently?`}
            description="The campaign stops applying immediately and cannot be resumed. Settled redemptions are unaffected."
            confirmLabel="End campaign"
            destructive
            loading={pendingAction === 'end'}
            onConfirm={() => void runAction('end', () => endPromoCampaign(detail.id)).then(() => setEndConfirmOpen(false))}
          />
          <RestrictedEditDialog
            open={restrictedEditOpen}
            campaign={detail}
            busy={pendingAction === 'restricted-edit'}
            onClose={() => setRestrictedEditOpen(false)}
            onSave={patch => void runAction('restricted-edit', () => updatePromoCampaign(detail.id, patch)).then(() => setRestrictedEditOpen(false))}
          />
        </>
      )}
    </>
  )
}

// Approved/paused campaigns are terms-locked: only raising the budget cap,
// extending the end date and re-ranking the banner are allowed (anything else
// is a 409 PROMO_CAMPAIGN_TERMS_LOCKED on the backend).
function RestrictedEditDialog({
  open, campaign, busy, onClose, onSave,
}: {
  open: boolean
  campaign: PromoCampaign
  busy: boolean
  onClose: () => void
  onSave: (patch: { budgetCapPesewas?: number; endsAt?: string; bannerPriority?: number }) => void
}) {
  const [budgetGhs, setBudgetGhs] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [bannerPriority, setBannerPriority] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setBudgetGhs(pesewasToGhsInput(campaign.budgetCapPesewas))
    setEndsAt('')
    setBannerPriority(String(campaign.bannerPriority))
    setError('')
  }, [open, campaign])

  function save() {
    setError('')
    const patch: { budgetCapPesewas?: number; endsAt?: string; bannerPriority?: number } = {}

    if (budgetGhs.trim()) {
      const pesewas = ghsInputToPesewas(budgetGhs)
      if (!Number.isFinite(pesewas) || pesewas <= 0) { setError('Enter a valid budget cap in GHS.'); return }
      if (campaign.budgetCapPesewas != null && pesewas < campaign.budgetCapPesewas) {
        setError('The budget cap can only be raised, never lowered.')
        return
      }
      if (pesewas !== campaign.budgetCapPesewas) patch.budgetCapPesewas = pesewas
    }

    if (endsAt) {
      const iso = new Date(endsAt)
      if (Number.isNaN(iso.getTime())) { setError('Enter a valid end date.'); return }
      if (iso.getTime() <= Date.parse(campaign.endsAt)) {
        setError('The end date can only be extended beyond the current end.')
        return
      }
      patch.endsAt = iso.toISOString()
    }

    const priority = Number(bannerPriority)
    if (!Number.isInteger(priority) || priority < 0) { setError('Banner priority must be a whole number of 0 or more.'); return }
    if (priority !== campaign.bannerPriority) patch.bannerPriority = priority

    if (Object.keys(patch).length === 0) { onClose(); return }
    onSave(patch)
  }

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Adjust live campaign"
      description="Approved campaigns are terms-locked. Only raising the budget, extending the end date and re-ranking the banner are allowed."
      submitLabel="Save adjustments"
      onSubmit={save}
      loading={busy}
      error={error || null}
    >
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Budget cap (GHS) - raise only</Label>
        <Input type="number" min={0.01} step={0.01} value={budgetGhs} onChange={e => setBudgetGhs(e.target.value)} disabled={busy} />
        <p className="text-[10px] text-gray-400">
          Current: {campaign.budgetCapPesewas != null ? formatGhs(campaign.budgetCapPesewas) : 'uncapped'}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">End date - extend only</Label>
        <Input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} disabled={busy} />
        <p className="text-[10px] text-gray-400">Current: {formatDateTime(campaign.endsAt)}. Leave blank to keep it.</p>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Banner priority</Label>
        <Input type="number" min={0} step={1} value={bannerPriority} onChange={e => setBannerPriority(e.target.value)} disabled={busy} />
      </div>
    </FormDialog>
  )
}
