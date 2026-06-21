'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Radio, BadgeCheck, Scale, Users,
  Settings, Car, CreditCard, Megaphone, BarChart3, UserCog,
  ChevronDown, LogOut, ClipboardList, BookOpen, Ticket,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { getOverviewReport, getEmergencyAlerts, getClientKycQueue, getUnassignedJobs, getHighBidQueue, listSessionRecoveryRequests } from '@/lib/api'
import { FEATURES } from '@/lib/api-client'
import { useRole } from '@/hooks/use-role'
import { AUTO_REFRESH_DISABLED } from '@/hooks/use-auto-refresh'
import { type Permission } from '@/lib/roles'

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
    // Hide the whole group if permissions filter out every child
    if (visibleChildren.length === 0) return null

    // A group is "active" when any of its children match the current route
    const groupActive = visibleChildren.some(
      c => pathname === c.href || pathname.startsWith(c.href + '/')
    )
    // Roll up child badges onto the parent when collapsed
    const childBadgeTotal = visibleChildren.reduce((sum, c) => sum + (c.badge ?? 0), 0)
    const parentBadge = (item.badge ?? 0) + (open ? 0 : childBadgeTotal)

    return (
      <div>
        <button
          onClick={() => setOpen(v => !v)}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
            groupActive ? 'bg-orange-50 text-orange-600 font-semibold' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          )}
        >
          <item.icon className={cn('h-4 w-4 shrink-0', groupActive ? 'text-orange-500' : 'text-gray-400')} />
          <span className="flex-1 text-left">{item.title}</span>
          {parentBadge > 0 && <Badge count={parentBadge} variant="red" />}
          <ChevronDown className={cn('h-3.5 w-3.5 text-gray-400 transition-transform', open && 'rotate-180')} />
        </button>
        {open && (
          <div className="ml-[1.4rem] mt-1 mb-1 space-y-0.5 border-l border-gray-100 pl-3">
            {visibleChildren.map(child => {
              const childActive = pathname === child.href || pathname.startsWith(child.href + '/')
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  className={cn(
                    'flex items-center px-2.5 py-1.5 rounded-md text-sm transition-colors',
                    childActive
                      ? 'text-orange-600 font-medium bg-orange-50/60'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  )}
                >
                  <span className="flex-1">{child.title}</span>
                  {child.badge != null && child.badge > 0 && (
                    <Badge count={child.badge} variant={child.badgeVariant ?? 'red'} />
                  )}
                </Link>
              )
            })}
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
  const { can, adminName } = useRole()
  const [pendingVerifications, setPendingVerifications] = useState<number | null>(null)
  const [openDisputes, setOpenDisputes] = useState<number | null>(null)
  const [unacknowledgedEmergencies, setUnacknowledgedEmergencies] = useState<number | null>(null)
  const [pendingClientKyc, setPendingClientKyc] = useState<number | null>(null)
  const [unassignedJobsCount, setUnassignedJobsCount] = useState<number | null>(null)
  const [highBidCount, setHighBidCount] = useState<number | null>(null)
  const [pendingRecoveryCount, setPendingRecoveryCount] = useState<number | null>(null)

  useEffect(() => {
    function loadCounts() {
      getOverviewReport()
        .then(ov => {
          setPendingVerifications(ov.pendingVerifications)
          setOpenDisputes(ov.openDisputes)
        })
        .catch(() => {})
      getEmergencyAlerts()
        .then(alerts => setUnacknowledgedEmergencies(alerts.filter(a => !a.acknowledgedAt).length))
        .catch(() => {})
      getClientKycQueue()
        .then(items => setPendingClientKyc(items.length))
        .catch(() => {})
      getUnassignedJobs()
        .then(res => setUnassignedJobsCount(res.total))
        .catch(() => {})
      if (FEATURES.highBidReview) {
        getHighBidQueue()
          .then(bids => setHighBidCount(bids.length))
          .catch(() => {})
      }
      listSessionRecoveryRequests({ status: 'pending', limit: 1 })
        .then(res => setPendingRecoveryCount(res.total))
        .catch(() => {})
    }
    loadCounts()
    if (AUTO_REFRESH_DISABLED) return
    const id = setInterval(loadCounts, 60_000)
    return () => clearInterval(id)
  }, [])

  // Sidebar is organised into labelled sections; multi-page areas collapse into groups.
  const navSections: { label: string; items: NavItem[] }[] = [
    {
      label: 'Overview',
      items: [
        { title: 'Dashboard',  href: '/dashboard', icon: LayoutDashboard, permission: 'view_dashboard' },
        {
          title: 'Operations', href: '/live-map', icon: Radio,
          children: [
            { title: 'Live Monitoring', href: '/live-map',  permission: 'view_live_map' },
            { title: 'Activity Feed',   href: '/activity',  permission: 'view_activity' },
            { title: 'Emergency Alerts',href: '/emergency', permission: 'view_emergency', badge: unacknowledgedEmergencies ?? undefined },
          ],
        },
        {
          title: 'Insights', href: '/analytics', icon: BarChart3,
          children: [
            { title: 'Analytics', href: '/analytics', permission: 'view_analytics' },
            { title: 'Reports',   href: '/reports',   permission: 'view_reports' },
          ],
        },
      ],
    },
    {
      label: 'Marketplace',
      items: [
        {
          title: 'Trips & Services', href: '/rides', icon: Car, permission: 'view_rides',
          children: [
            { title: 'All Rides',          href: '/rides' },
            { title: 'Artisan Jobs',       href: '/artisan-jobs' },
            { title: 'Manual Assignment',  href: '/artisan-jobs/manual-assignment', badge: unassignedJobsCount ?? undefined, badgeVariant: 'amber' },
            ...(FEATURES.highBidReview
              ? [{ title: 'High Bid Review', href: '/artisan-jobs/high-bid-review', permission: 'review_bid' as const, badge: highBidCount ?? undefined }]
              : []),
            { title: 'Service Categories', href: '/categories', permission: 'view_categories' },
            { title: 'Ride Tiers',         href: '/ride-categories', permission: 'view_ride_categories' },
          ],
        },
        {
          title: 'Payments', href: '/payments', icon: CreditCard, permission: 'view_payments',
          children: [
            { title: 'Transactions',  href: '/payments/transactions' },
            { title: 'Revenue',       href: '/payments/revenue' },
            { title: 'Batch Payouts', href: '/payments/batch-payouts' },
            { title: 'Clawbacks',     href: '/payments/clawbacks' },
          ],
        },
      ],
    },
    {
      label: 'Trust & Safety',
      items: [
        {
          title: 'Verifications', href: '/verifications', icon: BadgeCheck,
          children: [
            { title: 'Verification Queue', href: '/verifications',           permission: 'view_verifications',    badge: pendingVerifications ?? undefined },
            { title: 'Client KYC Queue',   href: '/users/clients/kyc-queue',  permission: 'view_verifications',    badge: pendingClientKyc ?? undefined },
            { title: 'Cancellation Suspensions', href: '/suspensions',        permission: 'view_users' },
            { title: 'Account Recovery',   href: '/account-recovery',         permission: 'view_session_recovery', badge: pendingRecoveryCount ?? undefined },
          ],
        },
        { title: 'Disputes & Incidents', href: '/disputes', icon: Scale, permission: 'view_disputes', badge: openDisputes ?? undefined },
        { title: 'User Management',      href: '/users/clients', icon: Users, permission: 'view_users' },
      ],
    },
    {
      label: 'Engagement',
      items: [
        { title: 'Announcements', href: '/announcements', icon: Megaphone, permission: 'send_announcement' },
        { title: 'Promotions',    href: '/promotions',    icon: Ticket,    permission: 'view_promotions' },
        { title: 'Help Center',   href: '/help/articles', icon: BookOpen,  permission: 'view_help_articles' },
      ],
    },
    {
      label: 'System',
      items: [
        {
          title: 'Configuration', href: '/configuration', icon: Settings,
          children: [
            { title: 'Marketplace Config', href: '/configuration',   permission: 'view_config' },
            { title: 'USSD & SMS Logs',    href: '/ussd',            permission: 'view_ussd' },
            { title: 'System Settings',    href: '/system-settings', permission: 'manage_admins' },
          ],
        },
        { title: 'Audit Logs',      href: '/audit-logs',    icon: ClipboardList, permission: 'view_audit_logs' },
        { title: 'Admin Accounts',  href: '/admin-accounts', icon: UserCog,      permission: 'manage_admins' },
      ],
    },
  ]

  // A section is visible if at least one of its items survives permission filtering.
  function itemVisible(item: NavItem): boolean {
    if (item.children) {
      return item.children.some(c => !c.permission || can(c.permission))
    }
    return !item.permission || can(item.permission)
  }
  const visibleSections = navSections
    .map(s => ({ ...s, items: s.items.filter(itemVisible) }))
    .filter(s => s.items.length > 0)

  // Initials from name
  const initials = adminName
    ? adminName.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
    : '?'

  return (
    <aside className="w-56 shrink-0 h-screen bg-white flex flex-col">
      {/* Logo */}
      <div className="px-5 py-4">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="MyShop" className="w-8 h-8 rounded-lg shrink-0" />
          <div>
            <p className="text-gray-900 font-bold text-sm leading-tight">MyShop</p>
            <p className="text-gray-400 text-xs">Admin Console</p>
          </div>
        </div>
      </div>

      {/* Sectioned Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-5">
        {visibleSections.map(section => (
          <div key={section.label} className="space-y-0.5">
            <p className="text-[10px] font-semibold text-gray-300 uppercase tracking-widest px-3 mb-1.5">
              {section.label}
            </p>
            {section.items.map(item => <NavLink key={item.href} item={item} can={can} />)}
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-3 py-3 space-y-1">
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-gray-50">
          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white text-[11px] font-bold" style={{ backgroundColor: '#F5A623' }}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate leading-tight">{adminName || 'Admin'}</p>
            <p className="text-xs text-gray-400 truncate">Administrator</p>
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
