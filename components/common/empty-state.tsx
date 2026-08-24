import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Illustration-free empty/unavailable state: icon, message, optional CTA.
 * Use `variant="unavailable"` for the 404 "backend not deployed yet" case so
 * it reads differently from "no data in this range".
 */
export function EmptyState({
  icon: Icon = Inbox, title, description, action, variant = 'empty', className,
}: {
  icon?: React.ElementType
  title: string
  description?: ReactNode
  action?: ReactNode
  variant?: 'empty' | 'unavailable'
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center px-6 py-12', className)}>
      <div className={cn('w-10 h-10 rounded-full flex items-center justify-center mb-3', variant === 'unavailable' ? 'bg-amber-50' : 'bg-gray-100')}>
        <Icon className={cn('h-5 w-5', variant === 'unavailable' ? 'text-amber-500' : 'text-gray-400')} />
      </div>
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {description && <p className="text-xs text-gray-400 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
