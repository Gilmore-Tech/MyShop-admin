'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Radio, BadgeCheck, Scale, Users,
  Settings, Smartphone, ShieldCheck, Car,
  CreditCard, Megaphone, BarChart3, UserCog, ChevronDown, LogOut,
  LineChart, Tag,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { getOverviewReport } from '@/lib/api'
import { useRole } from '@/hooks/use-role'
import { ROLE_LABELS, type Permission } from '@/lib/roles'

type ChildItem = { title: string; href: string; permission?: Permission; badge?: number; badgeVariant?: 'red' | 'amber' }

type NavItem = {
  title: string
  href: string
  icon: React.ElementType
  badge?: number
  permission?: Permission
  children?: ChildItem[]
}

function Badge({ count, variant = 'red' }: { count: number; variant?: 'red' | 'amber' }) {
  if (count <= 0) return null
  const colours = variant === 'amber'
    ? 'bg-amber-400 text-white'
    : 'bg-red-500 text-white'
  return (
    <span className={`${colours} text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none min-w-[18px] text-center`}>
      {count > 99 ? '99+' : count}
    </span>
  )
}

function NavLink({ item, can }: { item: NavItem; can: (p: Permission) => boolean }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(() =>
    item.children?.some(c => pathname.startsWith(c.href)) ?? false
  )
  const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'))
    || (item.href === '/users/clients' && pathname.startsWith('/users'))

  if (item.children) {
    const visibleChildren = item.children.filter(c => !c.permission || can(c.permission))
    // Roll up child badges onto the parent when collapsed
    const childBadgeTotal = visibleChildren.reduce((sum, c) => sum + (c.badge ?? 0), 0)
    const parentBadge = (item.badge ?? 0) + (open ? 0 : childBadgeTotal)

    return (
      <div>
        <button
          onClick={() => setOpen(v => !v)}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
            isActive ? 'bg-orange-50 text-orange-500 font-medium' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
          )}
        >
          <item.icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-orange-500' : 'text-gray-400')} />
          <span className="flex-1 text-left">{item.title}</span>
          {parentBadge > 0 && <Badge count={parentBadge} variant="red" />}
          <ChevronDown className={cn('h-3 w-3 text-gray-400 transition-transform', open && 'rotate-180')} />
        </button>
        {open && (
          <div className="ml-6 mt-0.5 space-y-0.5 pl-3">
            {visibleChildren.map(child => (
              <Link
                key={child.href}
                href={child.href}
                className={cn(
                  'flex items-center px-2 py-1.5 rounded text-sm transition-colors',
                  pathname === child.href || pathname.startsWith(child.href + '/')
                    ? 'text-orange-500 font-medium'
                    : 'text-gray-400 hover:text-gray-700'
                )}
              >
                <span className="flex-1">{child.title}</span>
                {child.badge != null && child.badge > 0 && (
                  <Badge count={child.badge} variant={child.badgeVariant ?? 'red'} />
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
        isActive ? 'bg-orange-50 text-orange-500 font-medium' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
      )}
    >
      <item.icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-orange-500' : 'text-gray-400')} />
      <span className="flex-1">{item.title}</span>
      {item.badge != null && item.badge > 0 && <Badge count={item.badge} variant="red" />}
    </Link>
  )
}

export default function AppSidebar() {
  const { can, role, adminName } = useRole()
  const [pendingVerifications, setPendingVerifications] = useState<number | null>(null)
  const [openDisputes, setOpenDisputes] = useState<number | null>(null)

  useEffect(() => {
    getOverviewReport()
      .then(ov => {
        setPendingVerifications(ov.pendingVerifications)
        setOpenDisputes(ov.openDisputes)
      })
      .catch(() => {})
  }, [])

  const primaryNav: NavItem[] = [
    { title: 'Dashboard',            href: '/dashboard',     icon: LayoutDashboard, permission: 'view_dashboard' },
    { title: 'Analytics',            href: '/analytics',     icon: LineChart,        permission: 'view_analytics' },
    { title: 'Live Monitoring',      href: '/live-map',      icon: Radio,            permission: 'view_live_map' },
    { title: 'Verification Queue',   href: '/verifications', icon: BadgeCheck,       permission: 'view_verifications', badge: pendingVerifications ?? undefined },
    { title: 'Disputes & Incidents', href: '/disputes',      icon: Scale,            permission: 'view_disputes',      badge: openDisputes ?? undefined },
    { title: 'User Management',      href: '/users/clients', icon: Users,            permission: 'view_users' },
    { title: 'Marketplace Config',   href: '/configuration', icon: Settings,         permission: 'view_config' },
    { title: 'USSD & SMS Logs',      href: '/ussd',          icon: Smartphone,       permission: 'view_ussd' },
    { title: 'System Settings',      href: '/admin-accounts',icon: ShieldCheck,      permission: 'manage_admins' },
  ]

  const secondaryNav: NavItem[] = [
    {
      title: 'Trips & Rides', href: '/rides', icon: Car, permission: 'view_rides',
      children: [
        { title: 'All Rides',         href: '/rides' },
        { title: 'Artisan Jobs',      href: '/artisan-jobs' },
        { title: 'Manual Assignment', href: '/artisan-jobs/manual-assignment' },
        { title: 'High Bid Review',   href: '/artisan-jobs/high-bid-review', permission: 'review_bid' },
      ],
    },
    { title: 'Service Categories', href: '/categories',    icon: Tag,      permission: 'view_categories' },
    {
      title: 'Payments', href: '/payments', icon: CreditCard, permission: 'view_payments',
      children: [
        { title: 'Transactions',  href: '/payments/transactions' },
        { title: 'Revenue',       href: '/payments/revenue' },
        { title: 'Batch Payouts', href: '/payments/batch-payouts' },
        { title: 'Clawbacks',     href: '/payments/clawbacks' },
      ],
    },
    { title: 'Announcements', href: '/announcements', icon: Megaphone, permission: 'send_announcement' },
    { title: 'Reports',       href: '/reports',       icon: BarChart3, permission: 'view_reports' },
    { title: 'Admin Accounts',href: '/admin-accounts',icon: UserCog,   permission: 'manage_admins' },
  ]

  const visiblePrimary = primaryNav.filter(item => !item.permission || can(item.permission))
  const visibleSecondary = secondaryNav.filter(item => !item.permission || can(item.permission))

  // Initials from name
  const initials = adminName
    ? adminName.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
    : '?'

  const roleLabel = role ? ROLE_LABELS[role] : 'Admin'

  return (
    <aside className="w-56 shrink-0 h-screen bg-white flex flex-col">
      {/* Logo */}
      <div className="px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: '#F5A623' }}>
            <span className="text-white font-bold text-sm">M</span>
          </div>
          <div>
            <p className="text-gray-900 font-bold text-sm leading-tight">MyShop</p>
            <p className="text-gray-400 text-xs">Admin Console</p>
          </div>
        </div>
      </div>

      {/* Primary Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        {visiblePrimary.map(item => <NavLink key={item.href} item={item} can={can} />)}

        {/* Divider + secondary nav */}
        {visibleSecondary.length > 0 && (
          <div className="pt-3 mt-2">
            <p className="text-[10px] font-semibold text-gray-300 uppercase tracking-widest px-3 mb-2">More</p>
            {visibleSecondary.map(item => <NavLink key={item.href} item={item} can={can} />)}
          </div>
        )}
      </nav>

      {/* User footer */}
      <div className="px-3 py-3 space-y-1">
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-gray-50">
          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white text-[11px] font-bold" style={{ backgroundColor: '#F5A623' }}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate leading-tight">{adminName || 'Admin'}</p>
            <p className="text-xs text-gray-400 truncate">{roleLabel}</p>
          </div>
        </div>
        <Link href="/login">
          <button className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors text-sm">
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </Link>
        <p className="text-center text-[10px] text-gray-300 pt-1">MyShop Admin v1.0</p>
      </div>
    </aside>
  )
}
