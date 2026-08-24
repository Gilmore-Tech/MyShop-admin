import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * Page-level loading placeholders. The house rule is skeletons, never
 * spinners - `Loader2` is for the inside of a busy button only.
 */
export function PageSkeleton({ variant = 'table', className }: {
  variant?: 'stats' | 'table' | 'cards' | 'chart' | 'form'
  className?: string
}) {
  if (variant === 'stats') {
    return (
      <div className={cn('grid grid-cols-2 lg:grid-cols-4 gap-3', className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm p-4 space-y-2">
            <Skeleton className="h-7 w-24 bg-gray-100" />
            <Skeleton className="h-3 w-32 bg-gray-100" />
          </div>
        ))}
      </div>
    )
  }
  if (variant === 'cards') {
    return (
      <div className={cn('grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4', className)}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full bg-gray-100" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-32 bg-gray-100" />
                <Skeleton className="h-3 w-20 bg-gray-100" />
              </div>
            </div>
            <Skeleton className="h-3 w-full bg-gray-100" />
            <Skeleton className="h-3 w-2/3 bg-gray-100" />
          </div>
        ))}
      </div>
    )
  }
  if (variant === 'chart') {
    return (
      <div className={cn('bg-white rounded-xl shadow-sm p-5 space-y-3', className)}>
        <Skeleton className="h-4 w-48 bg-gray-100" />
        <Skeleton className="h-52 w-full bg-gray-100" />
      </div>
    )
  }
  if (variant === 'form') {
    return (
      <div className={cn('bg-white rounded-xl shadow-sm p-6 space-y-4', className)}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-28 bg-gray-100" />
            <Skeleton className="h-9 w-full max-w-md bg-gray-100" />
          </div>
        ))}
      </div>
    )
  }
  // table
  return (
    <div className={cn('bg-white rounded-xl shadow-sm overflow-hidden', className)}>
      <div className="bg-gray-50 border-b border-gray-100 px-4 py-3">
        <Skeleton className="h-3 w-64 bg-gray-200/70" />
      </div>
      <div className="divide-y divide-gray-50">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 px-4 py-3.5">
            <Skeleton className="h-3.5 w-40 bg-gray-100" />
            <Skeleton className="h-3.5 w-24 bg-gray-100" />
            <Skeleton className="h-3.5 w-28 bg-gray-100 hidden md:block" />
            <Skeleton className="h-3.5 w-16 bg-gray-100 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}
