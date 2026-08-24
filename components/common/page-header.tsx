import { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  /**
   * Tab strip rendered directly under the title row (usually `<PageTabs>`),
   * so a page's identity and its sibling navigation never drift apart.
   */
  tabs?: ReactNode
}

export function PageHeader({ title, subtitle, actions, tabs }: PageHeaderProps) {
  return (
    <div className={tabs ? 'mb-6 space-y-4' : 'mb-6'}>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 leading-tight">{title}</h1>
          {subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {tabs}
    </div>
  )
}
