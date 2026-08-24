'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

export interface PageTabItem {
  label: string
  href: string
}

/**
 * Link tabs between sibling PAGES (each tab is a route). The active tab comes
 * from the pathname, so pages just declare the set. For switching data views
 * WITHIN one page use `SegmentedControl` instead — these two are the only tab
 * patterns in the app.
 */
export function PageTabs({ items, className }: { items: PageTabItem[]; className?: string }) {
  const pathname = usePathname()
  const active = items.find(item => pathname === item.href || pathname.startsWith(item.href + '/'))?.href
    ?? items[0]?.href

  return (
    <Tabs value={active} className={className}>
      <TabsList className="bg-white flex-wrap h-auto">
        {items.map(item => (
          <TabsTrigger key={item.href} value={item.href} asChild>
            <Link href={item.href}>{item.label}</Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
