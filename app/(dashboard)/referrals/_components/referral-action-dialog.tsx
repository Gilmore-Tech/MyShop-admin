'use client'

import { useState, useEffect } from 'react'
import { Loader2, AlertTriangle, Gift, Undo2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { voidReferralBonus, awardReferral, type ReferralListItem } from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { formatPoints } from './referral-shared'

export type ReferralAction = 'void' | 'award'

const VOID_MIN_REASON = 10

// Friendly copy for the API error codes the void/award endpoints can return.
function mapActionError(err: unknown, action: ReferralAction): string {
  if (err instanceof ApiError) {
    if (err.status === 409) {
      return action === 'void'
        ? 'This referral is not in an awarded state, so there is nothing to void.'
        : 'This referral has already been awarded.'
    }
    if (err.status === 404) return 'This referral no longer exists. Refresh the list.'
    return err.message
  }
  return action === 'void' ? 'Failed to void the bonus. Please try again.' : 'Failed to award the bonus. Please try again.'
}

/**
 * Confirm dialog for the two management actions. "Void" requires a reason
 * (min 10 chars); "Award" is a plain confirm. On success calls onDone so the
 * parent can invalidate the list + metrics queries.
 */
export function ReferralActionDialog({
  referral, action, onClose, onDone,
}: {
  referral: ReferralListItem | null
  action: ReferralAction | null
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = referral !== null && action !== null

  // Reset transient state whenever a new target opens.
  useEffect(() => {
    if (open) { setReason(''); setError(null); setSubmitting(false) }
  }, [open, referral?.id, action])

  if (!referral || !action) return null

  const reasonTrimmed = reason.trim()
  const reasonValid = action !== 'void' || reasonTrimmed.length >= VOID_MIN_REASON

  async function handleConfirm() {
    if (!referral || !action || !reasonValid) return
    setSubmitting(true)
    setError(null)
    try {
      if (action === 'void') {
        await voidReferralBonus(referral.id, reasonTrimmed)
      } else {
        await awardReferral(referral.id)
      }
      onDone()
    } catch (err) {
      setError(mapActionError(err, action))
    } finally {
      setSubmitting(false)
    }
  }

  const referrerName = referral.referrer.fullName?.trim() || 'the referrer'

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !submitting) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-gray-900">
            {action === 'void'
              ? <><Undo2 className="h-5 w-5 text-red-500" /> Void referral bonus</>
              : <><Gift className="h-5 w-5 text-emerald-500" /> Award referral bonus</>}
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-500">
            {action === 'void' ? (
              <>
                Reverses the {formatPoints(referral.bonusPoints)} bonus credited to <strong>{referrerName}</strong>,
                deducts the points from their balance (floored at 0), and records a compensating loyalty
                transaction. This is audit-logged.
              </>
            ) : (
              <>
                Manually credits the referral bonus to <strong>{referrerName}</strong> for referral{' '}
                <span className="font-mono">{referral.referralCode}</span>, bypassing the first-activity
                check. This is audit-logged.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {action === 'void' && (
          <div className="space-y-1.5">
            <Label htmlFor="void-reason" className="text-xs font-medium text-gray-600">
              Reason <span className="text-gray-400">(required, min {VOID_MIN_REASON} characters)</span>
            </Label>
            <Textarea
              id="void-reason"
              value={reason}
              onChange={e => { setReason(e.target.value); setError(null) }}
              rows={3}
              maxLength={500}
              disabled={submitting}
              placeholder="e.g. Awarded in error - referee account was a duplicate test profile."
              className="resize-none text-sm"
            />
            <div className="flex items-center justify-between">
              <span className={`text-[11px] ${reasonTrimmed.length < VOID_MIN_REASON ? 'text-gray-400' : 'text-emerald-600'}`}>
                {reasonTrimmed.length}/{VOID_MIN_REASON} min
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 text-xs rounded-lg px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <DialogFooter>
          <Button size="sm" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button
            size="sm"
            className="gap-1.5 text-white"
            style={{ backgroundColor: action === 'void' ? '#EB5757' : '#27AE60' }}
            disabled={submitting || !reasonValid}
            onClick={handleConfirm}
          >
            {submitting
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : action === 'void' ? <Undo2 className="h-3.5 w-3.5" /> : <Gift className="h-3.5 w-3.5" />}
            {action === 'void' ? 'Void bonus' : 'Award now'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
