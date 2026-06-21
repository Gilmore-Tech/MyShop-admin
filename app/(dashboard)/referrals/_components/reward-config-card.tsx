'use client'

import { useState, useEffect, useCallback } from 'react'
import { Gift, Loader2, Save, RotateCcw, Pencil } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { RoleGate } from '@/components/common/role-gate'
import { getAllConfig, updateConfig } from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { formatGhs } from '@/lib/money'

const BONUS_KEY = 'referral_bonus_pesewas'
const PER_POINT_KEY = 'loyalty_ghs_per_point_pesewas'
const DEFAULT_BONUS = 100      // GHS 1.00
const DEFAULT_PER_POINT = 10   // 10 pesewas / point

// Equivalent loyalty points a bonus is worth, given the pesewas-per-point rate.
function pointsFor(bonusPesewas: number, perPointPesewas: number): number | null {
  if (!perPointPesewas || perPointPesewas <= 0) return null
  return Math.floor(bonusPesewas / perPointPesewas)
}

/**
 * Settings card surfacing the platform reward amount (`referral_bonus_pesewas`).
 * Reads both the bonus and the points-conversion rate from the platform-config
 * endpoint, shows the GHS + equivalent-point value, and lets a config editor
 * change the bonus inline (PATCH /config/referral_bonus_pesewas).
 */
export function RewardConfigCard() {
  const [bonus, setBonus] = useState<number>(DEFAULT_BONUS)
  const [perPoint, setPerPoint] = useState<number>(DEFAULT_PER_POINT)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')           // pesewas, as typed
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setLoadError(false)
    getAllConfig()
      .then(items => {
        const map = new Map(items.map(i => [i.key, i.value]))
        const b = Number(map.get(BONUS_KEY))
        const p = Number(map.get(PER_POINT_KEY))
        setBonus(Number.isFinite(b) && map.has(BONUS_KEY) ? b : DEFAULT_BONUS)
        setPerPoint(Number.isFinite(p) && p > 0 ? p : DEFAULT_PER_POINT)
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  function startEdit() {
    setDraft(String(bonus))
    setSaveError(null)
    setSavedFlash(false)
    setEditing(true)
  }

  const draftNum = Number(draft)
  const draftValid = draft.trim() !== '' && Number.isFinite(draftNum) && draftNum >= 0 && Number.isInteger(draftNum)

  async function handleSave() {
    if (!draftValid) return
    setSaving(true)
    setSaveError(null)
    try {
      await updateConfig(BONUS_KEY, String(draftNum))
      setBonus(draftNum)
      setEditing(false)
      setSavedFlash(true)
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not update the reward amount.')
    } finally {
      setSaving(false)
    }
  }

  const points = pointsFor(bonus, perPoint)
  const draftPoints = draftValid ? pointsFor(draftNum, perPoint) : null

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3 border-b border-gray-50">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
            <Gift className="h-4 w-4 text-amber-500" />
          </span>
          <div>
            <CardTitle className="text-sm font-semibold text-gray-900">Referral reward</CardTitle>
            <CardDescription className="text-[11px] mt-0.5">
              Bonus credited to the referrer on the referee&apos;s first completed activity
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-5">
        {loading ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading reward config…
          </div>
        ) : loadError ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-500">Couldn&apos;t load the reward config.</p>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={load}>Retry</Button>
          </div>
        ) : editing ? (
          <div className="space-y-3">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="space-y-1">
                <label htmlFor="referral-bonus" className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                  Bonus (pesewas)
                </label>
                <Input
                  id="referral-bonus"
                  type="number"
                  min={0}
                  step={1}
                  value={draft}
                  autoFocus
                  onChange={e => { setDraft(e.target.value); setSaveError(null) }}
                  className="w-40 h-9 text-sm"
                />
              </div>
              <p className="text-sm text-gray-600 pb-2">
                = <span className="font-semibold text-gray-900">{draftValid ? formatGhs(draftNum) : '—'}</span>
                {draftPoints != null && <span className="text-gray-400"> · {draftPoints.toLocaleString('en-GH')} pts</span>}
              </p>
            </div>
            {saveError && <p className="text-xs text-red-500">{saveError}</p>}
            <p className="text-[11px] text-gray-400">
              Stored as integer pesewas. Points use the current rate of {formatGhs(perPoint)} per point.
              Change applies to new awards only.
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="gap-1.5 text-white"
                style={{ backgroundColor: draftValid && !saving ? '#F5A623' : undefined }}
                disabled={!draftValid || saving}
                onClick={handleSave}
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save
              </Button>
              <Button size="sm" variant="ghost" className="gap-1.5 text-gray-500" disabled={saving} onClick={() => setEditing(false)}>
                <RotateCcw className="h-3.5 w-3.5" /> Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-2xl font-bold text-gray-900">{formatGhs(bonus)}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                ≈ {points != null ? `${points.toLocaleString('en-GH')} loyalty points` : 'points rate unavailable'}
                {' '}· {formatGhs(perPoint)}/pt
                {savedFlash && <span className="text-emerald-600 font-medium"> · Saved</span>}
              </p>
            </div>
            <RoleGate permission="view_config">
              <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={startEdit}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            </RoleGate>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
