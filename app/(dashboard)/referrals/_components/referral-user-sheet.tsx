'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, AlertTriangle, Coins, UserPlus, UserCheck, Hash } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { getUserReferrals, type UserReferralFunnel, type ReferralListItem, type RoleAccountRole } from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { formatDate } from '@/lib/format-date'
import { ReferralStatusBadge, RoleChips, formatPoints } from './referral-shared'

export interface DrilldownTarget {
  role: RoleAccountRole
  roleAccountId: string
  name: string | null
}

function PersonRow({ item, side }: { item: ReferralListItem; side: 'referrer' | 'referee' }) {
  // When showing referrals this user MADE, the counterparty is the referee.
  // When showing who referred this user, the counterparty is the referrer.
  const person = side === 'referee' ? item.referee : item.referrer
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{person.fullName ?? 'Unknown user'}</p>
        <p className="text-xs text-gray-400">{person.phone ?? '—'}</p>
        <div className="mt-1"><RoleChips roles={[person.role]} /></div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <ReferralStatusBadge awarded={item.bonusAwarded} />
        <span className="text-[11px] text-gray-400">{formatDate(item.createdAt)}</span>
        {item.bonusAwarded && (
          <span className="text-[11px] font-medium text-emerald-600">{formatPoints(item.bonusPoints)}</span>
        )}
      </div>
    </div>
  )
}

/**
 * Side panel showing a single user's referral funnel: their code, who they
 * referred (with award status), who referred them, and their current points.
 */
export function ReferralUserSheet({ target, onClose }: { target: DrilldownTarget | null; onClose: () => void }) {
  const [data, setData] = useState<UserReferralFunnel | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const role = target?.role ?? null
  const roleAccountId = target?.roleAccountId ?? null

  const load = useCallback(() => {
    if (!role || !roleAccountId) return
    setLoading(true)
    setError(null)
    getUserReferrals(role, roleAccountId)
      .then(setData)
      .catch(err => {
        setData(null)
        setError(err instanceof ApiError
          ? (err.status === 404 ? 'No referral record found for this user.' : err.message)
          : 'Failed to load the referral funnel.')
      })
      .finally(() => setLoading(false))
  }, [role, roleAccountId])

  useEffect(() => {
    if (role && roleAccountId) load()
    else setData(null)
  }, [role, roleAccountId, load])

  const made = data?.referralsMade ?? []
  const awardedMade = made.filter(r => r.bonusAwarded).length

  return (
    <Sheet open={target !== null} onOpenChange={o => { if (!o) onClose() }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto p-0">
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-gray-100">
          <SheetTitle className="text-base font-semibold text-gray-900">
            {target?.name?.trim() || 'Referral funnel'}
          </SheetTitle>
          <SheetDescription className="text-xs text-gray-400">
            Referral activity for this exact {target?.role} account only.
          </SheetDescription>
        </SheetHeader>

        <div className="px-5 py-4 space-y-5">
          {loading ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading funnel…
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <AlertTriangle className="h-6 w-6 text-red-400" />
              <p className="text-sm text-gray-500 text-center">{error}</p>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={load}>Retry</Button>
            </div>
          ) : data ? (
            <>
              {/* Summary tiles */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-gray-50 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-400 uppercase tracking-wide font-medium">
                    <Hash className="h-3 w-3" /> Code
                  </div>
                  <p className="text-sm font-mono font-semibold text-gray-900 mt-0.5 break-all">
                    {data.referralCode ?? '—'}
                  </p>
                </div>
                <div className="rounded-lg bg-amber-50 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] text-amber-500 uppercase tracking-wide font-medium">
                    <Coins className="h-3 w-3" /> Points
                  </div>
                  <p className="text-sm font-semibold text-amber-700 mt-0.5">
                    {data.loyaltyPointsBalance == null ? 'Unavailable' : data.loyaltyPointsBalance.toLocaleString('en-GH')}
                  </p>
                </div>
              </div>

              {/* Who they referred */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 uppercase tracking-wide">
                    <UserPlus className="h-3.5 w-3.5 text-gray-400" /> Referrals made
                  </h3>
                  <span className="text-[11px] text-gray-400">{awardedMade}/{made.length} awarded</span>
                </div>
                {made.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">This user hasn&apos;t referred anyone yet.</p>
                ) : (
                  <div className="rounded-lg border border-gray-100 px-3">
                    {made.map(r => <PersonRow key={r.id} item={r} side="referee" />)}
                  </div>
                )}
              </div>

              {/* Who referred them */}
              <div>
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
                  <UserCheck className="h-3.5 w-3.5 text-gray-400" /> Referred by
                </h3>
                {data.referralReceived ? (
                  <div className="rounded-lg border border-gray-100 px-3">
                    <PersonRow item={data.referralReceived} side="referrer" />
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 py-2">This user signed up without a referral code.</p>
                )}
              </div>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
