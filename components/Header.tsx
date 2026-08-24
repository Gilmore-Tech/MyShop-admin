'use client'

import { Bell, LogOut, AlertTriangle, ShieldAlert, Flag, BadgeAlert, ServerCrash, HeartPulse, Info, CheckCheck, X, ChevronRight, UserCog } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getAdminUser, clearTokens, type AdminUser } from '@/lib/api-client'
import {
  getAdminNotifications, markAdminNotificationRead, markAllAdminNotificationsRead,
  type AdminNotification, type AdminNotificationType,
} from '@/lib/api'
import { ProfileDialog } from '@/components/admin/profile-dialog'

// ─── Notification helpers ─────────────────────────────────────────────────────

const TYPE_META: Record<AdminNotificationType, { icon: React.ElementType; color: string; bg: string }> = {
  emergency:     { icon: ShieldAlert,   color: 'text-red-500',    bg: 'bg-red-50' },
  welfare_check: { icon: HeartPulse,    color: 'text-amber-500',  bg: 'bg-amber-50' },
  dispute:       { icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-50' },
  verification:  { icon: BadgeAlert,    color: 'text-gray-600',   bg: 'bg-gray-100' },
  flagged:       { icon: Flag,          color: 'text-red-400',    bg: 'bg-red-50' },
  payout_failed: { icon: ServerCrash,   color: 'text-red-500',    bg: 'bg-red-50' },
  system:        { icon: Info,          color: 'text-gray-400',   bg: 'bg-gray-100' },
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ─── Notification panel ───────────────────────────────────────────────────────

function NotificationPanel({
  notifications,
  loading,
  onMarkRead,
  onMarkAllRead,
  onClose,
}: {
  notifications: AdminNotification[] | null
  loading: boolean
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
  onClose: () => void
}) {
  const unreadCount = notifications?.filter(n => !n.readAt).length ?? 0

  return (
    <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl z-50 overflow-hidden flex flex-col max-h-[480px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
          {unreadCount > 0 && (
            <span className="text-xs font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={onMarkAllRead}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded transition-colors"
              title="Mark all as read"
            >
              <CheckCheck className="h-3.5 w-3.5" /> All read
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="h-px bg-gray-100" />

      {/* Body */}
      <div className="overflow-y-auto flex-1">
        {loading ? (
          <div className="divide-y divide-gray-50">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5 pt-0.5">
                  <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" />
                  <div className="h-2.5 bg-gray-100 rounded animate-pulse w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : !notifications || notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Bell className="h-8 w-8 text-gray-200" />
            <p className="text-sm text-gray-400">No notifications</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {notifications.map(n => {
              const meta = TYPE_META[n.type] ?? TYPE_META.system
              const Icon = meta.icon
              const isUnread = !n.readAt
              return (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 px-4 py-3 transition-colors ${isUnread ? 'bg-amber-50/40' : 'hover:bg-gray-50'}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${meta.bg}`}>
                    <Icon className={`h-4 w-4 ${meta.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm leading-snug ${isUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                        {n.title}
                      </p>
                      {isUnread && (
                        <button
                          onClick={() => onMarkRead(n.id)}
                          className="shrink-0 mt-0.5 w-2 h-2 rounded-full bg-primary hover:bg-primary/70 transition-colors"
                          title="Mark as read"
                        />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-gray-400">{timeAgo(n.createdAt)}</span>
                      {n.linkPath && (
                        <Link
                          href={n.linkPath}
                          onClick={onClose}
                          className="text-xs font-medium hover:underline"
                          style={{ color: '#F5A623' }}
                        >
                          View
                          <ChevronRight className="inline h-3 w-3 ml-0.5 align-middle" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function adminInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

// ─── Header ───────────────────────────────────────────────────────────────────

/** "Good morning, Ayiks" + the full date - the app's one greeting (per the approved redesign). */
function Greeting({ name }: { name: string | null }) {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  if (!now) return <div />
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Africa/Accra' }).format(now))
  const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  const firstName = name?.trim().split(' ')[0]
  return (
    <div className="min-w-0">
      <p className="text-sm font-bold text-gray-900 truncate">Good {part}{firstName ? `, ${firstName}` : ''}</p>
      <p className="text-[11px] text-gray-400">
        {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Accra' })}
      </p>
    </div>
  )
}

export default function Header() {
  const router = useRouter()
  const [admin, setAdmin] = useState<AdminUser | null>(null)
  const [notifications, setNotifications] = useState<AdminNotification[] | null>(null)
  const [loadingNotifs, setLoadingNotifs] = useState(true)
  const [panelOpen, setPanelOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setAdmin(getAdminUser())
  }, [])

  useEffect(() => {
    getAdminNotifications()
      .then(setNotifications)
      .catch(() => setNotifications([]))
      .finally(() => setLoadingNotifs(false))
  }, [])

  // Close panel on outside click
  useEffect(() => {
    if (!panelOpen) return
    function handleClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [panelOpen])

  const unreadCount = notifications?.filter(n => !n.readAt).length ?? 0

  function handleMarkRead(id: string) {
    setNotifications(prev =>
      prev ? prev.map(n => n.id === id ? { ...n, readAt: new Date().toISOString() } : n) : prev
    )
    markAdminNotificationRead(id).catch(() => {})
  }

  function handleMarkAllRead() {
    setNotifications(prev =>
      prev ? prev.map(n => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) : prev
    )
    markAllAdminNotificationsRead().catch(() => {})
  }

  function handleLogout() {
    clearTokens()
    router.replace('/login')
  }

  return (
    <header className="bg-white sticky top-0 z-40">
      <div className="h-16 flex items-center px-6 gap-6">
        <Greeting name={admin?.fullName ?? null} />

      <div className="flex items-center gap-3 ml-auto">
        {/* Notification bell */}
        <div className="relative" ref={bellRef}>
          <button
            onClick={() => setPanelOpen(o => !o)}
            className="relative w-9 h-9 rounded-full bg-background flex items-center justify-center text-text-secondary hover:bg-gray-200 transition-colors"
          >
            <Bell className="h-4.5 w-4.5" />
            {!loadingNotifs && unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none px-0.5">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {panelOpen && (
            <NotificationPanel
              notifications={notifications}
              loading={loadingNotifs}
              onMarkRead={handleMarkRead}
              onMarkAllRead={handleMarkAllRead}
              onClose={() => setPanelOpen(false)}
            />
          )}
        </div>

        {/* Admin profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-background transition-colors outline-none">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                <span className="text-white text-xs font-bold">
                  {admin ? adminInitials(admin.fullName) : 'AU'}
                </span>
              </div>
              <div className="hidden lg:block text-left">
                <p className="text-sm font-semibold text-text-primary leading-tight">
                  {admin?.fullName ?? 'Admin User'}
                </p>
                <p className="text-xs text-text-secondary leading-tight">
                  {admin?.email ?? 'Administrator'}
                </p>
              </div>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-48">
            {admin && (
              <>
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium text-text-primary truncate">{admin.fullName}</p>
                  <p className="text-xs text-text-secondary truncate">{admin.email}</p>
                </div>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onSelect={() => setProfileOpen(true)} className="cursor-pointer">
              <UserCog className="mr-2 h-4 w-4" />
              My Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => router.push('/account')}
              className="cursor-pointer"
            >
              <UserCog className="mr-2 h-4 w-4" />
              Account settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={handleLogout}
              className="cursor-pointer"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      </div>

      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </header>
  )
}
