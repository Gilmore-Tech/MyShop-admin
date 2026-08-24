'use client'

import type { ReactNode } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

const WIDTHS = { md: 'w-full sm:max-w-[480px]', lg: 'w-full sm:max-w-[640px]', xl: 'w-full sm:max-w-4xl' } as const

/**
 * THE right-hand drawer. `md` (480px) for read-only summaries, `lg` (640px)
 * for drawers with work in them (document review, approvals), `xl` only for
 * dense drill-downs with wide tables. Sticky header carries who/what plus a
 * status; actions live in a sticky footer. Confirmations inside a drawer
 * still use `ConfirmDialog`.
 */
export function DetailSheet({
  open, onClose, title, subtitle, status, size = 'md', footer, children,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  /** Status badge(s) shown beside the title. */
  status?: ReactNode
  size?: keyof typeof WIDTHS
  /** Sticky action row at the bottom. */
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <Sheet open={open} onOpenChange={o => { if (!o) onClose() }}>
      <SheetContent side="right" className={cn(WIDTHS[size], 'flex flex-col gap-0 overflow-hidden p-0')}>
        <SheetHeader className="border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <SheetTitle className="flex-1 min-w-0 truncate">{title}</SheetTitle>
            {status && <div className="flex items-center gap-1.5 shrink-0 mr-6">{status}</div>}
          </div>
          {subtitle && <SheetDescription>{subtitle}</SheetDescription>}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer && (
          <div className="border-t border-gray-100 px-6 py-3.5 flex items-center gap-2 bg-white">
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
