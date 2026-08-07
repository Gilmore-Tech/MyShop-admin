'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, Pencil, ShieldCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRole } from '@/hooks/use-role'
import { updatePromoCampaignSanityLimits, type PromoCampaignSanityLimits } from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { formatGhs } from '@/lib/money'
import { ghsInputToPesewas, pesewasToGhsInput } from '@/lib/promo-campaign-contract'

// Platform-wide guard rails every campaign must fit inside. Values are visible
// to anyone with view_promotions; edits are super_admin role only (the backend
// answers 403 SUPER_ADMIN_REQUIRED for everyone else, so the edit UI is also
// hidden client-side and the error surfaced defensively if it slips through).
export function SanityLimitsCard({
  limits,
  loading,
  onUpdated,
}: {
  limits: PromoCampaignSanityLimits | null
  loading: boolean
  onUpdated: (limits: PromoCampaignSanityLimits) => void
}) {
  const { isSuperAdmin } = useRole()
  const [editing, setEditing] = useState(false)
  const [percent, setPercent] = useState('')
  const [fixedGhs, setFixedGhs] = useState('')
  const [days, setDays] = useState('')
  const [reliefPercent, setReliefPercent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!editing || !limits) return
    setPercent(String(limits.promoMaxDiscountPercent))
    setFixedGhs(pesewasToGhsInput(limits.promoMaxFixedDiscountPesewas))
    setDays(String(limits.promoMaxDurationDays))
    setReliefPercent(String(limits.promoMaxCommissionReliefPercent))
    setError('')
  }, [editing, limits])

  async function save() {
    if (!limits) return
    const nextPercent = Number(percent)
    const nextFixed = ghsInputToPesewas(fixedGhs)
    const nextDays = Number(days)
    const nextRelief = Number(reliefPercent)
    if (!Number.isInteger(nextPercent) || nextPercent < 1 || nextPercent > 100) {
      setError('Max discount percent must be a whole number between 1 and 100.')
      return
    }
    if (!Number.isFinite(nextFixed) || nextFixed <= 0) {
      setError('Max fixed discount must be a positive GHS amount.')
      return
    }
    if (!Number.isInteger(nextDays) || nextDays < 1) {
      setError('Max duration must be a whole number of days.')
      return
    }
    if (!Number.isInteger(nextRelief) || nextRelief < 1 || nextRelief > 100) {
      setError('Max commission relief must be a whole number between 1 and 100.')
      return
    }
    const patch: Partial<PromoCampaignSanityLimits> = {}
    if (nextPercent !== limits.promoMaxDiscountPercent) patch.promoMaxDiscountPercent = nextPercent
    if (nextFixed !== limits.promoMaxFixedDiscountPesewas) patch.promoMaxFixedDiscountPesewas = nextFixed
    if (nextDays !== limits.promoMaxDurationDays) patch.promoMaxDurationDays = nextDays
    if (nextRelief !== limits.promoMaxCommissionReliefPercent) patch.promoMaxCommissionReliefPercent = nextRelief
    if (Object.keys(patch).length === 0) { setEditing(false); return }

    setSaving(true)
    setError('')
    try {
      onUpdated(await updatePromoCampaignSanityLimits(patch))
      setEditing(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update sanity limits.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-4 rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-orange-500" />
          <p className="text-sm font-semibold text-gray-900">Campaign sanity limits</p>
          <span className="text-xs text-gray-400">Hard caps every campaign must fit inside.</span>
        </div>
        {isSuperAdmin && limits && !editing && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        )}
        {editing && (
          <Button variant="ghost" size="sm" className="gap-1 text-gray-400" disabled={saving} onClick={() => setEditing(false)}>
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
        )}
      </div>

      {loading && !limits ? (
        <div className="mt-3 flex items-center gap-2 text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" /> <span className="text-sm">Loading limits…</span>
        </div>
      ) : !limits ? (
        <p className="mt-3 text-sm text-gray-400">Sanity limits are unavailable right now.</p>
      ) : editing ? (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Max discount (%)</Label>
              <Input type="number" min={1} max={100} step={1} value={percent} onChange={e => setPercent(e.target.value)} disabled={saving} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Max fixed discount (GHS)</Label>
              <Input type="number" min={0.01} step={0.01} value={fixedGhs} onChange={e => setFixedGhs(e.target.value)} disabled={saving} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Max duration (days)</Label>
              <Input type="number" min={1} step={1} value={days} onChange={e => setDays(e.target.value)} disabled={saving} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Max commission relief (%)</Label>
              <Input type="number" min={1} max={100} step={1} value={reliefPercent} onChange={e => setReliefPercent(e.target.value)} disabled={saving} />
            </div>
          </div>
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
          <div className="flex justify-end">
            <Button size="sm" disabled={saving} onClick={() => void save()} className="gap-2 text-white" style={{ backgroundColor: '#F5A623' }}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save limits
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <LimitStat label="Max discount" value={`${limits.promoMaxDiscountPercent}%`} />
          <LimitStat label="Max fixed discount" value={formatGhs(limits.promoMaxFixedDiscountPesewas)} />
          <LimitStat label="Max duration" value={`${limits.promoMaxDurationDays} days`} />
          <LimitStat label="Max commission relief" value={`${limits.promoMaxCommissionReliefPercent}%`} />
        </div>
      )}
    </div>
  )
}

function LimitStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-gray-800">{value}</p>
    </div>
  )
}
