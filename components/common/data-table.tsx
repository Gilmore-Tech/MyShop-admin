'use client'

import { useRouter } from 'next/navigation'
import type { KeyboardEvent, ReactNode } from 'react'
import { MoreVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { Pager } from '@/components/common/pager'
import { PageSizeSelect } from '@/components/common/table-controls'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export interface DataTableColumn<Row> {
  key: string
  header: ReactNode
  /** Numeric columns should be right-aligned; they also get `tabular-nums`. */
  align?: 'left' | 'right' | 'center'
  render: (row: Row, index: number) => ReactNode
  /** Extra classes on both header and body cells (e.g. `w-40`). */
  className?: string
  /** Hide below a breakpoint: `hidden md:table-cell`. */
  responsiveClassName?: string
}

export interface DataTablePagination {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
  /** When set, a page-size select renders next to the pager. */
  onPageSize?: (size: number) => void
}

const ALIGN = {
  left: 'text-left',
  right: 'text-right tabular-nums',
  center: 'text-center',
} as const

/**
 * THE operational-list table (rides, users, transactions, queues): sticky
 * header, avatar cells, status pills, a kebab row menu, keyboard-operable
 * rows, and built-in loading / error / empty states — an error REPLACES the
 * body, never sits above an "empty" message. For aggregate reports with
 * totals footers and expandable rows use `ReportTable`.
 */
export function DataTable<Row>({
  columns, rows, rowKey, loading = false, skeletonRows = 8,
  error = null, onRetry, empty,
  rowHref, onRowClick, rowMenu, rowAriaLabel,
  pagination, caption, className, minWidth = 720,
}: {
  columns: DataTableColumn<Row>[]
  rows: Row[]
  rowKey: (row: Row, index: number) => string
  loading?: boolean
  skeletonRows?: number
  /** User-safe message; renders the standard error state instead of the body. */
  error?: string | null
  onRetry?: () => void
  empty?: ReactNode
  /** Row becomes a link (keyboard-operable, Enter/Space navigates). */
  rowHref?: (row: Row) => string | null
  onRowClick?: (row: Row) => void
  /** Kebab menu items (DropdownMenuItem list) for the trailing column. */
  rowMenu?: (row: Row) => ReactNode
  /** Accessible name for interactive rows, e.g. row => `Open ride ${id}`. */
  rowAriaLabel?: (row: Row) => string
  pagination?: DataTablePagination
  caption?: ReactNode
  className?: string
  minWidth?: number
}) {
  const router = useRouter()
  const interactive = Boolean(rowHref || onRowClick)

  function activate(row: Row) {
    if (onRowClick) onRowClick(row)
    else if (rowHref) {
      const href = rowHref(row)
      if (href) router.push(href)
    }
  }

  function onRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, row: Row) {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      activate(row)
    }
  }

  const colCount = columns.length + (rowMenu ? 1 : 0)

  return (
    <div className={cn('bg-white rounded-xl shadow-sm overflow-hidden', className)}>
      {error ? (
        <ErrorState title="Could not load this list" detail={error} onRetry={onRetry} className="m-4" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth }}>
            <thead className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
              <tr>
                {columns.map(col => (
                  <th
                    key={col.key}
                    scope="col"
                    className={cn(
                      'px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap',
                      ALIGN[col.align ?? 'left'],
                      col.className,
                      col.responsiveClassName,
                    )}
                  >
                    {col.header}
                  </th>
                ))}
                {rowMenu && <th scope="col" className="w-10 px-2"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: skeletonRows }).map((_, i) => (
                  <tr key={`skeleton-${i}`}>
                    {columns.map(col => (
                      <td key={col.key} className={cn('px-4 py-3.5', col.responsiveClassName)}>
                        <div className={cn('h-3.5 bg-gray-100 rounded animate-pulse', col.align === 'right' ? 'w-16 ml-auto' : 'w-28')} />
                      </td>
                    ))}
                    {rowMenu && <td className="px-2" />}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="p-0">
                    {empty ?? <EmptyState title="Nothing here yet" />}
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr
                    key={rowKey(row, index)}
                    tabIndex={interactive ? 0 : undefined}
                    aria-label={interactive && rowAriaLabel ? rowAriaLabel(row) : undefined}
                    onClick={interactive ? () => activate(row) : undefined}
                    onKeyDown={interactive ? e => onRowKeyDown(e, row) : undefined}
                    className={cn(
                      interactive &&
                        'cursor-pointer hover:bg-gray-50/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-300',
                    )}
                  >
                    {columns.map(col => (
                      <td
                        key={col.key}
                        className={cn('px-4 py-3 text-gray-700 whitespace-nowrap', ALIGN[col.align ?? 'left'], col.className, col.responsiveClassName)}
                      >
                        {col.render(row, index)}
                      </td>
                    ))}
                    {rowMenu && (
                      <td className="px-2 text-center" onClick={e => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Row actions">
                              <MoreVertical className="h-4 w-4 text-gray-400" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">{rowMenu(row)}</DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      {!error && (caption || pagination) && (
        <div className="border-t border-gray-50 px-4 py-2 flex items-center gap-3 flex-wrap">
          {caption && <p className="text-[11px] text-gray-400 flex-1 min-w-0">{caption}</p>}
          {pagination && !loading && (
            <div className="ml-auto flex items-center gap-3">
              {pagination.onPageSize && (
                <PageSizeSelect value={pagination.pageSize} onChange={pagination.onPageSize} />
              )}
              <Pager
                page={pagination.page}
                pageSize={pagination.pageSize}
                total={pagination.total}
                onPage={pagination.onPage}
                className="mt-0"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Standard person cell: initials avatar + name + secondary line. */
export function AvatarCell({ name, sub, size = 30 }: { name: string | null | undefined; sub?: ReactNode; size?: number }) {
  const display = name && name.trim().length > 0 ? name : 'Not provided'
  const initials = display
    .split(' ')
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <span className="flex items-center gap-2.5 min-w-0">
      <span
        className="rounded-full bg-gray-200 text-gray-600 flex items-center justify-center font-bold shrink-0"
        style={{ width: size, height: size, fontSize: Math.max(10, Math.floor(size / 3)) }}
        aria-hidden
      >
        {initials}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-800 truncate">{display}</span>
        {sub && <span className="block text-xs text-gray-500 truncate">{sub}</span>}
      </span>
    </span>
  )
}
