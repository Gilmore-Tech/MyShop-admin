'use client'

import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { ErrorState } from '@/components/common/error-state'
import { cn } from '@/lib/utils'

const WIDTHS = { sm: 'sm:max-w-[480px]', md: 'sm:max-w-[560px]', lg: 'sm:max-w-[640px]' } as const

/**
 * THE create/edit dialog shell. Fields go in as children; the footer is
 * always Cancel + one primary action (brand gold), with the submit disabled
 * while invalid and a spinner while saving.
 */
export function FormDialog({
  open, onClose, title, description, submitLabel, onSubmit,
  size = 'md', loading = false, disabled = false, error = null, children, footerNote,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: React.ReactNode
  /** Verb-first, e.g. "Create category", "Save changes". */
  submitLabel: string
  onSubmit: () => void
  size?: keyof typeof WIDTHS
  loading?: boolean
  /** Disable submit while the form is invalid. */
  disabled?: boolean
  error?: string | null
  children: React.ReactNode
  /** Small line above the footer (e.g. "A different admin must approve"). */
  footerNote?: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !loading) onClose() }}>
      <DialogContent className={cn('flex max-h-[85vh] flex-col', WIDTHS[size])}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-4">{children}</div>
        {error && <ErrorState compact title="Could not save" detail={error} />}
        {footerNote && <p className="text-[11px] text-gray-400">{footerNote}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="brand" onClick={onSubmit} disabled={loading || disabled} className="gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
