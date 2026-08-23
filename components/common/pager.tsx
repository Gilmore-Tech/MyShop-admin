'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Prev / Next pagination row with a "Showing a-b of n" caption. */
export function Pager({ page, pageSize, total, onPage, className }: {
  page: number; pageSize: number; total: number; onPage: (p: number) => void; className?: string
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null
  const start = (page - 1) * pageSize
  return (
    <div className={`flex items-center justify-between mt-3 ${className ?? ''}`}>
      <p className="text-xs text-gray-400">
        Showing {start + 1}-{Math.min(start + pageSize, total)} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </Button>
        <span className="text-xs text-gray-500 tabular-nums px-1">Page {page} of {totalPages}</span>
        <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Next <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
