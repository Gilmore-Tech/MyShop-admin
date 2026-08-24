'use client'

import { Fragment, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'

export interface ReportColumn<Row> {
  key: string
  header: ReactNode
  /** Numeric columns should be right-aligned; they also get `tabular-nums`. */
  align?: 'left' | 'right' | 'center'
  render: (row: Row, index: number) => ReactNode
  /** Cell for the totals footer. Omit to leave the footer cell blank. */
  footer?: ReactNode
  /** Extra classes applied to both header and body cells (e.g. `w-40`). */
  className?: string
  /** Hide below a breakpoint: `hidden md:table-cell`. */
  responsiveClassName?: string
}

export interface ReportTableProps<Row> {
  columns: ReportColumn<Row>[]
  rows: Row[]
  rowKey: (row: Row, index: number) => string
  loading?: boolean
  skeletonRows?: number
  /** Shown when `rows` is empty and not loading. */
  empty?: ReactNode
  /** User-safe message; renders the standard error state INSTEAD of the body. */
  error?: string | null
  onRetry?: () => void
  /** Accessible name for interactive rows, e.g. row => `Expand 22 Aug 2026`. */
  rowAriaLabel?: (row: Row) => string
  /** Render a totals row from each column's `footer`. */
  showFooter?: boolean
  footerLabel?: ReactNode
  onRowClick?: (row: Row) => void
  /** When provided, rows toggle an inset panel rendered by this function. */
  renderExpanded?: (row: Row) => ReactNode
  /** Optional short caption under the table (basis, time zone, truncation). */
  caption?: ReactNode
  className?: string
  /** Minimum table width so wide reports scroll inside the card. */
  minWidth?: number
}

const ALIGN = {
  left: 'text-left',
  right: 'text-right tabular-nums',
  center: 'text-center',
} as const

/**
 * Opinionated report table: sticky header, right-aligned numerics, totals
 * footer, skeleton + empty states, optional expandable rows. Lives inside a
 * white card; wide tables scroll within the card rather than the page.
 */
export function ReportTable<Row>({
  columns, rows, rowKey, loading = false, skeletonRows = 6, empty, error = null, onRetry, rowAriaLabel,
  showFooter = false, footerLabel = 'Total',
  onRowClick, renderExpanded, caption, className, minWidth = 640,
}: ReportTableProps<Row>) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const interactive = Boolean(onRowClick || renderExpanded)

  function toggle(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function activate(row: Row, key: string) {
    if (renderExpanded) toggle(key)
    onRowClick?.(row)
  }

  function onRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, row: Row, key: string) {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      activate(row, key)
    }
  }

  const colCount = columns.length + (renderExpanded ? 1 : 0)

  if (error) {
    return (
      <div className={cn('bg-white rounded-xl shadow-sm overflow-hidden', className)}>
        <ErrorState title="Could not load this report" detail={error} onRetry={onRetry} className="m-4" />
      </div>
    )
  }

  return (
    <div className={cn('bg-white rounded-xl shadow-sm overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth }}>
          <thead className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
            <tr>
              {renderExpanded && <th className="w-8 px-2" aria-label="Expand" />}
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
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={`skeleton-${i}`}>
                  {renderExpanded && <td className="px-2 py-3" />}
                  {columns.map(col => (
                    <td key={col.key} className={cn('px-4 py-3', col.responsiveClassName)}>
                      <div className={cn('h-3 bg-gray-100 rounded animate-pulse', col.align === 'right' ? 'w-16 ml-auto' : 'w-28')} />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="p-0">
                  {empty ?? <EmptyState title="No data for this period" />}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const key = rowKey(row, index)
                const isOpen = renderExpanded ? expanded.has(key) : false
                return (
                  <Fragment key={key}>
                    <tr
                      className={cn(
                        interactive && 'cursor-pointer hover:bg-gray-50/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-300',
                        isOpen && 'bg-gray-50/50',
                      )}
                      tabIndex={interactive ? 0 : undefined}
                      aria-label={interactive && rowAriaLabel ? rowAriaLabel(row) : undefined}
                      onClick={interactive ? () => activate(row, key) : undefined}
                      onKeyDown={interactive ? e => onRowKeyDown(e, row, key) : undefined}
                      aria-expanded={renderExpanded ? isOpen : undefined}
                    >
                      {renderExpanded && (
                        <td className="px-2 py-3 text-gray-400">
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </td>
                      )}
                      {columns.map(col => (
                        <td
                          key={col.key}
                          className={cn('px-4 py-3 text-gray-700 whitespace-nowrap', ALIGN[col.align ?? 'left'], col.className, col.responsiveClassName)}
                        >
                          {col.render(row, index)}
                        </td>
                      ))}
                    </tr>
                    {isOpen && renderExpanded && (
                      <tr className="bg-gray-50/40">
                        <td colSpan={colCount} className="px-6 py-3">
                          {renderExpanded(row)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })
            )}
          </tbody>
          {showFooter && !loading && rows.length > 0 && (
            <tfoot className="bg-gray-50 border-t border-gray-100">
              <tr>
                {renderExpanded && <td className="px-2 py-2.5" />}
                {columns.map((col, i) => (
                  <td
                    key={col.key}
                    className={cn('px-4 py-2.5 text-sm font-semibold text-gray-800 whitespace-nowrap', ALIGN[col.align ?? 'left'], col.className, col.responsiveClassName)}
                  >
                    {i === 0 && col.footer == null ? footerLabel : col.footer}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {caption && <p className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-50">{caption}</p>}
    </div>
  )
}
