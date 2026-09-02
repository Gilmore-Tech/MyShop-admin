'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ErrorState } from '@/components/common/error-state'

/**
 * THE confirm dialog. One pattern for every confirmation in the app:
 * - the title asks the question ("Write off GHS 42.00?")
 * - the body states the consequence in plain words
 * - the confirm button names the action (never "OK" / "Confirm")
 * - the cancel button is always "Cancel"
 * - destructive actions get a solid red confirm button
 * - actions that need an audit trail collect a reason (default minimum 5
 *   characters, trimmed - pass `minReason` only where the API demands more)
 */
export function ConfirmDialog({
  open, onClose, title, description, confirmLabel, onConfirm,
  destructive = false, loading = false, error = null,
  requireReason = false, minReason = 5, maxReason, reasonLabel = 'Reason (kept in the audit log)',
  reasonPlaceholder, initialReason = '', children,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: React.ReactNode
  /** Verb-first action label, e.g. "Write off GHS 42.00". */
  confirmLabel: string
  onConfirm: (reason: string) => void
  destructive?: boolean
  loading?: boolean
  error?: string | null
  requireReason?: boolean
  minReason?: number
  maxReason?: number
  reasonLabel?: string
  reasonPlaceholder?: string
  initialReason?: string
  /** Extra content between the description and the reason box (e.g. a summary row). */
  children?: React.ReactNode
}) {
  const [reason, setReason] = useState(initialReason)
  useEffect(() => {
    if (open) setReason(initialReason)
  }, [open, initialReason])

  const trimmed = reason.trim()
  const reasonOk = !requireReason || (
    trimmed.length >= minReason && (maxReason == null || trimmed.length <= maxReason)
  )

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !loading) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        {requireReason && (
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{reasonLabel}</Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={reasonPlaceholder ?? `Say why - minimum ${minReason} characters`}
              rows={3}
              maxLength={maxReason}
              disabled={loading}
            />
            <p className="text-[11px] text-gray-400">
              {trimmed.length} characters - minimum {minReason}{maxReason == null ? '' : `, maximum ${maxReason}`}
            </p>
          </div>
        )}
        {error && <ErrorState compact title="That did not work" detail={error} />}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button
            variant={destructive ? 'destructive' : 'brand'}
            onClick={() => onConfirm(trimmed)}
            disabled={loading || !reasonOk}
            className="gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
